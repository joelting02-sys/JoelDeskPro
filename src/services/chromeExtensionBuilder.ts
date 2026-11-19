// Pure client-side ZIP + PNG generator & full MV3 JoelDeskPro Chrome Extension package builder.
// Faithfully ports TDM Fast v4.7.3 sniffing, takeover, cookies, and custom-protocol wake-up logic
// with Joel Desk Pro's clean White & Blue ("J") identity and smooth rounded corners.

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

function sampleWhiteBlueIconPixel(nx: number, ny: number, size: number): [number, number, number, number] {
  const radius = 0.25;
  const borderWidth = Math.max(0.055, 1.8 / size);

  const dx = Math.max(radius - nx, 0, nx - (1 - radius));
  const dy = Math.max(radius - ny, 0, ny - (1 - radius));
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > radius) return [0, 0, 0, 0];

  const edgeDist = Math.min(nx, ny, 1 - nx, 1 - ny);
  const isBezel = dist >= radius - borderWidth || edgeDist < borderWidth;

  // Crisp Royal Blue "J" monogram
  const isTopSerif = ny >= 0.25 && ny <= 0.315 && nx >= 0.48 && nx <= 0.725;
  const isStem = nx >= 0.555 && nx <= 0.655 && ny >= 0.29 && ny <= 0.605;
  const cx = 0.465;
  const cy = 0.595;
  const hookDist = Math.sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy));
  const isHookArc = ny >= cy - 0.01 && hookDist >= 0.095 && hookDist <= 0.19;
  const isLeftTerminal =
    Math.sqrt((nx - 0.335) * (nx - 0.335) + (ny - 0.635) * (ny - 0.635)) <= 0.056;

  if (isTopSerif || isStem || isHookArc || isLeftTerminal || isBezel) {
    const t = Math.min(1, Math.max(0, ny * 0.85));
    return [
      Math.round(37 - t * 8),
      Math.round(99 - t * 21),
      Math.round(235 - t * 19),
      255,
    ];
  }

  return [255, 255, 255, 255];
}

/**
 * Generates a crisp anti-aliased RGBA PNG icon (White background, Royal Blue border, Royal Blue "J").
 */
function createDeskKitIconPng(size: number): Uint8Array {
  const stride = 1 + size * 4;
  const raw = new Uint8Array(stride * size);
  const offsets = [0.25, 0.75];

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const oy of offsets) {
        for (const ox of offsets) {
          const [sr, sg, sb, sa] = sampleWhiteBlueIconPixel((x + ox) / size, (y + oy) / size, size);
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const px = rowStart + 1 + x * 4;
      if (a > 0) {
        raw[px] = Math.round(r / a);
        raw[px + 1] = Math.round(g / a);
        raw[px + 2] = Math.round(b / a);
        raw[px + 3] = Math.round(a / 4);
      }
    }
  }

  // Wrap raw scanlines in valid uncompressed zlib stream (stored blocks, max 65535 each)
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let off = 0; off < raw.length; off += 65535) {
    const chunk = raw.subarray(off, Math.min(raw.length, off + 65535));
    const isFinal = off + chunk.length >= raw.length ? 1 : 0;
    const header = new Uint8Array(5);
    const hv = new DataView(header.buffer);
    header[0] = isFinal;
    hv.setUint16(1, chunk.length, true);
    hv.setUint16(3, (~chunk.length) & 0xffff, true);
    blocks.push(header, chunk);
  }
  const adler = new Uint8Array(4);
  new DataView(adler.buffer).setUint32(0, adler32(raw), false);
  blocks.push(adler);

  const idatLen = blocks.reduce((acc, b) => acc + b.length, 0);
  const idatData = new Uint8Array(idatLen);
  let pos = 0;
  for (const b of blocks) {
    idatData.set(b, pos);
    pos += b.length;
  }

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, size, false);
  iv.setUint32(4, size, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const c1 = pngChunk('IHDR', ihdr);
  const c2 = pngChunk('IDAT', idatData);
  const c3 = pngChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(sig.length + c1.length + c2.length + c3.length);
  let p = 0;
  for (const part of [sig, c1, c2, c3]) {
    png.set(part, p);
    p += part.length;
  }
  return png;
}

/**
 * Standard PKZIP (Store / UTF-8) archive builder supporting text & binary entries.
 */
export function createZipBlob(
  files: Array<{ path: string; content: string | Uint8Array }>
): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes =
      typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const checksum = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, eocd] as BlobPart[], {
    type: 'application/zip',
  });
}

/**
 * Generates the complete JoelDeskPro Chrome MV3 extension package:
 * - Faithfully ports TDM Fast v4.7.3 sniffing, takeover, cookies, Douyin React Fiber & joeldeskpro:// protocol wake-up
 * - Clean White & Blue visual styling with smooth rounded corners & White/Blue "J" icons
 * - manifest.json at ZIP ROOT so extracting into any folder loads directly in Chrome
 */
export function buildDeskKitChromeExtension(port: number, token: string, _defaultWebUrl = '') {
  const endpoint = `http://127.0.0.1:${port}/api/bridge/capture`;

  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: 'JoelDeskPro 资源嗅探',
      version: '1.3.0',
      description:
        'Joel Desk Pro 下载器的浏览器助手：检测网页中的视频、音频与文件资源，一键交给 Joel Desk Pro 多线程高速下载。',
      permissions: [
        'webRequest',
        'downloads',
        'contextMenus',
        'storage',
        'notifications',
        'tabs',
        'webNavigation',
        'cookies',
      ],
      host_permissions: ['<all_urls>', `http://127.0.0.1:${port}/*`],
      icons: {
        '16': 'icons/16.png',
        '48': 'icons/48.png',
        '128': 'icons/128.png',
      },
      action: {
        default_icon: {
          '16': 'icons/16.png',
          '48': 'icons/48.png',
          '128': 'icons/128.png',
        },
        default_popup: 'popup.html',
        default_title: 'JoelDeskPro 嗅探',
      },
      background: {
        service_worker: 'background.js',
      },
      content_scripts: [
        {
          all_frames: true,
          js: ['inject.js'],
          matches: ['<all_urls>'],
          run_at: 'document_start',
          world: 'MAIN',
        },
        {
          all_frames: true,
          js: ['content.js'],
          matches: ['<all_urls>'],
          run_at: 'document_idle',
        },
      ],
      web_accessible_resources: [
        {
          matches: ['<all_urls>'],
          resources: ['inject.js'],
        },
      ],
    },
    null,
    2
  );

  // Faithful port of TDM Fast v4.7.3 inject.js (page-context fetch/XHR/MSE/DOM/source + Douyin Fiber/globals)
  const injectJs = `'use strict';
// Runs in the PAGE context (MAIN world) so it can hook fetch / XHR / MSE / <video>
// and surface real HLS/DASH manifests, media URLs, and Douyin aweme_id -> play URLs.
(function () {
  if (window.__jdpInjected) return;
  window.__jdpInjected = true;

  const M3U8 = /\\.(m3u8|mpd)/i;
  const MEDIA_FILE = /\\.(mp4|m4v|webm|mkv|mov|flv|avi|m4a|mp3|aac|ogg|wav|opus)(\\?|#|$)/i;
  const MEDIA_MIME = /(mpegurl|dash\\+xml|video\\/|audio\\/)/i;
  const seen = new Set();

  const post = (url, mime) => {
    try {
      if (!url || typeof url !== 'string') return;
      if (url.startsWith('blob:') || url.startsWith('data:')) return;
      const isM3u8 = M3U8.test(url) || /(mpegurl|dash\\+xml)/i.test(mime || '');
      if (!isM3u8 && /\\.(ts|m4s)(\\?|$)/i.test(url)) return;
      const isMedia = isM3u8 || MEDIA_FILE.test(url) || MEDIA_MIME.test(mime || '');
      if (!isMedia) return;
      if (seen.has(url)) return;
      seen.add(url);
      window.postMessage({ __jdp: true, url: String(url), mime: mime || '' }, '*');
    } catch (e) {}
  };

  // ---- 抖音：从接口返回 / SSR 全局状态 / React Fiber 按 aweme_id 建「作品id → 真实播放地址」表 ----
  const DOUYIN_API = /\\/aweme\\/v1\\/web\\//i;
  const normUrl = (u) => {
    if (typeof u !== 'string') return null;
    if (u.startsWith('//')) u = 'https:' + u;
    u = u.replace(/^http:\\/\\//i, 'https://');
    return /^https:\\/\\//.test(u) ? u : null;
  };
  function bestPlayUrls(video) {
    if (!video || typeof video !== 'object') return [];
    const out = [];
    const pushList = (l) => { if (Array.isArray(l)) for (const u of l) { const n = normUrl(typeof u === 'string' ? u : (u && (u.src || u.url))); if (n) out.push(n); } };
    const pushAddr = (a) => { if (a && typeof a === 'object') { pushList(a.url_list); pushList(a.urlList); } };
    const pushStr = (s) => { const n = normUrl(s); if (n) out.push(n); };
    try {
      pushAddr(video.play_addr); pushAddr(video.playAddr);
      pushStr(video.play_api); pushStr(video.playApi);
      pushAddr(video.play_addr_h264); pushAddr(video.playAddrH264);
      pushAddr(video.play_addr_265); pushAddr(video.playAddr265);
      const brs = video.bit_rate || video.bitRateList || video.bitrateList;
      if (Array.isArray(brs)) for (const b of brs) { if (!b) continue; pushAddr(b.play_addr || b.playAddr); pushStr(b.play_api || b.playApi); }
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
      const node = a.aweme ? a.aweme : a;
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
    return (window.__jdpDY = window.__jdpDY || { endpoints: [], keys: [], updates: 0, globals: [] });
  }
  function reportDouyinMap(map) {
    try {
      const keys = map && Object.keys(map);
      if (!keys || !keys.length) return;
      window.postMessage({ __jdp_douyin: true, map }, '*');
      const d = dbg(); d.updates++;
      for (const k of keys) if (!d.keys.includes(k)) { d.keys.push(k); if (d.keys.length > 200) d.keys.shift(); }
    } catch (e) {}
  }
  function reportDouyinFromText(text) {
    if (!text || text.length > 8e6) return;
    let obj; try { obj = JSON.parse(text); } catch (e) { return; }
    const map = collectAwemeMap(obj);
    try { deepCollectAweme(obj, map); } catch (e) {}
    reportDouyinMap(map);
  }
  function deepCollectAweme(root, map, budgetMax) {
    let budget = budgetMax || 40000;
    const stack = [[root, 0]];
    const visited = new Set();
    while (stack.length) {
      if (budget-- <= 0) break;
      const item = stack.pop();
      const node = item[0], depth = item[1];
      if (!node || typeof node !== 'object' || depth > 16) continue;
      if (visited.has(node)) continue;
      visited.add(node);
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
      if (!/(^|\\.)douyin\\.com$/i.test(location.hostname)) return;
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
  function getReactFiber(el) {
    if (!el) return null;
    for (const k in el) {
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) return el[k];
    }
    return null;
  }
  function scanActiveDouyinFiber() {
    try {
      if (!/(^|\\.)douyin\\.com$/i.test(location.hostname)) return;
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

  // 1) hook fetch (safe if window.fetch is read-only)
  try {
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    const canHookFetch = !desc || desc.writable || Boolean(desc.set);
    const _fetch = window.fetch;
    if (_fetch && canHookFetch) {
      window.fetch = function (input, init) {
        let u;
        try { u = typeof input === 'string' ? input : (input && input.url); post(u); } catch (e) {}
        return _fetch.apply(this, arguments).then((resp) => {
          try {
            const ct = resp.headers && resp.headers.get && resp.headers.get('content-type');
            if (ct && MEDIA_MIME.test(ct)) post(resp.url || u, ct);
          } catch (e) {}
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
  } catch (e) {}

  // 2) hook XHR
  try {
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        this.__jdpUrl = url;
        post(url);
        this.addEventListener('load', function () {
          try {
            const ct = this.getResponseHeader && this.getResponseHeader('content-type');
            if (ct && MEDIA_MIME.test(ct)) post(this.__jdpUrl, ct);
          } catch (e) {}
          try {
            if (this.__jdpUrl && DOUYIN_API.test(this.__jdpUrl)) {
              try { const d = dbg(); if (d.endpoints.length < 40) d.endpoints.push(String(this.__jdpUrl).slice(0, 140)); } catch (e) {}
              const rt = this.responseType;
              if (rt === '' || rt === 'text') reportDouyinFromText(this.responseText);
              else if (rt === 'json' && this.response) reportDouyinMap(collectAwemeMap(this.response));
            }
          } catch (e) {}
        });
      } catch (e) {}
      return _open.apply(this, arguments);
    };
  } catch (e) {}

  // 3) scan <video>/<audio>
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

  // 4) MutationObserver
  try {
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'VIDEO' || n.tagName === 'AUDIO') scanMediaEl(n);
        else if (n.querySelectorAll) n.querySelectorAll('video, audio').forEach(scanMediaEl);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // 5) scan page HTML source for embedded media URLs
  function scanSource() {
    try {
      const html = document.documentElement ? document.documentElement.outerHTML : '';
      if (!html) return;
      const re = /https?:\\/\\/[^\\s"'<>()\\\\]+?\\.(m3u8|mpd|mp4|m4v|webm|mkv|mov|flv|m4a|mp3|aac)(\\?[^\\s"'<>()\\\\]*)?/gi;
      let mm, count = 0;
      while ((mm = re.exec(html)) && count < 50) {
        count++;
        let u = mm[0];
        u = u.replace(/\\\\\\//g, '/').replace(/&amp;/g, '&');
        post(u);
      }
    } catch (e) {}
  }
  let ss = 0;
  const ssiv = setInterval(() => { scanSource(); if (++ss > 8) clearInterval(ssiv); }, 1500);
  if (document.readyState !== 'loading') scanSource();
  else document.addEventListener('DOMContentLoaded', scanSource);

  // 6) Douyin periodic fiber + globals scan
  if (/(^|\\.)douyin\\.com$/i.test(location.hostname)) {
    const scanBoth = () => { try { scanActiveDouyinFiber(); } catch (e) {} try { scanDouyinGlobals(); } catch (e) {} };
    setInterval(scanBoth, 1200);
    if (document.readyState !== 'loading') scanBoth();
    else document.addEventListener('DOMContentLoaded', scanBoth);
  }
})();
`;

  // Faithful port of TDM Fast v4.7.3 content.js with clean rounded White & Blue floating video button
  const contentJs = `'use strict';
// Detects media the network sniffer can't see: <video>/<audio> with direct
// src, <source> children, and MSE/blob streams. Reports to the background worker.
(function () {
  const seen = new Set();
  let dismissed = false;

  function report(items) {
    if (!items.length) return;
    try { chrome.runtime.sendMessage({ type: 'domMedia', items, tabId: null }); } catch (e) {}
  }

  // 在客户端未运行时，让当前页面用隐藏 <a> 点击打开 joeldeskpro:// 协议唤起桌面客户端
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

  // Fallback inject of page-context hook
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('inject.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}

  // Receive manifest URLs discovered by the page hook
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || !ev.data.__jdp) return;
    const u = ev.data.url;
    if (!u || seen.has(u)) return;
    seen.add(u);
    report([{ url: u, mime: ev.data.mime || '', title: document.title, pageUrl: location.href }]);
  });

  // 抖音：aweme_id -> [playUrl, ...]
  const douyinPlayMap = Object.create(null);
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || !ev.data.__jdp_douyin) return;
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
  let lastHref = location.href;
  function notifyUrlChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    seen.clear();
    dismissed = false;
    try {
      chrome.runtime.sendMessage({
        type: 'spaNavigate', url: location.href, title: document.title,
      });
    } catch (e) {}
    setTimeout(scan, 800);
  }

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
  setInterval(notifyUrlChange, 700);

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
  // Floating "下载该视频" button (clean White & Blue rounded style)
  // ============================================================
  if (window.top === window.self) {
  const OVERLAY_ID = 'jdp-video-overlay';
  let overlayEl = null;
  let overlayTarget = null;
  let hideTimer = null;
  let lastCursor = { x: NaN, y: NaN };
  let overlayCursor = { x: NaN, y: NaN };
  const DEBUG = false;
  function log(...args) { if (DEBUG) try { console.log('[JoelDeskPro]', ...args); } catch (e) {} }

  function isDownloadableVideo(v) {
    if (!(v instanceof HTMLVideoElement)) return false;
    const r = v.getBoundingClientRect();
    if (r.width < 120 || r.height < 80) return false;
    if (v.readyState === 0 && !v.currentSrc && !v.querySelector('source')) return false;
    return true;
  }

  function buildOverlay() {
    if (overlayEl) return overlayEl;
    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.innerHTML = \`
      <button type="button" class="jdp-dl-btn" title="使用 Joel Desk Pro 下载此视频">
        <svg viewBox="0 0 64 64" width="16" height="16" aria-hidden="true" style="flex-shrink:0">
          <rect x="3" y="3" width="58" height="58" rx="16" fill="#FFFFFF" stroke="#2563EB" stroke-width="4.5"/>
          <path d="M31.5 16.5H45.5V20.2C42.9 20.6 41.8 21.7 41.8 24.6V37.6C41.8 45.2 36.7 49.8 28.9 49.8C23.5 49.8 19.6 47.2 18.4 43.7C17.9 42.1 18.6 40.2 20.4 39.7C22 39.3 23.6 40.2 24.3 41.9C25.2 44.1 26.8 45.5 29.3 45.5C33.4 45.5 35.4 42.8 35.4 37.4V24.6C35.4 21.7 34.3 20.6 31.5 20.2V16.5Z" fill="#2563EB"/>
        </svg>
        <span>下载该视频</span>
      </button>
      <button type="button" class="jdp-close-btn" title="关闭下载按钮（刷新页面后恢复）" aria-label="关闭">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        </svg>
      </button>\`;
    const s = el.style;
    s.position = 'fixed';
    s.zIndex = '2147483647';
    s.display = 'none';
    s.pointerEvents = 'auto';
    Object.assign(el.style, { alignItems: 'center', gap: '5px' });
    const btn = el.querySelector('.jdp-dl-btn');
    Object.assign(btn.style, {
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '7px 13px', border: '1.5px solid #2563EB', borderRadius: '999px',
      background: 'rgba(255,255,255,0.96)', color: '#1D4ED8',
      font: '600 12.5px/1 "Microsoft YaHei",system-ui,-apple-system,sans-serif', cursor: 'pointer',
      boxShadow: '0 6px 18px rgba(37,99,235,0.18), 0 1px 3px rgba(15,23,42,0.1)', whiteSpace: 'nowrap',
      backdropFilter: 'blur(8px)',
      transition: 'transform .14s ease, box-shadow .14s ease, background .14s ease, color .14s ease',
    });
    btn.onmouseenter = () => {
      btn.style.transform = 'translateY(-1px)';
      btn.style.background = '#2563EB';
      btn.style.color = '#FFFFFF';
      btn.style.boxShadow = '0 8px 22px rgba(37,99,235,0.32)';
    };
    btn.onmouseleave = () => {
      btn.style.transform = 'none';
      btn.style.background = 'rgba(255,255,255,0.96)';
      btn.style.color = '#1D4ED8';
      btn.style.boxShadow = '0 6px 18px rgba(37,99,235,0.18), 0 1px 3px rgba(15,23,42,0.1)';
    };
    btn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      triggerDownload(overlayTarget);
      btn.querySelector('span').textContent = '已发送 ✓';
      setTimeout(() => { if (btn.querySelector('span')) btn.querySelector('span').textContent = '下载该视频'; }, 1800);
    };
    const closeBtn = el.querySelector('.jdp-close-btn');
    Object.assign(closeBtn.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '26px', height: '26px', padding: '0', border: '1px solid rgba(203,213,225,0.9)', borderRadius: '999px',
      background: 'rgba(255,255,255,0.94)', color: '#64748B', cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(15,23,42,0.12)', flex: '0 0 auto',
      transition: 'background .14s ease, color .14s ease, border-color .14s ease',
    });
    closeBtn.onmouseenter = () => {
      closeBtn.style.background = '#EF4444';
      closeBtn.style.borderColor = '#EF4444';
      closeBtn.style.color = '#FFFFFF';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.background = 'rgba(255,255,255,0.94)';
      closeBtn.style.borderColor = 'rgba(203,213,225,0.9)';
      closeBtn.style.color = '#64748B';
    };
    closeBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      dismissed = true;
      clearTimeout(hideTimer);
      if (overlayEl) overlayEl.style.display = 'none';
    };
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
    const w = el.offsetWidth || 140;
    el.style.left = Math.min(window.innerWidth - w - 6, r.right - w - 10) + 'px';
  }

  function showOverlayFor(video) {
    if (dismissed) return;
    if (!isDownloadableVideo(video)) return;
    clearTimeout(hideTimer);
    overlayTarget = video;
    positionOverlay(video);
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (overlayEl) overlayEl.style.display = 'none'; }, 600);
  }

  let _toastEl = null, _toastTimer = null;
  function showToast(msg) {
    try {
      if (!_toastEl) {
        _toastEl = document.createElement('div');
        Object.assign(_toastEl.style, {
          position: 'fixed', left: '50%', top: '28px', transform: 'translateX(-50%)',
          zIndex: '2147483647', maxWidth: '80vw', padding: '10px 18px', borderRadius: '12px',
          background: 'rgba(255,255,255,0.97)', color: '#0F172A',
          border: '1.5px solid #2563EB',
          font: '600 13.5px/1.45 "Microsoft YaHei",system-ui,sans-serif',
          boxShadow: '0 10px 28px rgba(37,99,235,0.18)', pointerEvents: 'none', textAlign: 'center',
        });
        (document.body || document.documentElement).appendChild(_toastEl);
      }
      _toastEl.textContent = msg;
      _toastEl.style.display = 'block';
      clearTimeout(_toastTimer);
      _toastTimer = setTimeout(() => { if (_toastEl) _toastEl.style.display = 'none'; }, 3500);
    } catch (e) {}
  }

  function isPermalinkPage() {
    return /\\/status\\/\\d+/.test(location.pathname) ||
      /\\/watch\\b/.test(location.pathname) ||
      location.pathname.startsWith('/shorts/') ||
      /\\/video\\//.test(location.pathname) ||
      /\\/(p|reel|tv)\\//.test(location.pathname);
  }

  function statusUrlFromArticle(article) {
    if (!article) return null;
    const timeA = article.querySelector('a[href*="/status/"] time');
    if (timeA) {
      const a = timeA.closest('a[href*="/status/"]');
      const m = a && a.getAttribute('href').match(/\\/[^/]+\\/status\\/\\d+/);
      if (m) return location.origin + m[0];
    }
    const links = [...article.querySelectorAll('a[href*="/status/"]')];
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (/\\/analytics$|\\/likes$|\\/retweets$|\\/quotes$/.test(href)) continue;
      const m = href.match(/\\/[^/]+\\/status\\/\\d+/);
      if (m) return location.origin + m[0];
    }
    return null;
  }

  function douyinAwemeId(video) {
    const bad = /live\\.douyin|api_path|webcast/i;
    let m = location.pathname.match(/\\/video\\/(\\d{6,})/);
    if (m) return m[1];
    try { const mid = new URLSearchParams(location.search).get('modal_id'); if (mid && /^\\d{6,}$/.test(mid)) return mid; } catch (e) {}
    if (video) {
      let p = video;
      for (let d = 0; p && d < 30; d++, p = p.parentElement) {
        if (!p.getAttribute) continue;
        for (const attr of ['data-e2e-aweme-id', 'data-aweme-id', 'data-video-id', 'data-id']) {
          const v = p.getAttribute(attr);
          if (v && /^\\d{15,}$/.test(v)) return v;
        }
        const a = p.querySelector && p.querySelector('a[href*="/video/"]');
        if (a) {
          const href = a.getAttribute('href') || '';
          const am = href.match(/\\/video\\/(\\d{6,})/);
          if (am && !bad.test(href)) return am[1];
        }
      }
    }
    for (const a of document.querySelectorAll('a[href*="/video/"]')) {
      const href = a.getAttribute('href') || '';
      const am = href.match(/\\/video\\/(\\d{6,})/);
      if (am && !bad.test(href)) return am[1];
    }
    return null;
  }

  function resolvePostUrl(video, clientX, clientY) {
    const dyHost = /(^|\\.)douyin\\.com$/i.test(location.hostname);
    if (dyHost) {
      const id = douyinAwemeId(video);
      if (id) return 'https://www.douyin.com/video/' + id;
      if (/(^|\\.)live\\.douyin\\.com$/i.test(location.hostname)) return 'DOUYIN_LIVE_UNSUPPORTED';
      if (/api_path|webcast/i.test(location.href)) return 'DOUYIN_LIVE_UNSUPPORTED';
      return location.href.split('?')[0];
    }

    if (isPermalinkPage()) return location.href;

    const host = location.hostname.replace(/^www\\./, '');
    const isX = /(^|\\.)x\\.com$/.test(host) || /twitter\\.com$/.test(host);
    const isYT = /youtube\\.com$/.test(host) || /youtu\\.be$/.test(host);

    if (isX) {
      let art = video && video.closest && video.closest('article');
      let url = statusUrlFromArticle(art);
      if (url) { log('resolved via video article:', url); return url; }

      if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const stack = document.elementsFromPoint(clientX, clientY);
        for (const el of stack) {
          const a2 = el.closest && el.closest('article');
          url = statusUrlFromArticle(a2);
          if (url) { log('resolved via cursor article:', url); return url; }
        }
      }

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

    const isTT = /tiktok\\.com$/.test(host);
    if (isTT) {
      if (video) {
        let p = video;
        for (let d = 0; p && d < 25; d++, p = p.parentElement) {
          if (!p.getAttribute) continue;
          const vid = p.getAttribute('data-video-id') || p.getAttribute('data-e2e-video-id')
            || p.getAttribute('data-scroll-index-id') || (p.id && (/(\\d{15,})/.exec(p.id) || [])[1]);
          if (vid && /^\\d{10,}$/.test(vid)) {
            const a = p.querySelector && p.querySelector('a[href*="/@"]');
            const m = a && /\\/@([\\w.-]+)/.exec(a.getAttribute('href') || '');
            const author = (m && m[1]) || 'user';
            return 'https://www.tiktok.com/@' + author + '/video/' + vid;
          }
        }
      }
      const canon = document.querySelector('link[rel="canonical"]');
      const ogurl = document.querySelector('meta[property="og:url"]');
      for (const cand of [canon && canon.href, ogurl && ogurl.content]) {
        const cm = cand && /\\/@([\\w.-]+)\\/video\\/(\\d+)/.exec(cand);
        if (cm) return 'https://www.tiktok.com/@' + cm[1] + '/video/' + cm[2];
      }
      const bq = document.querySelector('blockquote.tiktok-embed[cite], blockquote.tiktok-embed[data-video-id]');
      if (bq) {
        const cm = /\\/@([\\w.-]+)\\/video\\/(\\d+)/.exec(bq.getAttribute('cite') || '');
        if (cm) return 'https://www.tiktok.com/@' + cm[1] + '/video/' + cm[2];
        const vid = bq.getAttribute('data-video-id');
        if (vid && /^\\d+$/.test(vid)) return 'https://www.tiktok.com/@user/video/' + vid;
      }
      for (const link of document.querySelectorAll('a[href*="/video/"]')) {
        const lm = /\\/@([\\w.-]+)\\/video\\/(\\d+)/.exec(link.getAttribute('href') || '');
        if (lm) return 'https://www.tiktok.com/@' + lm[1] + '/video/' + lm[2];
      }
    }

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
    return location.href;
  }

  function pickDouyinVideo(list) {
    const isVid = (r) => {
      const u = (r && r.url) || '';
      if (/\\.mp3(\\?|$)/i.test(u)) return false;
      if (!/(douyinvod\\.com|zjcdn\\.com|douyincdn\\.com)/i.test(u)) return false;
      return /\\.mp4(\\?|$)/i.test(u) || r.tag === '视频' || r.kind === 'hls' || r.kind === 'dash';
    };
    const vids = (list || []).filter(isVid);
    return vids.length ? vids[vids.length - 1] : null;
  }
  function douyinName() {
    let t = (document.title || '').replace(/[\\\\/:*?"<>|]/g, '_').trim();
    t = t.replace(/\\s*[-|_–—]\\s*抖音[^-]*$/, '').trim();
    const m = location.href.match(/modal_id=(\\d+)/) || location.href.match(/\\/video\\/(\\d+)/);
    const id = m && m[1];
    if (!t || /^抖音/.test(t) || t.length < 2) t = 'douyin_' + (id || Date.now());
    return t.slice(0, 80);
  }

  function triggerDownload(video) {
    const host = location.hostname.replace(/^www\\./, '');
    const isPlatform = /(youtube\\.com|youtu\\.be|x\\.com|twitter\\.com|tiktok\\.com|reddit\\.com|bilibili\\.com|vimeo\\.com|twitch\\.tv|facebook\\.com|instagram\\.com)/i.test(host);
    let px = overlayCursor.x, py = overlayCursor.y;
    if (video) {
      const r = video.getBoundingClientRect();
      if (r.width && r.height) { px = r.left + r.width / 2; py = r.top + r.height / 2; }
    }

    const isDouyinHost = /(^|\\.)douyin\\.com$/i.test(location.hostname);
    if (isDouyinHost) {
      if (/(^|\\.)live\\.douyin\\.com$/i.test(location.hostname) || /api_path|webcast/i.test(location.href)) {
        showToast('抖音直播暂不支持下载，请打开具体的视频作品后再下载');
        return;
      }
      const id = douyinAwemeId(video);
      if (id && douyinPlayMap[id] && douyinPlayMap[id].length) {
        send({ url: douyinPlayMap[id][0], kind: null, filename: douyinName() + '.mp4', referer: location.origin + '/' });
        return;
      }
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
      if (postUrl === 'DOUYIN_LIVE_UNSUPPORTED') {
        showToast('抖音直播暂不支持下载，请打开具体的视频作品后再下载');
        return;
      }
      send({ url: postUrl, kind: 'video-platform', filename: (document.title || 'video') + '.mp4' });
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: 'getSniffed' }, (resp) => {
        const list = (resp && resp.items) || [];
        const hls = list.find((r) => /\\.(m3u8|mpd)/i.test(r.url) || r.kind === 'hls' || r.kind === 'dash');
        const mp4 = list.find((r) => /\\.(mp4|mkv|webm|mov)/i.test(r.url) && !/preview/i.test(r.url));
        const pick = hls || mp4;
        if (pick) {
          const fn = (document.title || 'video').replace(/[\\\\/:*?"<>|]/g, '_').slice(0, 120);
          send({ url: pick.url, kind: pick.kind || null, filename: fn + '.mp4', referer: location.href });
        } else {
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
    lastCursor = { x: e.clientX, y: e.clientY };
    const now = Date.now();
    if (now - lastMove < 60) return;
    lastMove = now;
    const v = videoUnderPoint(e.clientX, e.clientY);
    if (v) {
      overlayCursor = { x: e.clientX, y: e.clientY };
      showOverlayFor(v);
    } else if (overlayEl && overlayEl.style.display !== 'none') {
      const o = overlayEl.getBoundingClientRect();
      const onBtn = e.clientX >= o.left && e.clientX <= o.right && e.clientY >= o.top && e.clientY <= o.bottom;
      if (!onBtn) scheduleHide();
    }
  }, true);

  window.addEventListener('scroll', () => { if (overlayEl && overlayEl.style.display !== 'none' && overlayTarget) positionOverlay(overlayTarget); }, true);
  window.addEventListener('resize', () => { refreshVideoList(); if (overlayEl && overlayEl.style.display !== 'none' && overlayTarget) positionOverlay(overlayTarget); });
  setInterval(refreshVideoList, 2000);
  refreshVideoList();
  }

  const obs = new MutationObserver(() => { clearTimeout(obs._t); obs._t = setTimeout(() => { scan(); }, 600); });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => { scan(); });
  window.addEventListener('load', () => { scan(); });
  setTimeout(() => { scan(); }, 1500);
  setInterval(() => { scan(); }, 5000);
})();
`;

  // Faithful port of TDM Fast v4.7.3 background.js -> wired to Joel Desk Pro local engine + joeldeskpro:// wake-up
  const backgroundJs = `'use strict';
// JoelDeskPro sniffer — comprehensive resource detection (HTTP files, HLS, DASH, media)
const JDP_ENDPOINT = ${JSON.stringify(endpoint)};
const JDP_TOKEN = ${JSON.stringify(token)};

const VIDEO_PLATFORMS = /(^|\\.)(youtube\\.com|youtu\\.be|twitter\\.com|x\\.com|reddit\\.com|redd\\.it|tiktok\\.com|vimeo\\.com|bilibili\\.com|facebook\\.com|instagram\\.com|twitch\\.tv|dailymotion\\.com)$/i;

function isVideoPlatformPage(url) {
  try {
    const u = new URL(url);
    if (!VIDEO_PLATFORMS.test(u.hostname)) return false;
    const p = u.pathname;
    if (/youtube\\.com$/i.test(u.hostname)) return /\\/watch|\\/shorts\\//.test(p + u.search) || u.searchParams.has('v');
    if (/youtu\\.be$/i.test(u.hostname)) return p.length > 1;
    if (/tiktok\\.com$/i.test(u.hostname)) return /\\/video\\/|\\/@/.test(p);
    if (/(twitter|x)\\.com$/i.test(u.hostname)) return /\\/status\\//.test(p);
    if (/reddit\\.com$/i.test(u.hostname)) return /\\/comments\\//.test(p);
    if (/bilibili\\.com$/i.test(u.hostname)) return /\\/video\\//.test(p);
    return p.length > 1;
  } catch (e) { return false; }
}

const RES_EXT = /\\.(mp4|mkv|avi|mov|flv|webm|ts|m4v|3gp|mp3|flac|wav|aac|m4a|ogg|opus|zip|rar|7z|tar|gz|xz|bz2|iso|exe|msi|dmg|apk|deb|rpm|pdf|docx?|xlsx?|pptx?|epub|mobi|azw3|psd|ai|sketch|torrent)(\\?|$)/i;
const MEDIA_MIME = /^(video|audio)\\//i;
const STREAM_MIME = /(mpegurl|dash\\+xml)/i;
const DOC_MIME = /(application\\/(zip|x-rar|x-7z|octet-stream|pdf|vnd\\.|x-msdownload|x-apple-diskimage))/i;

const MIN_MEDIA_SIZE = 200 * 1024;

const tabResources = new Map();
let _activeTabId = -1;
try {
  chrome.tabs.onActivated.addListener((info) => { _activeTabId = info.tabId; });
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => { if (tabs && tabs[0]) _activeTabId = tabs[0].id; });
  chrome.windows.onFocusChanged.addListener(() => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => { if (tabs && tabs[0]) _activeTabId = tabs[0].id; });
  });
} catch (e) {}
const tabInfo = new Map();

function keyFor(url) { return url.split('#')[0]; }

function filenameFromUrl(url, fallbackExt) {
  try {
    const u = new URL(url);
    let name = decodeURIComponent(u.pathname.split('/').pop() || '');
    if (!name || !name.includes('.')) {
      const host = u.hostname.replace(/^www\\./, '');
      name = (name || host) + (fallbackExt ? '.' + fallbackExt : '');
    }
    return name || 'download';
  } catch (e) { return 'download'; }
}

function classify(mime, url) {
  const u = url.toLowerCase();
  if (/mpegurl/i.test(mime) || /\\.m3u8/.test(u)) return { kind: 'hls', tag: '视频流(HLS)' };
  if (/dash\\+xml/i.test(mime) || /\\.mpd/.test(u)) return { kind: 'dash', tag: '视频流(DASH)' };
  if (/^video\\//i.test(mime) || /\\.(mp4|mkv|webm|flv|mov|avi|ts|m4v)/.test(u)) return { kind: 'http', tag: '视频' };
  if (/^audio\\//i.test(mime) || /\\.(mp3|flac|m4a|aac|wav|ogg|opus)/.test(u)) return { kind: 'http', tag: '音频' };
  if (/\\.(zip|rar|7z|tar|gz|xz|bz2|iso)/.test(u)) return { kind: 'http', tag: '压缩包' };
  if (/\\.(exe|msi|dmg|apk|deb|rpm)/.test(u)) return { kind: 'http', tag: '程序' };
  if (/\\.(pdf|docx?|xlsx?|pptx?|epub|mobi)/.test(u)) return { kind: 'http', tag: '文档' };
  return { kind: 'http', tag: '文件' };
}

function addResource(tabId, res) {
  if (tabId < 0) {
    if (_activeTabId >= 0) tabId = _activeTabId;
    else return;
  }
  if (!tabResources.has(tabId)) tabResources.set(tabId, new Map());
  const map = tabResources.get(tabId);
  const k = keyFor(res.url);
  if (!res.ownerPage) {
    const info = tabInfo.get(tabId);
    res.ownerPage = pageKey((info && info.pageUrl) || res.url);
  }
  if (map.has(k)) {
    const prev = map.get(k);
    if (res.size && !prev.size) prev.size = res.size;
    return;
  }
  map.set(k, res);
  updateBadge(tabId);
}

function pruneToPage(tabId, url) {
  const map = tabResources.get(tabId);
  if (!map) return;
  const cur = pageKey(url);
  for (const [k, r] of map) {
    const owner = r.ownerPage || pageKey(r.url);
    if (owner !== cur) map.delete(k);
  }
  updateBadge(tabId);
}

function updateBadge(tabId) {
  const n = tabResources.get(tabId)?.size || 0;
  chrome.action.setBadgeBackgroundColor({ color: '#2563EB' });
  try {
    const p = chrome.action.setBadgeText({ tabId, text: n ? String(Math.min(n, 99)) : '' });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {}
}

// ---- Header-based sniffing ----
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type === 'main_frame') return;
    const url = details.url;
    if (isBlacklisted(url, extSettings)) return;

    const info0 = tabInfo.get(details.tabId);
    if (info0 && info0.isVideoPlatform) return;

    const headers = details.responseHeaders || [];
    let mime = '', size = null, disp = '';
    for (const h of headers) {
      const n = h.name.toLowerCase();
      if (n === 'content-type') mime = h.value || '';
      else if (n === 'content-length') size = parseInt(h.value, 10);
      else if (n === 'content-disposition') disp = h.value || '';
    }
    const isM3u8OrMpd = /\\.(m3u8|mpd)(\\?|$|#)/i.test(url) || /[?&](m3u8|playlist|manifest)/i.test(url);
    const isStream = STREAM_MIME.test(mime) || isM3u8OrMpd;
    const isMedia = MEDIA_MIME.test(mime);
    const isAttachment = /attachment/i.test(disp);
    const isResExt = RES_EXT.test(url);
    const isDoc = DOC_MIME.test(mime);

    if (!(isStream || isMedia || isAttachment || isResExt || isDoc)) return;

    if (!isM3u8OrMpd && /\\.(ts|m4s)(\\?|$)/i.test(url) && !isAttachment) return;
    if (/videoplayback|googlevideo\\.com/i.test(url) && !isAttachment) return;
    if (!isM3u8OrMpd && /[?&](range|sq|rn|rbuf|itag)=/i.test(url) && !isAttachment) return;
    if (/\\/api\\/|\\.json(\\?|$)|badge_count|settings\\.json/i.test(url) && !isAttachment && !isResExt && !isMedia && !isStream) return;
    if (isMedia && !isStream && !isAttachment && size != null && size < MIN_MEDIA_SIZE) return;

    const cls = classify(mime, url);
    let filename = filenameFromUrl(url, cls.kind === 'hls' || cls.kind === 'dash' ? 'mp4' : '');
    const m = /filename\\*?=(?:UTF-8'')?"?([^;"]+)"?/i.exec(disp);
    if (m) { try { filename = decodeURIComponent(m[1]); } catch (e) { filename = m[1]; } }
    if (cls.kind === 'hls' || cls.kind === 'dash') {
      const info = tabInfo.get(details.tabId);
      if (info && info.title && /^(index|master|playlist|manifest|video|chunklist)/i.test(filename)) {
        filename = sanitize(cleanTitle(info.title, info.pageUrl || url)) + '.mp4';
      }
    }
    addResource(details.tabId, {
      url, filename, mime, size: Number.isFinite(size) ? size : null,
      kind: cls.kind, tag: cls.tag,
      referer: tabInfo.get(details.tabId)?.pageUrl || details.initiator || '',
    });
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

function sanitize(s) { return (s || 'video').replace(/[\\\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'video'; }

const GENERIC_TITLE = /^(主页|首页|探索|通知|消息|home|explore|notifications|messages|x|twitter|youtube|reddit|tiktok|bilibili|哔哩哔哩)(\\s*[·|\\-–—]?\\s*(x|twitter|youtube|reddit|tiktok))?\\s*$/i;
function cleanTitle(title, url) {
  let t = (title || '').replace(/^\\(\\d+\\+?\\)\\s*/, '').trim();
  t = t.replace(/\\s*[|\\-–—]\\s*(X|Twitter|YouTube|Reddit|TikTok)\\s*$/i, '').trim();
  if (!t || GENERIC_TITLE.test(t)) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      const si = parts.indexOf('status');
      if (si > 0 && parts[si + 1]) return parts[0] + '-' + parts[si + 1];
      const v = u.searchParams.get('v');
      if (v) return v;
      if (parts.length) return parts[parts.length - 1];
      return u.hostname.replace(/^www\\./, '');
    } catch (e) {}
  }
  return t || 'video';
}

function pageKey(url) {
  try { const u = new URL(url); return u.origin + u.pathname + u.search; }
  catch (e) { return url || ''; }
}

function syncTab(tabId, url, title) {
  if (!url) return;
  const prev = tabInfo.get(tabId);
  const isVP = isVideoPlatformPage(url);

  tabInfo.set(tabId, { title: title || (prev && prev.title), pageUrl: url, isVideoPlatform: isVP });
  pruneToPage(tabId, url);

  if (isVP) {
    addResource(tabId, {
      url,
      filename: sanitize(cleanTitle(title || (prev && prev.title), url)) + '.mp4',
      mime: 'video/*', size: null, kind: 'video-platform', tag: '在线视频',
      referer: url,
      ownerPage: pageKey(url),
    });
  }
}

chrome.tabs.onUpdated.addListener((tabId, ch, tab) => {
  if (!tab) return;
  if (ch.url || ch.title || ch.status === 'complete') {
    syncTab(tabId, ch.url || tab.url, tab.title);
  }
});

chrome.webNavigation?.onCommitted?.addListener?.((d) => {
  if (d.frameId === 0) { tabResources.delete(d.tabId); updateBadge(d.tabId); }
});
chrome.webNavigation?.onHistoryStateUpdated?.addListener?.((d) => {
  if (d.frameId !== 0) return;
  chrome.tabs.get(d.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    syncTab(d.tabId, d.url || tab.url, tab.title);
  });
});
chrome.webNavigation?.onReferenceFragmentUpdated?.addListener?.((d) => {
  if (d.frameId !== 0) return;
  chrome.tabs.get(d.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    syncTab(d.tabId, d.url || tab.url, tab.title);
  });
});
chrome.tabs.onRemoved.addListener((tabId) => { tabResources.delete(tabId); tabInfo.delete(tabId); });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab ? sender.tab.id : (msg.tabId ?? -1);

  if (msg.type === 'spaNavigate') {
    if (tabId >= 0 && msg.url) syncTab(tabId, msg.url, msg.title);
    reply && reply({ ok: true });
    return true;
  }
  if (msg.type === 'titleUpdate') {
    if (tabId >= 0 && msg.url) {
      const info = tabInfo.get(tabId);
      if (info && pageKey(info.pageUrl) === pageKey(msg.url)) {
        info.title = msg.title;
        const map = tabResources.get(tabId);
        if (map) {
          for (const r of map.values()) {
            if (r.kind === 'video-platform' && pageKey(r.url) === pageKey(msg.url)) {
              r.filename = sanitize(cleanTitle(msg.title, msg.url)) + '.mp4';
            }
          }
        }
      }
    }
    reply && reply({ ok: true });
    return true;
  }
  if (msg.type === 'domMedia' && Array.isArray(msg.items)) {
    const ti = tabInfo.get(tabId);
    if (ti && ti.isVideoPlatform) { reply && reply({ ok: true }); return true; }
    for (const it of msg.items) {
      if (!it.url || it.url.startsWith('blob:') || it.url.startsWith('data:')) continue;
      const cls = classify(it.mime || '', it.url);
      addResource(tabId, { url: it.url, filename: filenameFromUrl(it.url, 'mp4'), mime: it.mime || '', size: null, kind: cls.kind, tag: cls.tag, referer: it.pageUrl || '' });
    }
    reply && reply({ ok: true });
    return true;
  }
  if (msg.type === 'getResources') {
    chrome.tabs.get(msg.tabId, (tab) => {
      const liveUrl = (!chrome.runtime.lastError && tab && tab.url) || null;
      if (liveUrl) {
        const info = tabInfo.get(msg.tabId);
        if (!info || pageKey(info.pageUrl) !== pageKey(liveUrl)) {
          syncTab(msg.tabId, liveUrl, tab.title);
        } else {
          pruneToPage(msg.tabId, liveUrl);
        }
      }
      const map = tabResources.get(msg.tabId);
      reply({
        resources: map ? [...map.values()] : [],
        info: tabInfo.get(msg.tabId) || {},
      });
    });
    return true;
  }
  if (msg.type === 'getSniffed') {
    const tid = sender && sender.tab && sender.tab.id;
    if (tid == null) { reply({ items: [] }); return true; }
    const map = tabResources.get(tid);
    reply({ items: map ? [...map.values()] : [] });
    return true;
  }
  if (msg.type === 'send') { sendToJoelDeskPro(msg.items); reply({ ok: true }); return true; }
  if (msg.type === 'clear') { tabResources.delete(msg.tabId); updateBadge(msg.tabId); reply({ ok: true }); return true; }
});

// ============================================================
// Download takeover (IDM-style) — 7 categories + customExt + minSize + blacklist
// ============================================================
const CATEGORY_EXT = {
  video: ['mp4','mkv','webm','avi','mov','flv','wmv','m4v','mpg','mpeg','ts','m2ts','3gp','ogv','m3u8','mpd','rmvb','vob'],
  audio: ['mp3','m4a','aac','flac','wav','ogg','opus','wma','alac','aiff','weba','mid'],
  archive: ['zip','rar','7z','tar','gz','bz2','xz','tgz','iso','cab'],
  program: ['exe','msi','dmg','pkg','apk','deb','rpm','appimage','bat'],
  document: ['pdf','doc','docx','xls','xlsx','ppt','pptx','epub','mobi','txt','csv'],
  model: ['gguf','safetensors','bin','ckpt','pt','pth','onnx','h5','tflite'],
  other: ['torrent','magnet'],
};
const DEFAULT_SETTINGS = {
  takeover: true,
  categories: { video: true, audio: true, archive: true, program: true, document: true, model: true, other: true },
  customExt: [],
  minSize: 0,
  blacklist: [],
};
let extSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

function isBlacklisted(url, settings) {
  const list = settings.blacklist || [];
  if (!list.length) return false;
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return false; }
  if (!host) return false;
  for (let d of list) {
    d = String(d).trim().toLowerCase()
      .replace(/^https?:\\/\\//, '').replace(/\\/.*$/, '').replace(/^\\*\\./, '').replace(/^\\./, '');
    if (!d) continue;
    if (host === d || host.endsWith('.' + d)) return true;
  }
  return false;
}

function activeExtSet(settings) {
  const set = new Set();
  for (const [cat, on] of Object.entries(settings.categories || {})) {
    if (on) for (const e of CATEGORY_EXT[cat] || []) set.add(e);
  }
  for (const e of settings.customExt || []) {
    const clean = String(e).trim().replace(/^\\./, '').toLowerCase();
    if (clean) set.add(clean);
  }
  return set;
}
function extOf(item) {
  const src = (item.filename || item.finalUrl || item.url || '').split(/[?#]/)[0];
  const m = /\\.([a-z0-9]{1,12})$/i.exec(src);
  return m ? m[1].toLowerCase() : '';
}
function shouldIntercept(item, settings) {
  if (!settings.takeover) return false;
  const url = item.url || item.finalUrl || '';
  if (!/^https?:/i.test(url)) return false;
  if (isBlacklisted(url, settings)) return false;
  if (item.byExtensionId) return false;
  if (settings.minSize > 0 && item.fileSize > 0 && item.fileSize < settings.minSize * 1024 * 1024) return false;

  const mime = (item.mime || '').toLowerCase();
  const cats = settings.categories || {};
  if (cats.video && mime.startsWith('video/')) return true;
  if (cats.audio && mime.startsWith('audio/')) return true;
  const ext = extOf(item);
  if (!ext) return false;
  return activeExtSet(settings).has(ext);
}

function applyStored(r) {
  if (r && typeof r === 'object') {
    if (typeof r.takeover === 'boolean') extSettings.takeover = r.takeover;
    if (r.categories && typeof r.categories === 'object') extSettings.categories = Object.assign({}, DEFAULT_SETTINGS.categories, r.categories);
    if (Array.isArray(r.customExt)) extSettings.customExt = r.customExt;
    if (typeof r.minSize === 'number') extSettings.minSize = r.minSize;
    if (Array.isArray(r.blacklist)) extSettings.blacklist = r.blacklist;
  }
  try {
    chrome.contextMenus.update('jdp-toggle', { checked: extSettings.takeover }, () => {
      if (chrome.runtime.lastError) { try { createMenus(); } catch (e) {} }
    });
  } catch (e) {}
}
chrome.storage.local.get(['takeover','categories','customExt','minSize','blacklist'], applyStored);
chrome.storage.onChanged.addListener((ch) => {
  const patch = {};
  for (const k of ['takeover','categories','customExt','minSize','blacklist']) if (ch[k]) patch[k] = ch[k].newValue;
  applyStored(patch);
});

if (chrome.downloads && chrome.downloads.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    try {
      if (!shouldIntercept(item, extSettings)) return;
      let fname = '';
      if (item.filename) fname = item.filename.split(/[\\\\/]/).pop();
      if (!fname) fname = filenameFromUrl(item.finalUrl || item.url);
      if (!fname) fname = 'download';
      chrome.downloads.cancel(item.id, () => {
        chrome.downloads.erase({ id: item.id }, () => {});
      });
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const ref = (tabs[0] && tabs[0].url) || item.referrer || '';
        sendToJoelDeskPro([{
          url: item.finalUrl || item.url,
          filename: fname,
          mime: item.mime, size: item.fileSize > 0 ? item.fileSize : null,
          referer: ref,
        }]);
      });
    } catch (e) {}
  });
}

// ---- context menu ----
function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'jdp-dl', title: '使用 Joel Desk Pro 下载此链接', contexts: ['link', 'video', 'audio', 'image'] });
    chrome.contextMenus.create({ id: 'jdp-video', title: '使用 Joel Desk Pro 下载此视频', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'jdp-all', title: '嗅探本页全部资源到 Joel Desk Pro', contexts: ['page', 'action'] });
    chrome.contextMenus.create({ id: 'jdp-toggle', title: '接管视频/音频下载', type: 'checkbox', checked: extSettings.takeover, contexts: ['action'] });
  });
}
chrome.runtime.onInstalled.addListener(createMenus);
createMenus();
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'jdp-dl') {
    const url = info.linkUrl || info.srcUrl;
    if (url) sendToJoelDeskPro([{ url, filename: filenameFromUrl(url), referer: tab?.url || '' }]);
  } else if (info.menuItemId === 'jdp-video') {
    if (tab && tab.url) sendToJoelDeskPro([{ url: tab.url, filename: sanitize(tab.title || 'video') + '.mp4', kind: 'video-platform', referer: tab.url }]);
    else notify('无法下载', '未获取到当前页面地址。');
  } else if (info.menuItemId === 'jdp-all') {
    const map = tabResources.get(tab.id);
    if (map && map.size) sendToJoelDeskPro([...map.values()]);
    else notify('未发现资源', '当前页面还没有嗅探到可下载资源。');
  } else if (info.menuItemId === 'jdp-toggle') {
    extSettings.takeover = info.checked;
    chrome.storage.local.set({ takeover: info.checked });
    notify('Joel Desk Pro', info.checked ? '已开启：视频/音频将自动用 Joel Desk Pro 下载' : '已关闭：下载交回浏览器');
  }
});

// 登录态 cookies 读取（直接从运行中的浏览器读取，不受 App-Bound 加密影响）
const COOKIE_HOSTS = /(^|\\.)(youtube\\.com|youtu\\.be|douyin\\.com|iesdouyin\\.com|bilibili\\.com|x\\.com|twitter\\.com|instagram\\.com|facebook\\.com|weibo\\.com)$/i;
function hostNeedsCookies(url) {
  try { return COOKIE_HOSTS.test(new URL(url).hostname); } catch (e) { return false; }
}
function getCookiesForUrl(url) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve(null); }
    const pick = (c) => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, hostOnly: c.hostOnly,
      session: c.session, expirationDate: c.expirationDate,
    });
    const merge = (lists) => {
      const map = new Map();
      for (const arr of lists) for (const c of (arr || [])) map.set(c.name + '|' + c.domain + '|' + c.path, c);
      return [...map.values()].map(pick);
    };
    try {
      chrome.cookies.getAll({ url: u.origin + '/' }, (a) => {
        const byUrl = chrome.runtime.lastError ? [] : (a || []);
        const root = u.hostname.replace(/^www\\./, '').split('.').slice(-2).join('.');
        chrome.cookies.getAll({ domain: root }, (b) => {
          const byDomain = chrome.runtime.lastError ? [] : (b || []);
          try { resolve(merge([byUrl, byDomain])); } catch (e) { resolve(byUrl.map(pick)); }
        });
      });
    } catch (e) { resolve(null); }
  });
}

async function sendToJoelDeskPro(items) {
  const payload = await Promise.all(items.map(async (it) => {
    const o = {
      source: 'chrome_extension',
      url: it.url,
      filename: it.filename,
      fileName: it.filename,
      kind: it.kind,
      mime: it.mime,
      size: it.size,
      referer: it.referer || '',
      headers: it.referer ? { Referer: it.referer } : undefined,
    };
    if (hostNeedsCookies(it.url)) {
      try {
        const cks = await getCookiesForUrl(it.url);
        if (cks && cks.length) {
          o.cookies = cks;
          o.hasCookies = true;
        }
      } catch (e) {}
    }
    return o;
  }));
  const body = JSON.stringify(payload.length === 1 ? payload[0] : { items: payload });
  try {
    const res = await fetch(JDP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DeskKit-Token': JDP_TOKEN,
      },
      body,
    });
    if (!res.ok) throw new Error('bad status');
    notify('已发送到 Joel Desk Pro', payload.length === 1 ? payload[0].filename : payload.length + ' 个资源');
  } catch (e) {
    // 桌面客户端未运行 → 使用 joeldeskpro:// 自定义协议唤起并传递任务
    launchViaProtocol(payload);
  }
}

function utf8ToBase64(str) {
  try {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch (e) {
    try { return btoa(unescape(encodeURIComponent(str))); } catch (e2) { return ''; }
  }
}

function launchViaProtocol(payload) {
  const hasCookies = Array.isArray(payload) && payload.some((p) => p && Array.isArray(p.cookies) && p.cookies.length);
  let proto;
  if (hasCookies) {
    proto = 'joeldeskpro://capture?launch=1';
  } else {
    const data = utf8ToBase64(JSON.stringify(payload));
    if (!data) { notify('发送失败', '请确认已安装并运行 Joel Desk Pro 客户端。'); return; }
    proto = 'joeldeskpro://capture?data=' + encodeURIComponent(data);
  }

  const fallbackTabLaunch = () => {
    try {
      chrome.tabs.create({ url: proto, active: false }, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          notify('发送失败', '请确认已安装并运行 Joel Desk Pro 客户端。');
          return;
        }
        setTimeout(() => { try { chrome.tabs.remove(tab.id); } catch (e) {} }, 1500);
      });
    } catch (e) {
      notify('发送失败', '请确认已安装并运行 Joel Desk Pro 客户端。');
    }
  };

  notify('正在启动 Joel Desk Pro', '客户端未运行，正在为您启动…首次会提示"打开 Joel Desk Pro?"，请点允许。');
  try {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const url = tab && tab.url ? tab.url : '';
      const injectable = /^https?:/i.test(url);
      if (tab && injectable) {
        chrome.tabs.sendMessage(tab.id, { type: 'openProtocol', url: proto }, { frameId: 0 }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) fallbackTabLaunch();
        });
      } else {
        fallbackTabLaunch();
      }
      retrySend(payload, hasCookies);
    });
  } catch (e) {
    fallbackTabLaunch();
    retrySend(payload, hasCookies);
  }
}

async function retrySend(payload, multi) {
  const delays = multi ? [3000, 3000, 4000, 5000] : [3500];
  const trySend = async () => {
    try {
      const res = await fetch(JDP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DeskKit-Token': JDP_TOKEN,
        },
        body: JSON.stringify(payload.length === 1 ? payload[0] : { items: payload }),
      });
      return res && res.ok;
    } catch (e) { return false; }
  };
  const step = (i) => {
    setTimeout(async () => {
      const ok = await trySend();
      if (!ok && i < delays.length - 1) step(i + 1);
    }, delays[i]);
  };
  step(0);
}

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title, message });
}
`;

  // Clean White & Blue rounded popup.html (100% same structure & controls as TDM Fast v4.7.3)
  const popupHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body {
    width: 372px;
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    font-size: 12px;
    background: #FFFFFF;
    color: #0F172A;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 12px 14px;
    background: #FFFFFF;
    border-bottom: 1px solid #E2E8F0;
  }
  .logo {
    width: 24px;
    height: 24px;
    flex: none;
    display: block;
  }
  .head h1 {
    font-size: 13.5px;
    font-weight: 600;
    margin: 0;
    flex: 1;
    color: #0F172A;
    letter-spacing: -0.01em;
  }
  .head button {
    background: #F1F5F9;
    border: 1px solid #E2E8F0;
    color: #475569;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background .14s, color .14s, border-color .14s;
  }
  .head button:hover {
    background: #EFF6FF;
    border-color: #BFDBFE;
    color: #2563EB;
  }
  .takeover-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    font-size: 12px;
    color: #334155;
    border-bottom: 1px solid #F1F5F9;
    user-select: none;
    background: #F8FAFC;
  }
  .takeover-row input {
    width: 15px;
    height: 15px;
    cursor: pointer;
    flex: none;
    accent-color: #2563EB;
  }
  .takeover-row label { flex: 1; cursor: pointer; font-weight: 500; }
  .gear {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    cursor: pointer;
    font-size: 13px;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #475569;
    border-radius: 8px;
    transition: background .14s, color .14s, border-color .14s;
  }
  .gear:hover {
    background: #EFF6FF;
    border-color: #BFDBFE;
    color: #2563EB;
  }
  .settings {
    display: none;
    padding: 12px 14px;
    background: #F8FAFC;
    border-bottom: 1px solid #E2E8F0;
  }
  .settings.open { display: block; }
  .settings h2 {
    font-size: 11px;
    color: #64748B;
    margin: 0 0 8px;
    font-weight: 600;
    letter-spacing: .03em;
  }
  .cats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px 12px;
    margin-bottom: 10px;
  }
  .cats label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #1E293B;
    cursor: pointer;
  }
  .cats input {
    width: 14px;
    height: 14px;
    cursor: pointer;
    accent-color: #2563EB;
  }
  .custom-row { margin-bottom: 9px; }
  .custom-row label {
    display: block;
    font-size: 11px;
    color: #64748B;
    margin-bottom: 4px;
  }
  .custom-row input,
  .custom-row textarea {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #CBD5E1;
    border-radius: 8px;
    font-size: 12px;
    background: #FFFFFF;
    color: #0F172A;
    font-family: inherit;
    outline: none;
    transition: border-color .14s, box-shadow .14s;
  }
  .custom-row input:focus,
  .custom-row textarea:focus {
    border-color: #2563EB;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }
  .custom-row textarea { resize: vertical; }
  .size-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #475569;
    margin-bottom: 9px;
  }
  .size-row input {
    width: 62px;
    padding: 5px 8px;
    border: 1px solid #CBD5E1;
    border-radius: 8px;
    font-size: 12px;
    background: #FFFFFF;
    color: #0F172A;
    outline: none;
  }
  .size-row input:focus {
    border-color: #2563EB;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }
  .settings .saved {
    font-size: 11px;
    color: #16A34A;
    font-weight: 500;
    margin-top: 4px;
    height: 14px;
  }
  .list {
    max-height: 340px;
    overflow-y: auto;
    padding: 8px 10px;
    background: #FFFFFF;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    margin-bottom: 6px;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    background: #FFFFFF;
    transition: background .14s, border-color .14s;
  }
  .item:last-child { margin-bottom: 0; }
  .item:hover {
    background: #F8FAFC;
    border-color: #BFDBFE;
  }
  .item input {
    margin: 0;
    width: 15px;
    height: 15px;
    cursor: pointer;
    accent-color: #2563EB;
    flex: none;
  }
  .meta { flex: 1; min-width: 0; }
  .fn {
    font-weight: 600;
    font-size: 12.5px;
    color: #0F172A;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    color: #64748B;
    font-size: 11px;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    padding: 28px 14px;
    text-align: center;
    color: #94A3B8;
    line-height: 1.6;
  }
  .tag {
    font-size: 10.5px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: #EFF6FF;
    color: #2563EB;
    white-space: nowrap;
    align-self: flex-start;
  }
  .hintline {
    font-size: 10.5px;
    color: #2563EB;
    margin-top: 3px;
    font-weight: 500;
  }
  .foot {
    display: flex;
    gap: 8px;
    padding: 10px 14px 12px;
    background: #FFFFFF;
    border-top: 1px solid #E2E8F0;
  }
  .foot button {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #CBD5E1;
    border-radius: 10px;
    background: #FFFFFF;
    color: #334155;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background .14s, border-color .14s, color .14s;
  }
  .foot button:hover {
    background: #F8FAFC;
    border-color: #94A3B8;
    color: #0F172A;
  }
  .foot button.primary {
    background: #2563EB;
    color: #FFFFFF;
    border-color: #2563EB;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.24);
  }
  .foot button.primary:hover {
    background: #1D4ED8;
    border-color: #1D4ED8;
  }
</style>
</head>
<body>
  <div class="head">
    <svg class="logo" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="3" width="58" height="58" rx="16" fill="#FFFFFF" stroke="#2563EB" stroke-width="3.6"/>
      <path d="M31.5 16.5H45.5V20.2C42.9 20.6 41.8 21.7 41.8 24.6V37.6C41.8 45.2 36.7 49.8 28.9 49.8C23.5 49.8 19.6 47.2 18.4 43.7C17.9 42.1 18.6 40.2 20.4 39.7C22 39.3 23.6 40.2 24.3 41.9C25.2 44.1 26.8 45.5 29.3 45.5C33.4 45.5 35.4 42.8 35.4 37.4V24.6C35.4 21.7 34.3 20.6 31.5 20.2V16.5Z" fill="#2563EB"/>
    </svg>
    <h1>Joel Desk Pro 嗅探到的资源</h1>
    <button id="clear">清空</button>
  </div>
  <div class="takeover-row">
    <input type="checkbox" id="takeover" checked>
    <label for="takeover">接管浏览器下载（点链接自动用 Joel Desk Pro）</label>
    <button class="gear" id="gear" title="设置要接管的文件类型">⚙</button>
  </div>
  <div class="settings" id="settings">
    <h2>接管以下类型的下载</h2>
    <div class="cats" id="cats"></div>
    <div class="custom-row">
      <label for="customExt">自定义扩展名（逗号分隔，如 psd, sketch, apk）</label>
      <input type="text" id="customExt" placeholder="留空则不额外接管">
    </div>
    <div class="size-row">
      <span>仅接管大于</span>
      <input type="number" id="minSize" min="0" step="1" value="0">
      <span>MB 的文件（0=不限）</span>
    </div>
    <div class="custom-row">
      <label for="blacklist">网站黑名单（这些站点不嗅探、不接管，逗号或换行分隔）</label>
      <textarea id="blacklist" rows="2" placeholder="如 bank.com, mail.company.com"></textarea>
    </div>
    <div class="saved" id="saved"></div>
  </div>
  <div id="list" class="list"></div>
  <div class="foot">
    <button id="selAll">全选</button>
    <button id="send" class="primary">下载所选</button>
  </div>
  <script src="popup.js"></script>
</body>
</html>
`;

  // Faithful port of TDM Fast v4.7.3 popup.js
  const popupJs = `'use strict';
function fmtSize(b) {
  if (b == null) return '未知大小';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + ' ' + u[i];
}
function tagColor(kind) {
  return { hls: '#E11D48', dash: '#7C3AED', 'video-platform': '#2563EB', http: '#2563EB' }[kind] || '#2563EB';
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let resources = [];
let tabId = null;
const selection = new Map();
const listEl = document.getElementById('list');

function sig(list) { return list.map((r) => r.url).join('|'); }

function draw() {
  listEl.innerHTML = '';
  if (!resources.length) {
    listEl.innerHTML = '<div class="empty">当前页面暂未嗅探到资源。<br>播放视频、点击下载链接，或等待播放器加载后再看。</div>';
    return;
  }
  resources.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'item';
    const checked = selection.get(r.url) ? 'checked' : '';
    const hint = r.kind === 'video-platform'
      ? '<div class="hintline">整页视频：将解析并选择清晰度后下载</div>' : '';
    const col = tagColor(r.kind);
    div.innerHTML = \`
      <input type="checkbox" data-url="\${encodeURIComponent(r.url)}" \${checked}>
      <div class="meta">
        <div class="fn" title="\${esc(r.filename)}">\${esc(r.filename)}</div>
        <div class="sub" title="\${esc(r.url)}">\${fmtSize(r.size)} · \${esc(r.url)}</div>
        \${hint}
      </div>
      <span class="tag" style="background:\${col}18;color:\${col}">\${esc(r.tag || '文件')}</span>\`;
    listEl.appendChild(div);
  });
  listEl.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.onchange = () => selection.set(decodeURIComponent(cb.dataset.url), cb.checked);
  });
}

function selectedItems() {
  return resources.filter((r) => selection.get(r.url));
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab.id;
  let lastSig = null;
  const load = () => chrome.runtime.sendMessage({ type: 'getResources', tabId }, (resp) => {
    const next = (resp && resp.resources) || [];
    const nextSig = sig(next);
    if (nextSig === lastSig) return;
    lastSig = nextSig;
    for (const r of next) if (!selection.has(r.url)) selection.set(r.url, true);
    const present = new Set(next.map((r) => r.url));
    for (const k of [...selection.keys()]) if (!present.has(k)) selection.delete(k);
    resources = next;
    draw();
  });
  load();
  setInterval(load, 1500);

  document.getElementById('send').onclick = () => {
    const items = selectedItems();
    if (!items.length) return;
    chrome.runtime.sendMessage({ type: 'send', items }, () => window.close());
  };
  document.getElementById('selAll').onclick = () => {
    const allSel = resources.length > 0 && resources.every((r) => selection.get(r.url));
    for (const r of resources) selection.set(r.url, !allSel);
    draw();
    document.getElementById('selAll').textContent = allSel ? '全选' : '取消全选';
  };
  document.getElementById('clear').onclick = () => {
    chrome.runtime.sendMessage({ type: 'clear', tabId }, () => { resources = []; selection.clear(); lastSig = null; draw(); });
  };

  const CATEGORY_LABELS = {
    video: '视频', audio: '音频', archive: '压缩包', program: '程序/安装包',
    document: '文档', model: '大模型', other: '种子/磁力',
  };
  const CATEGORY_ORDER = ['video','audio','archive','program','document','model','other'];
  const DEFAULTS = {
    takeover: true,
    categories: { video:true, audio:true, archive:true, program:true, document:true, model:true, other:true },
    customExt: [], minSize: 0, blacklist: [],
  };
  const tk = document.getElementById('takeover');
  const gear = document.getElementById('gear');
  const panel = document.getElementById('settings');
  const catsEl = document.getElementById('cats');
  const customEl = document.getElementById('customExt');
  const minSizeEl = document.getElementById('minSize');
  const blacklistEl = document.getElementById('blacklist');
  const savedEl = document.getElementById('saved');

  for (const cat of CATEGORY_ORDER) {
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.cat = cat;
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(CATEGORY_LABELS[cat]));
    catsEl.appendChild(lab);
  }

  let saveTimer = null;
  function flashSaved() {
    savedEl.textContent = '✓ 已保存';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { savedEl.textContent = ''; }, 1200);
  }
  function collectAndSave() {
    const categories = {};
    catsEl.querySelectorAll('input[data-cat]').forEach((cb) => { categories[cb.dataset.cat] = cb.checked; });
    const customExt = customEl.value.split(/[,，\\s]+/).map((s) => s.trim().replace(/^\\./, '').toLowerCase()).filter(Boolean);
    const minSize = Math.max(0, parseInt(minSizeEl.value, 10) || 0);
    const blacklist = (blacklistEl ? blacklistEl.value : '').split(/[,，\\s\\n]+/)
      .map((s) => s.trim().toLowerCase().replace(/^https?:\\/\\//, '').replace(/\\/.*$/, ''))
      .filter(Boolean);
    chrome.storage.local.set({ takeover: tk.checked, categories, customExt, minSize, blacklist }, flashSaved);
  }
  function loadSettings() {
    chrome.storage.local.get(['takeover','categories','customExt','minSize','blacklist'], (r) => {
      tk.checked = (typeof r.takeover === 'boolean') ? r.takeover : DEFAULTS.takeover;
      const cats = Object.assign({}, DEFAULTS.categories, r.categories || {});
      catsEl.querySelectorAll('input[data-cat]').forEach((cb) => { cb.checked = !!cats[cb.dataset.cat]; });
      customEl.value = Array.isArray(r.customExt) ? r.customExt.join(', ') : '';
      minSizeEl.value = (typeof r.minSize === 'number') ? r.minSize : 0;
      if (blacklistEl) blacklistEl.value = Array.isArray(r.blacklist) ? r.blacklist.join(', ') : '';
    });
  }
  loadSettings();

  gear.onclick = () => panel.classList.toggle('open');
  tk.onchange = collectAndSave;
  catsEl.addEventListener('change', collectAndSave);
  customEl.addEventListener('change', collectAndSave);
  minSizeEl.addEventListener('change', collectAndSave);
  if (blacklistEl) blacklistEl.addEventListener('change', collectAndSave);
}
init();
`;

  const zipBlob = () =>
    createZipBlob([
      { path: 'manifest.json', content: manifestJson },
      { path: 'inject.js', content: injectJs },
      { path: 'content.js', content: contentJs },
      { path: 'background.js', content: backgroundJs },
      { path: 'popup.html', content: popupHtml },
      { path: 'popup.js', content: popupJs },
      { path: 'icons/16.png', content: createDeskKitIconPng(16) },
      { path: 'icons/48.png', content: createDeskKitIconPng(48) },
      { path: 'icons/128.png', content: createDeskKitIconPng(128) },
    ]);

  return { endpoint, manifestJson, injectJs, contentJs, backgroundJs, popupHtml, popupJs, zipBlob };
}

/**
 * Generates a ready-to-run zero-dependency local Node.js desktop engine (`joeldeskpro-local-engine.mjs`)
 * that listens on 127.0.0.1:<port>, performs REAL HTTP Range multi-threaded chunked downloads
 * directly into the user's chosen local folder, and accepts pushes from JoelDeskPro Chrome extension.
 */
export function buildLocalEngineScript(port: number, token: string, defaultSaveDir: string): string {
  return `// Joel Desk Pro 本地多线程 Range 分片下载引擎 + JoelDeskPro 插件接收服务（Node.js 18+ 零依赖）
// 运行方式：node joeldeskpro-local-engine.mjs
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const PORT = ${port};
const TOKEN = ${JSON.stringify(token)};
const ACCEPTED_TOKENS = new Set([TOKEN, 'joeldeskpro-local-bridge', 'deskkit-local-bridge'].filter(Boolean));
function isTokenAuthorized(reqToken) {
  if (!reqToken) return true;
  return ACCEPTED_TOKENS.has(String(reqToken).trim());
}

let DEFAULT_SAVE_DIR = ${JSON.stringify(defaultSaveDir)}.startsWith('~')
  ? path.join(os.homedir(), ${JSON.stringify(defaultSaveDir)}.slice(1))
  : ${JSON.stringify(defaultSaveDir)};

const tasks = new Map();
const recentUrls = new Map();

async function findGitProjectDir() {
  for (const dir of [process.cwd(), SCRIPT_DIR, path.join(SCRIPT_DIR, 'JoelDeskPro')]) {
    try {
      await fs.access(path.join(dir, '.git'));
      return dir;
    } catch {}
  }
  return null;
}

async function runLocalGitUpdate(repo, branch) {
  const safeRepo = (repo || 'joelting02-sys/JoelDeskPro').replace(/[^A-Za-z0-9_.\\-/]/g, '');
  const safeBranch = (branch || 'main').replace(/[^A-Za-z0-9_.\\-/]/g, '');
  const repoUrl = \`https://github.com/\${safeRepo}.git\`;
  const logs = [];
  let projectDir = await findGitProjectDir();

  if (!projectDir) {
    projectDir = path.join(process.cwd(), 'JoelDeskPro');
    logs.push('> git clone -b ' + safeBranch + ' ' + repoUrl);
    const r = await execFileAsync('git', ['clone', '-b', safeBranch, repoUrl, projectDir], { timeout: 120000 });
    logs.push((r.stdout || r.stderr || '').trim());
  } else {
    logs.push('> git fetch origin ' + safeBranch + ' (in ' + projectDir + ')');
    await execFileAsync('git', ['fetch', 'origin', safeBranch], { cwd: projectDir, timeout: 60000 });
    try {
      const pullRes = await execFileAsync('git', ['pull', '--ff-only', 'origin', safeBranch], { cwd: projectDir, timeout: 60000 });
      logs.push((pullRes.stdout || pullRes.stderr || '').trim());
    } catch {
      const resetRes = await execFileAsync('git', ['reset', '--hard', 'origin/' + safeBranch], { cwd: projectDir, timeout: 60000 });
      logs.push((resetRes.stdout || resetRes.stderr || '').trim());
    }
  }

  const npmOpts = { cwd: projectDir, timeout: 180000, shell: process.platform === 'win32' };
  logs.push('> npm install');
  const inst = await execFileAsync('npm', ['install'], npmOpts);
  if (inst.stdout) logs.push(inst.stdout.trim().slice(-400));

  logs.push('> npm run build');
  const build = await execFileAsync('npm', ['run', 'build'], npmOpts);
  if (build.stdout) logs.push(build.stdout.trim().slice(-400));

  const shaRes = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, timeout: 15000 });
  const updatedSha = (shaRes.stdout || '').trim();
  console.log('[Joel Desk Pro] 已拉取最新 GitHub 版本:', updatedSha.slice(0, 7));
  return { ok: true, updatedSha, message: '已成功拉取最新代码并完成构建（' + updatedSha.slice(0, 7) + '）', log: logs.filter(Boolean).join('\\n') };
}

function sanitizeName(name) {
  return (name || 'download.bin').replace(/[\\\\/:*?"<>|]+/g, '_').trim() || 'download.bin';
}

async function writeNetscapeCookiesTempFile(cookies) {
  if (!Array.isArray(cookies) || !cookies.length) return null;
  const lines = ['# Netscape HTTP Cookie File'];
  for (const c of cookies) {
    if (!c || !c.name) continue;
    const domain = String(c.domain || '').trim();
    if (!domain) continue;
    const includeSub = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const cpath = c.path || '/';
    const secure = c.secure ? 'TRUE' : 'FALSE';
    const expiry = c.expirationDate ? Math.floor(Number(c.expirationDate)) : Math.floor(Date.now() / 1000) + 86400 * 30;
    const val = String(c.value || '').replace(/[\\r\\n\\t]/g, '');
    lines.push(\`\${domain}\\t\${includeSub}\\t\${cpath}\\t\${secure}\\t\${expiry}\\t\${c.name}\\t\${val}\`);
  }
  if (lines.length <= 1) return null;
  const tmpFile = path.join(os.tmpdir(), \`joeldeskpro-ck-\${Date.now()}-\${Math.random().toString(36).slice(2, 7)}.txt\`);
  await fs.writeFile(tmpFile, lines.join('\\n') + '\\n', 'utf8');
  return tmpFile;
}

async function downloadMultiChunkRange(task) {
  const { url, filePath, threads, headers } = task;
  const reqHeaders = { 'User-Agent': 'Mozilla/5.0 JoelDeskPro/1.3', ...headers };

  const headRes = await fetch(url, { method: 'HEAD', headers: reqHeaders });
  const totalBytes = Number(headRes.headers.get('content-length') || 0);
  const acceptRanges = (headRes.headers.get('accept-ranges') || '').toLowerCase();

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (totalBytes >= 2 * 1024 * 1024 && acceptRanges !== 'none') {
    const chunkCount = Math.min(Math.max(4, threads), 16);
    const chunkSize = Math.ceil(totalBytes / chunkCount);
    task.totalBytes = totalBytes;
    task.chunks = Array.from({ length: chunkCount }, () => 0);

    const fh = await fs.open(filePath, 'w');
    try {
      await fh.truncate(totalBytes);
      await Promise.all(
        Array.from({ length: chunkCount }, async (_, idx) => {
          const start = idx * chunkSize;
          const end = Math.min(totalBytes - 1, start + chunkSize - 1);
          const expected = end - start + 1;
          const res = await fetch(url, {
            headers: { ...reqHeaders, Range: \`bytes=\${start}-\${end}\` },
          });
          if (!res.ok || !res.body) throw new Error('Chunk ' + idx + ' HTTP ' + res.status);

          let written = 0;
          for await (const buf of res.body) {
            const bytes = Buffer.from(buf);
            await fh.write(bytes, 0, bytes.length, start + written);
            written += bytes.length;
            task.downloadedBytes += bytes.length;
            task.chunks[idx] = Math.min(100, Math.round((written / expected) * 100));
          }
          task.chunks[idx] = 100;
        })
      );
    } finally {
      await fh.close();
    }
    task.status = 'completed';
    console.log('[Joel Desk Pro] 分片下载完成 ->', filePath);
    return;
  }

  const res = await fetch(url, { headers: reqHeaders });
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
  const fh = await fs.open(filePath, 'w');
  try {
    for await (const buf of res.body) {
      const bytes = Buffer.from(buf);
      await fh.write(bytes);
      task.downloadedBytes += bytes.length;
    }
  } finally {
    await fh.close();
  }
  task.chunks = [100, 100, 100, 100, 100, 100, 100, 100];
  task.status = 'completed';
  console.log('[Joel Desk Pro] 下载完成 ->', filePath);
}

async function downloadViaYtdlp(task) {
  await fs.mkdir(task.saveDir, { recursive: true });
  let cookieFile = null;
  try {
    cookieFile = await writeNetscapeCookiesTempFile(task.rawCookies);
    const outTemplate = path.join(task.saveDir, '%(title).80s.%(ext)s');
    const args = ['-N', String(Math.min(16, task.threads)), '--merge-output-format', 'mp4', '-o', outTemplate];
    if (cookieFile) args.push('--cookies', cookieFile);
    if (task.headers && task.headers.Referer) args.push('--referer', task.headers.Referer);
    args.push(task.url);
    await new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', args, { stdio: 'inherit' });
      proc.on('exit', (code) => {
        if (code === 0) {
          task.status = 'completed';
          task.chunks = [100, 100, 100, 100, 100, 100, 100, 100];
          resolve();
        } else {
          reject(new Error('yt-dlp exited with code ' + code));
        }
      });
      proc.on('error', reject);
    });
  } finally {
    if (cookieFile) fs.unlink(cookieFile).catch(() => {});
  }
}

function startTask(payload) {
  const id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const saveDir = payload.saveDir || DEFAULT_SAVE_DIR || path.join(os.homedir(), 'Downloads');
  const fileName = sanitizeName(payload.fileName || payload.filename || 'download.mp4');
  const threads = Number(payload.threads) || 16;
  const cookieHeader = Array.isArray(payload.cookies)
    ? payload.cookies.map((c) => \`\${c.name}=\${c.value}\`).join('; ')
    : typeof payload.cookies === 'string'
      ? payload.cookies
      : '';

  const headers = {};
  const ref = payload.referer || (payload.headers && (payload.headers.Referer || payload.headers.referer)) || '';
  if (ref) headers.Referer = ref;
  if (cookieHeader) headers.Cookie = cookieHeader;

  const task = {
    id,
    url: payload.url,
    fileName,
    saveDir,
    filePath: path.join(saveDir, fileName),
    threads,
    headers,
    rawCookies: Array.isArray(payload.cookies) ? payload.cookies : null,
    totalBytes: 0,
    downloadedBytes: 0,
    chunks: Array.from({ length: 8 }, () => 0),
    status: 'downloading',
  };
  tasks.set(id, task);

  const isVideoPage = payload.kind === 'video-platform' || payload.kind === 'hls' || payload.kind === 'dash' || /(youtube\\.com|youtu\\.be|bilibili\\.com|tiktok\\.com|x\\.com|twitter\\.com)/i.test(payload.url);
  const runner = isVideoPage ? downloadViaYtdlp(task) : downloadMultiChunkRange(task);
  runner.catch((err) => {
    task.status = 'error';
    task.error = err.message;
    console.error('[Joel Desk Pro] 下载失败:', err.message);
  });
  return task;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DeskKit-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const reqUrl = new URL(req.url || '/', 'http://127.0.0.1:' + PORT);

  if (reqUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, saveDir: DEFAULT_SAVE_DIR, tasks: [...tasks.values()].map(({ headers, rawCookies, ...pub }) => pub) }));
    return;
  }

  if (req.method === 'POST' && (reqUrl.pathname === '/api/bridge/capture' || reqUrl.pathname === '/api/download' || reqUrl.pathname === '/capture')) {
    const reqToken = req.headers['x-deskkit-token'];
    if (!isTokenAuthorized(reqToken)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid token' }));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const list = Array.isArray(body.items) ? body.items : [body];
      const now = Date.now();
      const created = [];
      for (const it of list) {
        if (!it || !it.url) continue;
        const k = String(it.url).split('#')[0];
        const prev = recentUrls.get(k);
        if (prev && now - prev < 8000) continue;
        recentUrls.set(k, now);
        created.push(startTask(it));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: created.length, tasks: created.map(({ headers, rawCookies, ...pub }) => pub) }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/update') {
    const reqToken = req.headers['x-deskkit-token'];
    if (!isTokenAuthorized(reqToken)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid token' }));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const result = await runLocalGitUpdate(body.repo, body.branch);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message || 'Update failed', log: [e.stdout, e.stderr].filter(Boolean).join('\\n').trim() }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(\`[Joel Desk Pro] 本地多线程下载引擎已启动: http://127.0.0.1:\${PORT}\`);
  console.log(\`[Joel Desk Pro] 默认保存目录: \${DEFAULT_SAVE_DIR || path.join(os.homedir(), 'Downloads')}\`);
});
`;
}
