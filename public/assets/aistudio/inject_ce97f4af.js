'use strict';
// Runs in the PAGE context (not the isolated content-script world) so it can
// hook fetch / XHR / MSE / <video>. Modern players load HLS/DASH manifests or
// media via JS and often leave only a blob: URL on the <video>. By watching the
// actual network calls the player makes, we surface the real media URL.
(function () {
  // 防重复注入：现在既由 manifest 以 document_start + world:MAIN 注入（最早、最可靠），
  // content.js 也会兜底注入一次；谁先跑谁装钩子，后者直接退出，避免二次包裹 fetch/XHR。
  if (window.__freedmInjected) return;
  window.__freedmInjected = true;

  const M3U8 = /\.(m3u8|mpd)/i;               // 流清单：只要URL里出现 .m3u8/.mpd 就认
  const MEDIA_FILE = /\.(mp4|m4v|webm|mkv|mov|flv|avi|m4a|mp3|aac|ogg|wav|opus)(\?|#|$)/i;
  const MEDIA_MIME = /(mpegurl|dash\+xml|video\/|audio\/)/i;
  const seen = new Set();

  const post = (url, mime) => {
    try {
      if (!url || typeof url !== 'string') return;
      if (url.startsWith('blob:') || url.startsWith('data:')) return;
      const isM3u8 = M3U8.test(url) || /(mpegurl|dash\+xml)/i.test(mime || '');
      // 分片(.ts/.m4s)太吵，不报——但 m3u8/mpd 清单永远报
      if (!isM3u8 && /\.(ts|m4s)(\?|$)/i.test(url)) return;
      const isMedia = isM3u8 || MEDIA_FILE.test(url) || MEDIA_MIME.test(mime || '');
      if (!isMedia) return;
      if (seen.has(url)) return;
      seen.add(url);
      window.postMessage({ __freedm: true, url: String(url), mime: mime || '' }, '*');
    } catch (e) {}
  };

  // ---- 抖音：从接口返回里按 aweme_id 建「作品id → 真实播放地址」表 ----
  // 抖音网页是 blob(MSE) 播放、CDN 地址不含作品id、且会预加载后面几个视频，
  // 单靠嗅探/最近一条无法对应点击的视频。这里直接读抖音详情/feed 接口的返回，
  // 按 aweme_id 精确建表，交给 content-script 用 modal_id 查表，100% 对应点击的视频。
  const DOUYIN_API = /\/aweme\/v1\/web\//i;
  const normUrl = (u) => {
    if (typeof u !== 'string') return null;
    if (u.startsWith('//')) u = 'https:' + u;
    u = u.replace(/^http:\/\//i, 'https://');
    return /^https:\/\//.test(u) ? u : null;
  };
  // 从一个 video 对象里收集所有可用播放地址（同时兼容接口的 snake_case 和前端状态的 camelCase，
  // 以及 playApi/playAddr 两种形态）。默认清晰度(play_addr/playApi)排在最前，作为首选。
  function bestPlayUrls(video) {
    if (!video || typeof video !== 'object') return [];
    const out = [];
    const pushList = (l) => { if (Array.isArray(l)) for (const u of l) { const n = normUrl(typeof u === 'string' ? u : (u && (u.src || u.url))); if (n) out.push(n); } };
    const pushAddr = (a) => { if (a && typeof a === 'object') { pushList(a.url_list); pushList(a.urlList); } };
    const pushStr = (s) => { const n = normUrl(s); if (n) out.push(n); };
    try {
      // 1) 默认清晰度优先
      pushAddr(video.play_addr); pushAddr(video.playAddr);
      pushStr(video.play_api); pushStr(video.playApi);
      pushAddr(video.play_addr_h264); pushAddr(video.playAddrH264);
      pushAddr(video.play_addr_265); pushAddr(video.playAddr265);
      // 2) 各码率
      const brs = video.bit_rate || video.bitRateList || video.bitrateList;
      if (Array.isArray(brs)) for (const b of brs) { if (!b) continue; pushAddr(b.play_addr || b.playAddr); pushStr(b.play_api || b.playApi); }
      // 3) 下载地址兜底
      pushAddr(video.download_addr); pushAddr(video.downloadAddr);
      pushStr(video.playUrl); pushStr(video.play_url);
    } catch (e) {}
    return [...new Set(out)];
  }
  function awemeIdOf(node) { return node && (node.aweme_id || node.awemeId); }
  function collectAwemeMap(root) {
    const map = {};
    const visit = (a) => {
      if (!a || typeof a !== 'object') return;
      const node = a.aweme ? a.aweme : a;            // 有些 feed 项把作品包在 .aweme 里
      const id = awemeIdOf(node);
      const vid = node.video;
      if (id && vid) {
        const urls = bestPlayUrls(vid);
        if (urls.length) map[String(id)] = urls;
      }
    };
    try {
      if (root.aweme_detail) visit(root.aweme_detail);
      if (root.awemeDetail) visit(root.awemeDetail);
      if (Array.isArray(root.aweme_list)) root.aweme_list.forEach(visit);
      if (Array.isArray(root.awemeList)) root.awemeList.forEach(visit);
      if (Array.isArray(root.data)) root.data.forEach(visit);
      if (awemeIdOf(root) && root.video) visit(root);
    } catch (e) {}
    return map;
  }
  function dbg() {
    return (window.__freedmDY = window.__freedmDY || { endpoints: [], keys: [], updates: 0, globals: [] });
  }
  function reportDouyinMap(map) {
    try {
      const keys = map && Object.keys(map);
      if (!keys || !keys.length) return;
      window.postMessage({ __freedm_douyin: true, map }, '*');
      const d = dbg(); d.updates++;
      for (const k of keys) if (!d.keys.includes(k)) { d.keys.push(k); if (d.keys.length > 200) d.keys.shift(); }
    } catch (e) {}
  }
  function reportDouyinFromText(text) {
    if (!text || text.length > 8e6) return;
    let obj; try { obj = JSON.parse(text); } catch (e) { return; }
    const map = collectAwemeMap(obj);
    // 兜底：接口结构多变，深扫整个响应，任何位置的 aweme 都收进来
    try { deepCollectAweme(obj, map); } catch (e) {}
    reportDouyinMap(map);
  }

  // 直接深扫页面运行时状态(_ROUTER_DATA 等)里的作品数据——抖音首屏/当前这批视频
  // 往往是 SSR 注入到运行时状态里的，并不走我们钩的 XHR/fetch 接口。inject.js 在页面
  // 环境，能直接读这些全局对象。深度/节点数都设上限，避免卡顿与环引用。
  function deepCollectAweme(root, map, budgetMax) {
    let budget = budgetMax || 40000;
    const stack = [[root, 0]];
    const seen = new Set();
    while (stack.length) {
      if (budget-- <= 0) break;
      const item = stack.pop();
      const node = item[0], depth = item[1];
      if (!node || typeof node !== 'object' || depth > 16) continue;
      if (seen.has(node)) continue;
      seen.add(node);
      try {
        const id = awemeIdOf(node), vid = node.video;
        if (id && vid && typeof vid === 'object') {
          const urls = bestPlayUrls(vid);
          if (urls.length) map[String(id)] = urls;
        }
      } catch (e) {}
      for (const k in node) {
        try { const v = node[k]; if (v && typeof v === 'object') stack.push([v, depth + 1]); } catch (e) {}
      }
    }
  }
  function scanDouyinGlobals() {
    try {
      if (!/(^|\.)douyin\.com$/i.test(location.hostname)) return;
      const map = {};
      const keys = ['_ROUTER_DATA', '__INITIAL_STATE__', '__INIT_PROPS__', '__PACE_DATA__', '_SSR_DATA', 'RENDER_DATA', '__NEXT_DATA__'];
      const d = dbg();
      for (const key of keys) {
        try {
          if (window[key]) {
            if (!d.globals.includes(key)) d.globals.push(key);
            deepCollectAweme(window[key], map);
          }
        } catch (e) {}
      }
      reportDouyinMap(map);
    } catch (e) {}
  }

  // 读取当前“激活”视频节点的 React 内部数据(fiber)，抠出它这个作品的播放地址。
  // 抖音 feed 的视频地址不走可钩的接口（走 worker），也不在全局状态里，但前端把作品对象
  // 挂在了对应视频组件的 props 上——从 DOM 元素的 __reactFiber$ 入口向上找即可拿到。
  function getReactFiber(el) {
    if (!el) return null;
    for (const k in el) {
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) return el[k];
    }
    return null;
  }
  function scanActiveDouyinFiber() {
    try {
      if (!/(^|\.)douyin\.com$/i.test(location.hostname)) return;
      // 找“当前激活”的视频：优先 data-active 容器里正在播放的 video
      const vids = [].slice.call(document.querySelectorAll('video'));
      let v = null;
      try { v = document.querySelector('[data-active="true"] video'); } catch (e) {}
      if (!v) v = vids.filter(function (x) { return !x.paused && x.currentTime > 0; })[0] || vids[0];
      if (!v) return;
      const item = (v.closest && v.closest('[data-e2e="feed-item"]')) || v.parentElement || v;
      let fiber = getReactFiber(item) || getReactFiber(v);
      const map = {};
      let hops = 0;
      while (fiber && hops++ < 40 && !Object.keys(map).length) {
        for (const key of ['memoizedProps', 'pendingProps', 'memoizedState']) {
          try { const p = fiber[key]; if (p && typeof p === 'object') deepCollectAweme(p, map, 6000); } catch (e) {}
        }
        fiber = fiber.return;
      }
      reportDouyinMap(map);
    } catch (e) {}
  }

  // 1) hook fetch（含响应 content-type 补判）
  const _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function (input, init) {
      let u;
      try { u = typeof input === 'string' ? input : (input && input.url); post(u); } catch (e) {}
      return _fetch.apply(this, arguments).then((resp) => {
        try {
          const ct = resp.headers && resp.headers.get && resp.headers.get('content-type');
          if (ct && MEDIA_MIME.test(ct)) post(resp.url || u, ct);
        } catch (e) {}
        // 抖音接口返回 → 克隆读 body 建表（克隆后不影响页面自身消费）
        try {
          const ru = resp.url || u;
          if (ru && DOUYIN_API.test(ru)) {
            try { const d = dbg(); if (d.endpoints.length < 40) d.endpoints.push(String(ru).slice(0, 140)); } catch (e) {}
            resp.clone().text().then(reportDouyinFromText).catch(() => {});
          }
        } catch (e) {}
        return resp;
      });
    };
  }

  // 2) hook XHR（open 拿 URL；load 后拿 content-type）
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      this.__freedmUrl = url;
      post(url);
      this.addEventListener('load', function () {
        try {
          const ct = this.getResponseHeader && this.getResponseHeader('content-type');
          if (ct && MEDIA_MIME.test(ct)) post(this.__freedmUrl, ct);
        } catch (e) {}
        // 抖音接口返回 → 读 body 建表
        try {
          if (this.__freedmUrl && DOUYIN_API.test(this.__freedmUrl)) {
            try { const d = dbg(); if (d.endpoints.length < 40) d.endpoints.push(String(this.__freedmUrl).slice(0, 140)); } catch (e) {}
            const rt = this.responseType;
            if (rt === '' || rt === 'text') reportDouyinFromText(this.responseText);
            else if (rt === 'json' && this.response) reportDouyinMap(collectAwemeMap(this.response));
          }
        } catch (e) {}
      });
    } catch (e) {}
    return _open.apply(this, arguments);
  };

  // 3) 扫描 <video>/<audio> 的真实 src（有些直接设直链）
  function scanMediaEl(el) {
    try {
      const src = el.currentSrc || el.src || '';
      if (src && !src.startsWith('blob:')) post(src);
      el.querySelectorAll && el.querySelectorAll('source').forEach((s) => {
        const ss = s.src || s.getAttribute('src') || '';
        if (ss) post(ss, s.type || '');
      });
    } catch (e) {}
  }
  function scanAll() { try { document.querySelectorAll('video, audio').forEach(scanMediaEl); } catch (e) {} }
  let scans = 0;
  const iv = setInterval(() => { scanAll(); if (++scans > 15) { clearInterval(iv); setInterval(scanAll, 5000); } }, 2000);
  if (document.readyState !== 'loading') scanAll();
  else document.addEventListener('DOMContentLoaded', scanAll);

  // 4) MutationObserver：动态插入的播放器立即扫
  try {
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'VIDEO' || n.tagName === 'AUDIO') scanMediaEl(n);
        else if (n.querySelectorAll) n.querySelectorAll('video, audio').forEach(scanMediaEl);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // 5) 扫描页面源码里直接写死的媒体地址（很多站把 m3u8 直接放在 HTML/JS 里，
  //    如 jable.tv 的 var hlsUrl='https://...m3u8'）。从整页 HTML 用正则提取。
  function scanSource() {
    try {
      const html = document.documentElement ? document.documentElement.outerHTML : '';
      if (!html) return;
      // 匹配 http(s) 开头、以 .m3u8/.mpd/.mp4 等结尾（可带 query）的完整 URL
      const re = /https?:\/\/[^\s"'<>()\\]+?\.(m3u8|mpd|mp4|m4v|webm|mkv|mov|flv|m4a|mp3|aac)(\?[^\s"'<>()\\]*)?/gi;
      let mm, count = 0;
      while ((mm = re.exec(html)) && count < 50) {
        count++;
        let u = mm[0];
        // 反转义常见的 \/ 和 &amp;
        u = u.replace(/\\\//g, '/').replace(/&amp;/g, '&');
        post(u);
      }
    } catch (e) {}
  }
  // 源码扫描：加载后扫几次（有些 m3u8 是脚本执行后才写进 DOM 的）
  let ss = 0;
  const ssiv = setInterval(() => { scanSource(); if (++ss > 8) clearInterval(ssiv); }, 1500);
  if (document.readyState !== 'loading') scanSource();
  else document.addEventListener('DOMContentLoaded', scanSource);

  // 6) 抖音：周期性建「作品id → 播放地址」表。
  //    主力是读“当前激活视频”的 React fiber（feed 视频地址只在这里能拿到）；
  //    同时兼扫运行时全局状态（首屏/部分页面有用）。随滑动持续刷新，表会累积当前看过的视频。
  if (/(^|\.)douyin\.com$/i.test(location.hostname)) {
    const scanBoth = () => { try { scanActiveDouyinFiber(); } catch (e) {} try { scanDouyinGlobals(); } catch (e) {} };
    setInterval(scanBoth, 1200);
    if (document.readyState !== 'loading') scanBoth();
    else document.addEventListener('DOMContentLoaded', scanBoth);
  }
})();
