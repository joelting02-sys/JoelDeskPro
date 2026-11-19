'use strict';
// Detects media the network sniffer can't see: <video>/<audio> with direct
// src, <source> children, and MSE/blob streams. Reports to the background worker.
(function () {
  const seen = new Set();
  // 悬浮下载按钮是否被用户用 ✕ 关闭（仅本次浏览有效，刷新后恢复）。
  // 声明在顶层作用域，便于 SPA 路由切换时（notifyUrlChange）重置。
  let dismissed = false;

  function report(items) {
    if (!items.length) return;
    try { chrome.runtime.sendMessage({ type: 'domMedia', items, tabId: null }); } catch (e) {}
  }

  // 后台在 TDM 未运行时，让当前页面用 <a> 点击的方式打开 tdmfast:// 协议把软件调起来。
  // 页内点击 a[href=tdmfast://] 能触发外部协议（并弹出"打开 TDM Fast?"确认框），
  // 且不会让当前页面跳走——比后台新开标签页可靠得多。仅在顶层框架执行，避免 iframe 重复触发。
  try {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!msg || msg.type !== 'openProtocol' || !msg.url) return;
      if (window.top !== window.self) { if (reply) reply({ ok: false, reason: 'subframe' }); return; }
      try {
        const a = document.createElement('a');
        a.href = msg.url;
        a.style.display = 'none';
        (document.body || document.documentElement).appendChild(a);
        a.click();
        setTimeout(() => { try { a.remove(); } catch (e) {} }, 1500);
        if (reply) reply({ ok: true });
      } catch (e) { if (reply) reply({ ok: false }); }
      return true;
    });
  } catch (e) {}

  // Inject the page-context hook (fetch/XHR/MSE manifest discovery)
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('inject.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}

  // Receive manifest URLs discovered by the page hook
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || !ev.data.__freedm) return;
    const u = ev.data.url;
    if (!u || seen.has(u)) return;
    seen.add(u);
    report([{ url: u, mime: ev.data.mime || '', title: document.title, pageUrl: location.href }]);
  });

  // 抖音：inject.js 从接口返回里建的「作品id → 真实播放地址」表。
  // 下载抖音视频时用当前作品的 modal_id 查这张表，精确对应点击的视频（不受预加载干扰）。
  const douyinPlayMap = Object.create(null);  // aweme_id(字符串) -> [url, ...]
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || !ev.data.__freedm_douyin) return;
    const m = ev.data.map || {};
    for (const k in m) { if (Array.isArray(m[k]) && m[k].length) douyinPlayMap[k] = m[k]; }
  });

  function scan() {
    const items = [];
    const pageUrl = location.href;
    const title = document.title;
    document.querySelectorAll('video, audio').forEach((el) => {
      const urls = [];
      if (el.src) urls.push(el.src);
      el.querySelectorAll('source').forEach((s) => { if (s.src) urls.push(s.src); });
      // currentSrc catches what the browser actually resolved
      if (el.currentSrc) urls.push(el.currentSrc);
      for (const u of urls) {
        if (!u || seen.has(u)) continue;
        seen.add(u);
        items.push({ url: u, mime: el.getAttribute('type') || '', title, pageUrl, isBlob: u.startsWith('blob:') });
      }
    });
    report(items);
  }

  // ---- SPA route detection ----
  // X/Reddit 等单页应用 change routes with pushState/replaceState. The background
  // worker's webNavigation listeners are unreliable for these, so watch the URL
  // from inside the page and report changes directly. This is what actually
  // clears the previous video's entry when clicking through posts.
  let lastHref = location.href;
  function notifyUrlChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    seen.clear(); // media found on the previous route is no longer relevant
    dismissed = false; // 换页/换视频后恢复下载按钮（关闭只对上一个视图生效）
    try {
      chrome.runtime.sendMessage({
        type: 'spaNavigate', url: location.href, title: document.title,
      });
    } catch (e) {}
    setTimeout(scan, 800); // let the new route render its player
  }

  // Patch history so we hear about programmatic navigation.
  for (const fn of ['pushState', 'replaceState']) {
    const orig = history[fn];
    if (typeof orig === 'function') {
      history[fn] = function () {
        const r = orig.apply(this, arguments);
        setTimeout(notifyUrlChange, 0);
        return r;
      };
    }
  }
  window.addEventListener('popstate', () => setTimeout(notifyUrlChange, 0));
  window.addEventListener('hashchange', () => setTimeout(notifyUrlChange, 0));
  // Poll as a final safety net: some frameworks bypass the History API.
  setInterval(notifyUrlChange, 700);

  // The document title often lands after the route change; report it once it
  // settles so the filename isn't the stale "(21) 主页 X".
  let lastTitle = document.title;
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(() => {
      if (document.title === lastTitle) return;
      lastTitle = document.title;
      try {
        chrome.runtime.sendMessage({
          type: 'titleUpdate', url: location.href, title: document.title,
        });
      } catch (e) {}
    }).observe(titleEl, { childList: true });
  }

  // ============================================================
  // IDM-style floating "download this video" button.
  // Shows in the top-right corner of any <video> on hover.
  // Only in the top frame — injecting into every iframe would spawn
  // duplicate/misplaced buttons and can't position against the main viewport.
  // ============================================================
  if (window.top === window.self) {
  const OVERLAY_ID = 'freedm-video-overlay';
  let overlayEl = null;
  let overlayTarget = null;   // the <video> the button currently belongs to
  let hideTimer = null;
  // dismissed 在 IIFE 顶层声明（见文件开头）：✕ 关闭后本次浏览不再显示，
  // 刷新（content.js 重新注入）或 SPA 换页（notifyUrlChange）都会恢复。
  let lastCursor = { x: NaN, y: NaN };   // last known cursor pos (for post resolution)
  let overlayCursor = { x: NaN, y: NaN }; // cursor pos when overlay was last shown
  const DEBUG = false;                    // set true to trace URL resolution in console
  function log(...args) { if (DEBUG) try { console.log('[TDM]', ...args); } catch (e) {} }

  function isDownloadableVideo(v) {
    if (!(v instanceof HTMLVideoElement)) return false;
    const r = v.getBoundingClientRect();
    // ignore tiny/hidden players (ads pixels, 0-size autoplay probes)
    if (r.width < 120 || r.height < 80) return false;
    if (v.readyState === 0 && !v.currentSrc && !v.querySelector('source')) return false;
    return true;
  }

  function buildOverlay() {
    if (overlayEl) return overlayEl;
    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.innerHTML = `
      <button type="button" class="freedm-dl-btn" title="使用 TDM 下载此视频">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M12 3v10.5M12 13.5l-4-4M12 13.5l4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 19h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
        <span>下载该视频</span>
      </button>
      <button type="button" class="freedm-close-btn" title="关闭下载按钮（刷新页面后恢复）" aria-label="关闭">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        </svg>
      </button>`;
    // inline styles so no external CSS is needed and page styles can't bleed in
    const s = el.style;
    s.position = 'fixed';
    s.zIndex = '2147483647';
    s.display = 'none';
    s.pointerEvents = 'auto';
    // 整体做成一行：下载按钮 + 关闭按钮
    Object.assign(el.style, { alignItems: 'center', gap: '4px' });
    const btn = el.querySelector('.freedm-dl-btn');
    Object.assign(btn.style, {
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '7px 12px', border: 'none', borderRadius: '8px',
      background: 'linear-gradient(135deg,#2f7be0,#1e5fc0)', color: '#fff',
      font: '600 13px/1 "Microsoft YaHei",system-ui,sans-serif', cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
      transition: 'transform .12s, box-shadow .12s',
    });
    btn.onmouseenter = () => { btn.style.transform = 'translateY(-1px)'; btn.style.boxShadow = '0 6px 18px rgba(0,0,0,.45)'; };
    btn.onmouseleave = () => { btn.style.transform = 'none'; btn.style.boxShadow = '0 4px 14px rgba(0,0,0,.35)'; };
    btn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      triggerDownload(overlayTarget);
      btn.querySelector('span').textContent = '已发送 ✓';
      setTimeout(() => { if (btn.querySelector('span')) btn.querySelector('span').textContent = '下载该视频'; }, 1800);
    };
    // ✕ 关闭按钮：本次浏览隐藏，刷新后恢复
    const closeBtn = el.querySelector('.freedm-close-btn');
    Object.assign(closeBtn.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '24px', height: '24px', padding: '0', border: 'none', borderRadius: '50%',
      background: 'rgba(0,0,0,.55)', color: '#fff', cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(0,0,0,.35)', flex: '0 0 auto',
      transition: 'background .12s',
    });
    closeBtn.onmouseenter = () => { closeBtn.style.background = 'rgba(200,40,40,.9)'; };
    closeBtn.onmouseleave = () => { closeBtn.style.background = 'rgba(0,0,0,.55)'; };
    closeBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      dismissed = true;
      clearTimeout(hideTimer);
      if (overlayEl) overlayEl.style.display = 'none';
    };
    // keep visible while hovering the button itself
    el.onmouseenter = () => { clearTimeout(hideTimer); };
    el.onmouseleave = () => scheduleHide();
    (document.body || document.documentElement).appendChild(el);
    overlayEl = el;
    return el;
  }

  function positionOverlay(video) {
    const el = buildOverlay();
    const r = video.getBoundingClientRect();
    el.style.display = 'flex';
    el.style.top = Math.max(6, r.top + 10) + 'px';
    // right-align inside the video, clamped to viewport
    const w = el.offsetWidth || 130;
    el.style.left = Math.min(window.innerWidth - w - 6, r.right - w - 10) + 'px';
  }

  function showOverlayFor(video) {
    if (dismissed) return;                 // 用户本次浏览已关闭按钮
    if (!isDownloadableVideo(video)) return;
    clearTimeout(hideTimer);
    overlayTarget = video;
    positionOverlay(video);
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (overlayEl) overlayEl.style.display = 'none'; }, 600);
  }

  // 页内轻提示（用于"直播不支持"等情况，避免把坏链接发给软件再弹错）
  let _toastEl = null, _toastTimer = null;
  function showToast(msg) {
    try {
      if (!_toastEl) {
        _toastEl = document.createElement('div');
        Object.assign(_toastEl.style, {
          position: 'fixed', left: '50%', top: '28px', transform: 'translateX(-50%)',
          zIndex: '2147483647', maxWidth: '80vw', padding: '10px 16px', borderRadius: '10px',
          background: 'rgba(20,20,20,.92)', color: '#fff', font: '600 14px/1.4 "Microsoft YaHei",system-ui,sans-serif',
          boxShadow: '0 6px 20px rgba(0,0,0,.4)', pointerEvents: 'none', textAlign: 'center',
        });
        (document.body || document.documentElement).appendChild(_toastEl);
      }
      _toastEl.textContent = msg;
      _toastEl.style.display = 'block';
      clearTimeout(_toastTimer);
      _toastTimer = setTimeout(() => { if (_toastEl) _toastEl.style.display = 'none'; }, 3500);
    } catch (e) {}
  }

  // In a feed (x.com/home, a profile, search results...) one page holds many
  // videos, so location.href is NOT the video's URL. Find the specific post's
  // permalink for the clicked video so the desktop app gets a post URL, not "/home".
  function isPermalinkPage() {
    return /\/status\/\d+/.test(location.pathname) ||       // x / twitter
      /\/watch\b/.test(location.pathname) ||                 // /watch 形式
      location.pathname.startsWith('/shorts/') ||            // /shorts 形式
      /\/video\//.test(location.pathname) ||                 // tiktok, reddit
      /\/(p|reel|tv)\//.test(location.pathname);             // instagram
  }

  // From a tweet <article>, get the canonical status URL. The most reliable
  // anchor is the timestamp: a <time> element wrapped in an <a href=".../status/N">.
  function statusUrlFromArticle(article) {
    if (!article) return null;
    // 1) timestamp link (points to THIS tweet, never a quoted/reply one)
    const timeA = article.querySelector('a[href*="/status/"] time');
    if (timeA) {
      const a = timeA.closest('a[href*="/status/"]');
      const m = a && a.getAttribute('href').match(/\/[^/]+\/status\/\d+/);
      if (m) return location.origin + m[0];
    }
    // 2) any status link that is NOT inside a quoted tweet (role="link" nested block)
    const links = [...article.querySelectorAll('a[href*="/status/"]')];
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (/\/analytics$|\/likes$|\/retweets$|\/quotes$/.test(href)) continue; // skip metric links
      const m = href.match(/\/[^/]+\/status\/\d+/);
      if (m) return location.origin + m[0];
    }
    return null;
  }

  // 抖音：从点击的视频定位到它的作品 id，拼成标准 https://www.douyin.com/video/<id>。
  // 抖音 feed/推荐页一页有很多视频，location.href 不是该视频的地址（可能是 live 直播间或
  // 带 api_path 的接口地址），必须精确取到被点视频的 aweme id，否则会下错视频/报 Unsupported。
  function douyinAwemeId(video) {
    const bad = /live\.douyin|api_path|webcast/i;
    // 1) 当前路径就是 /video/<id>
    let m = location.pathname.match(/\/video\/(\d{6,})/);
    if (m) return m[1];
    // 2) feed 弹层的 modal_id=<id>
    try { const mid = new URLSearchParams(location.search).get('modal_id'); if (mid && /^\d{6,}$/.test(mid)) return mid; } catch (e) {}
    // 3) 从被点视频向上找：data 属性里的 aweme id，或容器内指向 /video/<id> 的链接
    if (video) {
      let p = video;
      for (let d = 0; p && d < 30; d++, p = p.parentElement) {
        if (!p.getAttribute) continue;
        for (const attr of ['data-e2e-aweme-id', 'data-aweme-id', 'data-video-id', 'data-id']) {
          const v = p.getAttribute(attr);
          if (v && /^\d{15,}$/.test(v)) return v;
        }
        const a = p.querySelector && p.querySelector('a[href*="/video/"]');
        if (a) {
          const href = a.getAttribute('href') || '';
          const am = href.match(/\/video\/(\d{6,})/);
          if (am && !bad.test(href)) return am[1];
        }
      }
    }
    // 4) 兜底：页面上任意一个 /video/<id> 链接（排除直播/接口链接）
    for (const a of document.querySelectorAll('a[href*="/video/"]')) {
      const href = a.getAttribute('href') || '';
      const am = href.match(/\/video\/(\d{6,})/);
      if (am && !bad.test(href)) return am[1];
    }
    return null;
  }

  function resolvePostUrl(video, clientX, clientY) {
    const dyHost = /(^|\.)douyin\.com$/i.test(location.hostname);
    if (dyHost) {
      const id = douyinAwemeId(video);
      if (id) return 'https://www.douyin.com/video/' + id;
      // 定位不到作品 id：若在直播间，明确不支持；否则退回当前页（可能是 /video 页）
      if (/(^|\.)live\.douyin\.com$/i.test(location.hostname)) return 'DOUYIN_LIVE_UNSUPPORTED';
      if (/api_path|webcast/i.test(location.href)) return 'DOUYIN_LIVE_UNSUPPORTED';
      return location.href.split('?')[0];
    }

    if (isPermalinkPage()) return location.href;

    const host = location.hostname.replace(/^www\./, '');
    const isX = /(^|\.)x\.com$/.test(host) || /twitter\.com$/.test(host);
    const isYT = /youtube\.com$/.test(host) || /youtu\.be$/.test(host);

    if (isX) {
      // Strategy A: the <article> that contains the video element.
      let art = video && video.closest && video.closest('article');
      let url = statusUrlFromArticle(art);
      if (url) { log('resolved via video article:', url); return url; }

      // Strategy B: the <article> under the cursor position (covers cases where
      // the video sits in an overlay/portal outside the article subtree).
      if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const stack = document.elementsFromPoint(clientX, clientY);
        for (const el of stack) {
          const a2 = el.closest && el.closest('article');
          url = statusUrlFromArticle(a2);
          if (url) { log('resolved via cursor article:', url); return url; }
        }
      }

      // Strategy C: nearest article by vertical position to the video.
      if (video) {
        const vr = video.getBoundingClientRect();
        let best = null, bestDist = Infinity;
        for (const a of document.querySelectorAll('article')) {
          const r = a.getBoundingClientRect();
          if (r.height === 0) continue;
          const overlap = !(vr.bottom < r.top || vr.top > r.bottom);
          const dist = overlap ? 0 : Math.min(Math.abs(vr.top - r.top), Math.abs(vr.top - r.bottom));
          if (dist < bestDist) { bestDist = dist; best = a; }
        }
        url = statusUrlFromArticle(best);
        if (url) { log('resolved via nearest article:', url); return url; }
      }
      log('X: could not resolve a status URL, falling back to page URL');
    }

    if (isYT && video) {
      const cont = video.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer');
      const a = cont && cont.querySelector('a#thumbnail[href*="watch"], a[href*="/watch?v="], a[href*="/shorts/"]');
      if (a) {
        const href = a.getAttribute('href');
        return href.startsWith('http') ? href : location.origin + href;
      }
    }

    // TikTok：从最近的 data-video-id 属性或嵌入代码(blockquote.tiktok-embed cite)
    // 提取具体视频链接。TikTok 的 feed/foryou 页 URL 不含视频ID，必须这样取。
    const isTT = /tiktok\.com$/.test(host);
    if (isTT) {
      // 1) 从视频元素向上找带 data-video-id 的容器
      if (video) {
        let p = video;
        for (let d = 0; p && d < 25; d++, p = p.parentElement) {
          if (!p.getAttribute) continue;
          const vid = p.getAttribute('data-video-id') || p.getAttribute('data-e2e-video-id')
            || p.getAttribute('data-scroll-index-id') || p.id && (/(\d{15,})/.exec(p.id)||[])[1];
          if (vid && /^\d{10,}$/.test(vid)) {
            const a = p.querySelector && p.querySelector('a[href*="/@"]');
            const m = a && /\/@([\w.-]+)/.exec(a.getAttribute('href') || '');
            const author = (m && m[1]) || 'user';
            return 'https://www.tiktok.com/@' + author + '/video/' + vid;
          }
        }
      }
      // 2) 页面 canonical / og:url（TikTok 视频页几乎都有，最可靠）
      const canon = document.querySelector('link[rel="canonical"]');
      const ogurl = document.querySelector('meta[property="og:url"]');
      for (const cand of [canon && canon.href, ogurl && ogurl.content]) {
        const cm = cand && /\/@([\w.-]+)\/video\/(\d+)/.exec(cand);
        if (cm) return 'https://www.tiktok.com/@' + cm[1] + '/video/' + cm[2];
      }
      // 3) tiktok-embed 嵌入块（cite 或 data-video-id）
      const bq = document.querySelector('blockquote.tiktok-embed[cite], blockquote.tiktok-embed[data-video-id]');
      if (bq) {
        const cm = /\/@([\w.-]+)\/video\/(\d+)/.exec(bq.getAttribute('cite') || '');
        if (cm) return 'https://www.tiktok.com/@' + cm[1] + '/video/' + cm[2];
        const vid = bq.getAttribute('data-video-id');
        if (vid && /^\d+$/.test(vid)) return 'https://www.tiktok.com/@user/video/' + vid;
      }
      // 4) 页面里任意 /@user/video/id 链接
      for (const link of document.querySelectorAll('a[href*="/video/"]')) {
        const lm = /\/@([\w.-]+)\/video\/(\d+)/.exec(link.getAttribute('href') || '');
        if (lm) return 'https://www.tiktok.com/@' + lm[1] + '/video/' + lm[2];
      }
    }

    // generic fallback for other platforms
    if (video) {
      let p = video.parentElement;
      for (let d = 0; p && d < 20; d++, p = p.parentElement) {
        const a = p.querySelector && p.querySelector('a[href*="/status/"],a[href*="/watch?v="],a[href*="/video/"],a[href*="/shorts/"]');
        if (a) {
          const href = a.getAttribute('href');
          const full = href.startsWith('http') ? href : location.origin + href;
          return full.split('?')[0];
        }
      }
    }
    return location.href; // give up → page URL (correct on permalink pages)
  }

  // 从嗅探到的资源里挑出抖音「当前视频」的真实 CDN 地址。
  // 抖音网页是 blob(MSE) 播放、页面无 play_addr、常规解析又被 a_bogus 签名挡住(403)，
  // 但浏览器播放时真实视频地址(douyinvod/zjcdn 的 .mp4)会被嗅探到且能直接多线程下载。
  // 同一页面可能嗅到多条(不同码率/CDN，或上一个看过的视频)，取「最近一条」——
  // 当前正在播放的作品，它的 CDN 请求是最新的那条。
  function pickDouyinVideo(list) {
    const isVid = (r) => {
      const u = (r && r.url) || '';
      if (/\.mp3(\?|$)/i.test(u)) return false;                       // 排除背景音乐
      if (!/(douyinvod\.com|zjcdn\.com|douyincdn\.com)/i.test(u)) return false; // 抖音视频 CDN
      return /\.mp4(\?|$)/i.test(u) || r.tag === '视频' || r.kind === 'hls' || r.kind === 'dash';
    };
    const vids = (list || []).filter(isVid);
    return vids.length ? vids[vids.length - 1] : null;
  }
  function douyinName() {
    let t = (document.title || '').replace(/[\\/:*?"<>|]/g, '_').trim();
    t = t.replace(/\s*[-|_–—]\s*抖音[^-]*$/, '').trim();              // 去掉“- 抖音旗下优质视频平台”等后缀
    const m = location.href.match(/modal_id=(\d+)/) || location.href.match(/\/video\/(\d+)/);
    const id = m && m[1];
    if (!t || /^抖音/.test(t) || t.length < 2) t = 'douyin_' + (id || Date.now());
    return t.slice(0, 80);
  }

  function triggerDownload(video) {
    // Prefer the post's own URL for known video platforms (the desktop app handles them);
    // otherwise send the direct media src.
    const host = location.hostname.replace(/^www\./, '');
    const isPlatform = /(youtube\.com|youtu\.be|x\.com|twitter\.com|tiktok\.com|reddit\.com|bilibili\.com|vimeo\.com|twitch\.tv|facebook\.com|instagram\.com)/i.test(host);
    let px = overlayCursor.x, py = overlayCursor.y;
    if (video) {
      const r = video.getBoundingClientRect();
      if (r.width && r.height) { px = r.left + r.width / 2; py = r.top + r.height / 2; }
    }

    // 抖音：绕开常规解析，用真实 CDN 地址直取（又快又能成）。
    // 首选：用当前作品 id 查 inject.js 建的播放表 → 精确对应点击的视频；
    // 兜底：查不到时退回「嗅探到的最近一条」（不保证精确，但聊胜于无）。
    const isDouyinHost = /(^|\.)douyin\.com$/i.test(location.hostname);
    if (isDouyinHost) {
      if (/(^|\.)live\.douyin\.com$/i.test(location.hostname) || /api_path|webcast/i.test(location.href)) {
        showToast('抖音直播暂不支持下载，请打开具体的视频作品后再下载');
        return;
      }
      const id = douyinAwemeId(video);
      if (id && douyinPlayMap[id] && douyinPlayMap[id].length) {
        send({ url: douyinPlayMap[id][0], kind: null, filename: douyinName() + '.mp4', referer: location.origin + '/' });
        return;
      }
      // 查不到作品 id 或接口还没返回 → 退回嗅探最近一条
      try {
        chrome.runtime.sendMessage({ type: 'getSniffed' }, (resp) => {
          const pick = pickDouyinVideo((resp && resp.items) || []);
          if (pick) {
            send({ url: pick.url, kind: null, filename: douyinName() + '.mp4', referer: location.origin + '/' });
          } else {
            showToast('没嗅探到视频地址，请让视频先播放一两秒，再点「下载该视频」');
          }
        });
      } catch (e) {
        showToast('没嗅探到视频地址，请让视频先播放一两秒，再点「下载该视频」');
      }
      return;
    }

    if (isPlatform) {
      const postUrl = resolvePostUrl(video, px, py);
      // 抖音直播间无法作为视频下载：给出明确提示，不要把 live/api 链接发过去报 Unsupported
      if (postUrl === 'DOUYIN_LIVE_UNSUPPORTED') {
        showToast('抖音直播暂不支持下载，请打开具体的视频作品后再下载');
        return;
      }
      send({ url: postUrl, kind: 'video-platform', filename: (document.title || 'video') + '.mp4' });
      return;
    }

    // 非平台站（如 jable）：优先用"本页已嗅探到的真实媒体地址"（m3u8/mp4），
    // 而不是页面URL。向 background 查询本页嗅探到的资源。
    try {
      chrome.runtime.sendMessage({ type: 'getSniffed' }, (resp) => {
        const list = (resp && resp.items) || [];
        // 优先 m3u8/HLS 流，其次直链视频文件（排除 preview 预览片段）
        const hls = list.find((r) => /\.(m3u8|mpd)/i.test(r.url) || r.kind === 'hls' || r.kind === 'dash');
        const mp4 = list.find((r) => /\.(mp4|mkv|webm|mov)/i.test(r.url) && !/preview/i.test(r.url));
        const pick = hls || mp4;
        if (pick) {
          const fn = (document.title || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
          send({ url: pick.url, kind: pick.kind || null, filename: fn + '.mp4', referer: location.href });
        } else {
          // 没嗅探到 → 退回原逻辑（video 直链，或页面URL交本机客户端）
          fallbackTrigger(video, px, py);
        }
      });
    } catch (e) {
      fallbackTrigger(video, px, py);
    }
  }

  function fallbackTrigger(video, px, py) {
    const src = (video && (video.currentSrc || video.src)) ||
      (video && video.querySelector('source') && video.querySelector('source').src) || '';
    if (!src || src.startsWith('blob:')) {
      const postUrl = resolvePostUrl(video, px, py);
      send({ url: postUrl, kind: 'video-platform', filename: (document.title || 'video') + '.mp4' });
    } else {
      send({ url: src, kind: null, referer: location.href });
    }
  }

  function send(payload) {
    log('triggerDownload ->', payload.url);
    try { chrome.runtime.sendMessage({ type: 'send', items: [payload] }); } catch (e) {}
  }

  // The big fix: some sites layer transparent control/click-catcher elements ON
  // TOP of <video>, so mouseenter never reaches the video and the button never
  // showed. Instead, hit-test on document-level mousemove: find the largest
  // video whose box contains the cursor, regardless of what's stacked above it.
  let allVideos = [];
  function refreshVideoList() {
    allVideos = [...document.querySelectorAll('video')].filter(isDownloadableVideo);
  }
  function videoUnderPoint(x, y) {
    let best = null, bestArea = 0;
    for (const v of allVideos) {
      const r = v.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = v; }
      }
    }
    return best;
  }

  let lastMove = 0;
  document.addEventListener('mousemove', (e) => {
    lastCursor = { x: e.clientX, y: e.clientY };  // always track (used to resolve the post)
    const now = Date.now();
    if (now - lastMove < 60) return;   // throttle
    lastMove = now;
    const v = videoUnderPoint(e.clientX, e.clientY);
    if (v) {
      overlayCursor = { x: e.clientX, y: e.clientY }; // where the button was shown
      showOverlayFor(v);
    } else if (overlayEl && overlayEl.style.display !== 'none') {
      // don't hide if the cursor is over the button itself
      const o = overlayEl.getBoundingClientRect();
      const onBtn = e.clientX >= o.left && e.clientX <= o.right && e.clientY >= o.top && e.clientY <= o.bottom;
      if (!onBtn) scheduleHide();
    }
  }, true);

  function wireVideos() { refreshVideoList(); }
  // reposition while scrolling/resizing so the button tracks the video
  window.addEventListener('scroll', () => { if (overlayEl && overlayEl.style.display !== 'none' && overlayTarget) positionOverlay(overlayTarget); }, true);
  window.addEventListener('resize', () => { refreshVideoList(); if (overlayEl && overlayEl.style.display !== 'none' && overlayTarget) positionOverlay(overlayTarget); });
  // keep the video list fresh as players load/unload
  setInterval(refreshVideoList, 2000);
  refreshVideoList();
  } // end top-frame-only overlay block

  const obs = new MutationObserver(() => { clearTimeout(obs._t); obs._t = setTimeout(() => { scan(); }, 600); });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => { scan(); });
  window.addEventListener('load', () => { scan(); });
  setTimeout(() => { scan(); }, 1500);
  setInterval(() => { scan(); }, 5000);
})();
