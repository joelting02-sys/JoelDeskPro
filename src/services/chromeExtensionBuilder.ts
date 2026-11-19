// Pure client-side ZIP + PNG generator & full MV3 DeskKit Chrome Extension package builder.
// Produces a root-level manifest.json ZIP so extracting into any folder loads directly in Chrome.

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

/**
 * Generates a valid RGBA PNG icon (rounded blue square with a white download arrow)
 * with zero external dependencies so Chrome displays a crisp DeskKit toolbar icon.
 */
function createDeskKitIconPng(size: number): Uint8Array {
  const stride = 1 + size * 4;
  const raw = new Uint8Array(stride * size);
  const radius = size * 0.24;

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      // Rounded-square alpha mask
      const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
      const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
      const inSquare = dx * dx + dy * dy <= radius * radius;
      if (!inSquare) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      // Draw crisp white download arrow glyph inside
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const isStem = Math.abs(nx - 0.5) <= 0.085 && ny >= 0.24 && ny <= 0.62;
      const isHead =
        ny >= 0.48 &&
        ny <= 0.68 &&
        Math.abs(nx - 0.5) <= (0.68 - ny) * 1.08 + 0.035 &&
        Math.abs(nx - 0.5) >= Math.max(0, (0.68 - ny) * 1.08 - 0.11);
      const isBase = ny >= 0.72 && ny <= 0.81 && nx >= 0.26 && nx <= 0.74;

      if (isStem || isHead || isBase) {
        raw[px] = 255;
        raw[px + 1] = 255;
        raw[px + 2] = 255;
        raw[px + 3] = 255;
      } else {
        // DeskKit Accent Blue (#2563EB)
        raw[px] = 37;
        raw[px + 1] = 99;
        raw[px + 2] = 235;
        raw[px + 3] = 255;
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
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
 * Generates the complete sniffer-grade DeskKit Chrome MV3 extension package:
 * - manifest.json at ZIP ROOT (no double-nested folder when Windows extracts!)
 * - inject.js (MAIN world hook: fetch/XHR/HLS/DASH + Douyin React Fiber & aweme_id map)
 * - content.js (video hover top-right floating download button + SPA route tracker + DeskKit handshake)
 * - background.js (webRequest sniffer + IDM-style download takeover + cookies + local HTTP bridge)
 * - popup.html & popup.js (DeskKit light UI resource list + 7-category takeover settings)
 * - icons/16.png, 48.png, 128.png (real generated PNG icons)
 */
export function buildDeskKitChromeExtension(port: number, token: string, defaultWebUrl = '') {
  const endpoint = `http://127.0.0.1:${port}/api/bridge/capture`;
  const normalizedWebUrl = defaultWebUrl ? defaultWebUrl.split('#')[0] : '';

  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: 'JoelDeskPro',
      version: '1.1.0',
      description:
        'JoelDeskPro 浏览器插件：支持直连 Joel Desk Pro 网页端与本地客户端双通道，在 YouTube / 抖音 / B站视频右上角悬浮一键下载并嗅探全站资源。',
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
        default_title: 'JoelDeskPro 资源嗅探',
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

  const injectJs = `'use strict';
// DeskKit Page-Context Sniffer (MAIN world, document_start)
// Hooks fetch / XHR / DOM media & Douyin aweme_id -> play URL map
(function () {
  if (window.__deskkitInjected) return;
  window.__deskkitInjected = true;

  const M3U8 = /\\.(m3u8|mpd)/i;
  const MEDIA_FILE = /\\.(mp4|m4v|webm|mkv|mov|flv|avi|m4a|mp3|aac|ogg|wav|opus)(\\?|#|$)/i;
  const MEDIA_MIME = /(mpegurl|dash\\+xml|video\\/|audio\\/)/i;
  const DOUYIN_API = /\\/aweme\\/v1\\/web\\//i;
  const seen = new Set();

  const post = (url, mime) => {
    try {
      if (!url || typeof url !== 'string') return;
      if (url.startsWith('blob:') || url.startsWith('data:')) return;
      const isM3u8 = M3U8.test(url) || /(mpegurl|dash\\+xml)/i.test(mime || '');
      if (!isM3u8 && /\\.(ts|m4s)(\\?|$)/i.test(url)) return;
      const isMedia = isM3u8 || MEDIA_FILE.test(url) || MEDIA_MIME.test(mime || '');
      if (!isMedia || seen.has(url)) return;
      seen.add(url);
      window.postMessage({ __deskkit_media: true, url: String(url), mime: mime || '' }, '*');
    } catch (e) {}
  };

  const normUrl = (u) => {
    if (typeof u !== 'string') return null;
    if (u.startsWith('//')) u = 'https:' + u;
    u = u.replace(/^http:\\/\\//i, 'https://');
    return /^https:\\/\\//.test(u) ? u : null;
  };

  function bestPlayUrls(video) {
    if (!video || typeof video !== 'object') return [];
    const out = [];
    const pushList = (l) => {
      if (Array.isArray(l)) {
        for (const u of l) {
          const n = normUrl(typeof u === 'string' ? u : u && (u.src || u.url));
          if (n) out.push(n);
        }
      }
    };
    const pushAddr = (a) => {
      if (a && typeof a === 'object') {
        pushList(a.url_list);
        pushList(a.urlList);
      }
    };
    const pushStr = (s) => {
      const n = normUrl(s);
      if (n) out.push(n);
    };
    try {
      pushAddr(video.play_addr);
      pushAddr(video.playAddr);
      pushStr(video.play_api);
      pushStr(video.playApi);
      pushAddr(video.play_addr_h264);
      pushAddr(video.playAddrH264);
      pushAddr(video.play_addr_265);
      pushAddr(video.playAddr265);
      const brs = video.bit_rate || video.bitRateList || video.bitrateList;
      if (Array.isArray(brs)) {
        for (const b of brs) {
          if (!b) continue;
          pushAddr(b.play_addr || b.playAddr);
          pushStr(b.play_api || b.playApi);
        }
      }
      pushAddr(video.download_addr);
      pushAddr(video.downloadAddr);
      pushStr(video.playUrl);
      pushStr(video.play_url);
    } catch (e) {}
    return [...new Set(out)];
  }

  function awemeIdOf(node) {
    return node && (node.aweme_id || node.awemeId);
  }

  function deepCollectAweme(root, map, budgetMax) {
    let budget = budgetMax || 35000;
    const stack = [[root, 0]];
    const visited = new Set();
    while (stack.length && budget-- > 0) {
      const [node, depth] = stack.pop();
      if (!node || typeof node !== 'object' || depth > 16 || visited.has(node)) continue;
      visited.add(node);
      try {
        const id = awemeIdOf(node);
        const vid = node.video;
        if (id && vid && typeof vid === 'object') {
          const urls = bestPlayUrls(vid);
          if (urls.length) map[String(id)] = urls;
        }
      } catch (e) {}
      for (const k in node) {
        try {
          const v = node[k];
          if (v && typeof v === 'object') stack.push([v, depth + 1]);
        } catch (e) {}
      }
    }
  }

  function reportDouyinMap(map) {
    try {
      if (!map || !Object.keys(map).length) return;
      window.postMessage({ __deskkit_douyin: true, map }, '*');
    } catch (e) {}
  }

  function reportDouyinFromText(text) {
    if (!text || text.length > 8e6) return;
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return;
    }
    const map = {};
    try {
      deepCollectAweme(obj, map);
    } catch (e) {}
    reportDouyinMap(map);
  }

  function scanDouyinGlobals() {
    if (!/(^|\\.)douyin\\.com$/i.test(location.hostname)) return;
    const map = {};
    const keys = ['_ROUTER_DATA', '__INITIAL_STATE__', '__INIT_PROPS__', '_SSR_DATA', 'RENDER_DATA', '__NEXT_DATA__'];
    for (const key of keys) {
      try {
        if (window[key]) deepCollectAweme(window[key], map);
      } catch (e) {}
    }
    reportDouyinMap(map);
  }

  function getReactFiber(el) {
    if (!el) return null;
    for (const k in el) {
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) return el[k];
    }
    return null;
  }

  function scanActiveDouyinFiber() {
    if (!/(^|\\.)douyin\\.com$/i.test(location.hostname)) return;
    const vids = [].slice.call(document.querySelectorAll('video'));
    let v = null;
    try {
      v = document.querySelector('[data-active="true"] video');
    } catch (e) {}
    if (!v) v = vids.find((x) => !x.paused && x.currentTime > 0) || vids[0];
    if (!v) return;
    const item = (v.closest && v.closest('[data-e2e="feed-item"]')) || v.parentElement || v;
    let fiber = getReactFiber(item) || getReactFiber(v);
    const map = {};
    let hops = 0;
    while (fiber && hops++ < 40 && !Object.keys(map).length) {
      for (const key of ['memoizedProps', 'pendingProps', 'memoizedState']) {
        try {
          const p = fiber[key];
          if (p && typeof p === 'object') deepCollectAweme(p, map, 6000);
        } catch (e) {}
      }
      fiber = fiber.return;
    }
    reportDouyinMap(map);
  }

  // Safe fetch hook (skips if window.fetch is read-only)
  try {
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    const canHookFetch = !desc || desc.writable || Boolean(desc.set);
    const _fetch = window.fetch;
    if (_fetch && canHookFetch) {
      window.fetch = function (input) {
        let u;
        try {
          u = typeof input === 'string' ? input : input && input.url;
          post(u);
        } catch (e) {}
        return _fetch.apply(this, arguments).then((resp) => {
          try {
            const ct = resp.headers && resp.headers.get && resp.headers.get('content-type');
            if (ct && MEDIA_MIME.test(ct)) post(resp.url || u, ct);
          } catch (e) {}
          try {
            const ru = resp.url || u;
            if (ru && DOUYIN_API.test(ru)) {
              resp.clone().text().then(reportDouyinFromText).catch(() => {});
            }
          } catch (e) {}
          return resp;
        });
      };
    }
  } catch (e) {}

  // XHR hook
  try {
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (_method, url) {
      try {
        this.__deskkitUrl = url;
        post(url);
        this.addEventListener('load', function () {
          try {
            const ct = this.getResponseHeader && this.getResponseHeader('content-type');
            if (ct && MEDIA_MIME.test(ct)) post(this.__deskkitUrl, ct);
          } catch (e) {}
          try {
            if (this.__deskkitUrl && DOUYIN_API.test(this.__deskkitUrl)) {
              if (this.responseType === '' || this.responseType === 'text') {
                reportDouyinFromText(this.responseText);
              } else if (this.responseType === 'json' && this.response) {
                const m = {};
                deepCollectAweme(this.response, m);
                reportDouyinMap(m);
              }
            }
          } catch (e) {}
        });
      } catch (e) {}
      return _open.apply(this, arguments);
    };
  } catch (e) {}

  function scanMediaEl(el) {
    try {
      const src = el.currentSrc || el.src || '';
      if (src && !src.startsWith('blob:')) post(src);
      el.querySelectorAll &&
        el.querySelectorAll('source').forEach((s) => {
          const ss = s.src || s.getAttribute('src') || '';
          if (ss) post(ss, s.type || '');
        });
    } catch (e) {}
  }

  function scanAll() {
    try {
      document.querySelectorAll('video, audio').forEach(scanMediaEl);
    } catch (e) {}
  }

  function scanSource() {
    try {
      const html = document.documentElement ? document.documentElement.outerHTML : '';
      if (!html) return;
      const re = /https?:\\/\\/[^\\s"'<>()\\\\]+?\\.(m3u8|mpd|mp4|m4v|webm|mkv|mov|flv|m4a|mp3|aac)(\\?[^\\s"'<>()\\\\]*)?/gi;
      let mm;
      let count = 0;
      while ((mm = re.exec(html)) && count < 50) {
        count++;
        post(mm[0].replace(/\\\\\\//g, '/').replace(/&amp;/g, '&'));
      }
    } catch (e) {}
  }

  setInterval(scanAll, 3000);
  if (document.readyState !== 'loading') {
    scanAll();
    scanSource();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      scanAll();
      scanSource();
    });
  }

  if (/(^|\\.)douyin\\.com$/i.test(location.hostname)) {
    const scanBoth = () => {
      try { scanActiveDouyinFiber(); } catch (e) {}
      try { scanDouyinGlobals(); } catch (e) {}
    };
    setInterval(scanBoth, 1200);
    scanBoth();
  }
})();
`;

  const contentJs = `'use strict';
// DeskKit Content Script:
// 1) Top-right floating "下载该视频" button on hover over any <video> (YouTube, Douyin, Bilibili, X, TikTok...)
// 2) SPA route tracking + Douyin aweme_id exact play URL resolution
// 3) DeskKit Web App handshake responder
(function () {
  const seen = new Set();
  const douyinPlayMap = Object.create(null);
  let dismissed = false;

  // Bidirectional bridge between DeskKit Web App and Chrome Extension background
  function registerThisWebTab() {
    try {
      chrome.runtime.sendMessage(
        { type: 'registerWebApp', url: location.href, origin: location.origin },
        (resp) => {
          if (chrome.runtime.lastError) return;
          window.postMessage(
            {
              type: 'DESKKIT_CONNECT_ACK',
              version: '1.1.0',
              webRegistered: true,
              localOnline: Boolean(resp && resp.localOnline),
              targetMode: (resp && resp.targetMode) || 'auto',
            },
            '*'
          );
        }
      );
    } catch (e) {}
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'DESKKIT_WEB_DISPATCH' && Array.isArray(msg.items)) {
      window.postMessage(
        {
          type: 'DESKKIT_CHROME_CAPTURE',
          items: msg.items,
          payload: msg.items[0] || null,
        },
        '*'
      );
      sendResponse && sendResponse({ ok: true });
      return true;
    }
  });

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || typeof ev.data !== 'object') return;
    if (ev.data.type === 'DESKKIT_WEB_HELLO' || ev.data.type === 'DESKKIT_CONNECT_REQUEST') {
      registerThisWebTab();
      return;
    }
    if (ev.data.type === 'DESKKIT_EXT_DIRECT_DOWNLOAD' && ev.data.url) {
      const requestId = ev.data.requestId || '';
      try {
        chrome.runtime.sendMessage(
          {
            type: 'extDirectDownload',
            url: ev.data.url,
            fileName: ev.data.fileName || '',
            referer: ev.data.referer || '',
          },
          (resp) => {
            window.postMessage(
              {
                type: 'DESKKIT_EXT_DIRECT_DOWNLOAD_ACK',
                requestId,
                ok: Boolean(!chrome.runtime.lastError && resp && resp.ok),
              },
              '*'
            );
          }
        );
      } catch (e) {
        window.postMessage({ type: 'DESKKIT_EXT_DIRECT_DOWNLOAD_ACK', requestId, ok: false }, '*');
      }
      return;
    }
    if (ev.data.__deskkit_media && ev.data.url && !seen.has(ev.data.url)) {
      seen.add(ev.data.url);
      report([{ url: ev.data.url, mime: ev.data.mime || '', title: document.title, pageUrl: location.href }]);
      return;
    }
    if (ev.data.__deskkit_douyin && ev.data.map) {
      for (const k in ev.data.map) {
        if (Array.isArray(ev.data.map[k]) && ev.data.map[k].length) {
          douyinPlayMap[k] = ev.data.map[k];
        }
      }
    }
  });

  function report(items) {
    if (!items.length) return;
    try {
      chrome.runtime.sendMessage({ type: 'domMedia', items });
    } catch (e) {}
  }

  function scanDomMedia() {
    const items = [];
    document.querySelectorAll('video, audio').forEach((el) => {
      const urls = [el.src, el.currentSrc];
      el.querySelectorAll('source').forEach((s) => urls.push(s.src));
      for (const u of urls) {
        if (!u || u.startsWith('blob:') || u.startsWith('data:') || seen.has(u)) continue;
        seen.add(u);
        items.push({ url: u, mime: el.getAttribute('type') || '', title: document.title, pageUrl: location.href });
      }
    });
    report(items);
  }

  // SPA navigation detector
  let lastHref = location.href;
  function notifyUrlChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    seen.clear();
    dismissed = false;
    try {
      chrome.runtime.sendMessage({ type: 'spaNavigate', url: location.href, title: document.title });
    } catch (e) {}
    setTimeout(scanDomMedia, 800);
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

  // Top-frame floating download button in top-right corner of <video>
  if (window.top === window.self) {
    const OVERLAY_ID = 'deskkit-video-overlay';
    let overlayEl = null;
    let overlayTarget = null;
    let hideTimer = null;
    let overlayCursor = { x: NaN, y: NaN };

    function isDownloadableVideo(v) {
      if (!(v instanceof HTMLVideoElement)) return false;
      const r = v.getBoundingClientRect();
      if (r.width < 120 || r.height < 80) return false;
      if (v.readyState === 0 && !v.currentSrc && !v.querySelector('source')) return false;
      return true;
    }

    function showToast(msg) {
      const t = document.createElement('div');
      t.textContent = msg;
      Object.assign(t.style, {
        position: 'fixed',
        left: '50%',
        top: '28px',
        transform: 'translateX(-50%)',
        zIndex: '2147483647',
        padding: '10px 16px',
        borderRadius: '16px',
        background: 'rgba(15,23,42,0.92)',
        color: '#fff',
        font: '600 13px/1.4 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif',
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        pointerEvents: 'none',
      });
      (document.body || document.documentElement).appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    function buildOverlay() {
      if (overlayEl) return overlayEl;
      const el = document.createElement('div');
      el.id = OVERLAY_ID;
      el.innerHTML = \`
        <button type="button" class="dk-dl-btn" title="发送到 Joel Desk Pro 多线程高速下载">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M12 3v11M12 14l-4-4M12 14l4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 19h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
          <span>JoelDeskPro 下载</span>
        </button>
        <button type="button" class="dk-close-btn" title="本次浏览隐藏按钮" aria-label="关闭">✕</button>\`;

      Object.assign(el.style, {
        position: 'fixed',
        zIndex: '2147483647',
        display: 'none',
        alignItems: 'center',
        gap: '5px',
        pointerEvents: 'auto',
      });

      const btn = el.querySelector('.dk-dl-btn');
      Object.assign(btn.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 13px',
        border: '1px solid rgba(255,255,255,0.22)',
        borderRadius: '16px',
        background: 'rgba(37,99,235,0.94)',
        backdropFilter: 'blur(8px)',
        color: '#fff',
        font: '600 12px/1 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif',
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(15,23,42,0.32)',
        whiteSpace: 'nowrap',
      });

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerDownload(overlayTarget);
        const span = btn.querySelector('span');
        if (span) span.textContent = '已发往 JoelDeskPro ✓';
        btn.style.background = 'rgba(22,163,74,0.95)';
        setTimeout(() => {
          if (span) span.textContent = 'JoelDeskPro 下载';
          btn.style.background = 'rgba(37,99,235,0.94)';
        }, 1800);
      };

      const closeBtn = el.querySelector('.dk-close-btn');
      Object.assign(closeBtn.style, {
        width: '26px',
        height: '26px',
        border: 'none',
        borderRadius: '9999px',
        background: 'rgba(15,23,42,0.65)',
        color: '#fff',
        fontSize: '11px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      });
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissed = true;
        clearTimeout(hideTimer);
        el.style.display = 'none';
      };

      el.onmouseenter = () => clearTimeout(hideTimer);
      el.onmouseleave = () => scheduleHide();
      (document.body || document.documentElement).appendChild(el);
      overlayEl = el;
      return el;
    }

    function positionOverlay(video) {
      const el = buildOverlay();
      const r = video.getBoundingClientRect();
      el.style.display = 'flex';
      el.style.top = Math.max(8, r.top + 12) + 'px';
      const w = el.offsetWidth || 148;
      el.style.left = Math.min(window.innerWidth - w - 8, r.right - w - 12) + 'px';
    }

    function showOverlayFor(video) {
      if (dismissed || !isDownloadableVideo(video)) return;
      clearTimeout(hideTimer);
      overlayTarget = video;
      positionOverlay(video);
    }

    function scheduleHide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (overlayEl) overlayEl.style.display = 'none';
      }, 650);
    }

    function douyinAwemeId(video) {
      let m = location.pathname.match(/\\/video\\/(\\d{6,})/);
      if (m) return m[1];
      try {
        const mid = new URLSearchParams(location.search).get('modal_id');
        if (mid && /^\\d{6,}$/.test(mid)) return mid;
      } catch (e) {}
      if (video) {
        let p = video;
        for (let d = 0; p && d < 30; d++, p = p.parentElement) {
          if (!p.getAttribute) continue;
          for (const attr of ['data-e2e-aweme-id', 'data-aweme-id', 'data-video-id']) {
            const val = p.getAttribute(attr);
            if (val && /^\\d{15,}$/.test(val)) return val;
          }
          const a = p.querySelector && p.querySelector('a[href*="/video/"]');
          if (a) {
            const am = (a.getAttribute('href') || '').match(/\\/video\\/(\\d{6,})/);
            if (am) return am[1];
          }
        }
      }
      return null;
    }

    function douyinName() {
      let t = (document.title || '').replace(/[\\\\/:*?"<>|]/g, '_').trim();
      t = t.replace(/\\s*[-|_–—]\\s*抖音[^-]*$/, '').trim();
      if (!t || /^抖音/.test(t)) t = 'douyin_' + Date.now();
      return t.slice(0, 80);
    }

    function resolvePostUrl(video) {
      const host = location.hostname.replace(/^www\\./, '');
      if (/youtube\\.com$|youtu\\.be$/.test(host) && video && !/\\/watch|\\/shorts\\//.test(location.pathname)) {
        const cont = video.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer');
        const a = cont && cont.querySelector('a#thumbnail[href*="watch"], a[href*="/watch?v="], a[href*="/shorts/"]');
        if (a) {
          const href = a.getAttribute('href');
          return href.startsWith('http') ? href : location.origin + href;
        }
      }
      if (/(^|\\.)x\\.com$|twitter\\.com$/.test(host) && video) {
        const art = video.closest && video.closest('article');
        const a = art && art.querySelector('a[href*="/status/"]');
        if (a) {
          const m = (a.getAttribute('href') || '').match(/\\/[^/]+\\/status\\/\\d+/);
          if (m) return location.origin + m[0];
        }
      }
      return location.href;
    }

    function sendToBackground(item) {
      try {
        chrome.runtime.sendMessage({ type: 'send', items: [item] });
      } catch (e) {}
    }

    function triggerDownload(video) {
      const host = location.hostname.replace(/^www\\./, '');
      // 1) Douyin exact CDN URL via inject.js aweme map
      if (/(^|\\.)douyin\\.com$/i.test(location.hostname)) {
        if (/(^|\\.)live\\.douyin\\.com$/i.test(location.hostname)) {
          showToast('抖音直播暂不支持下载，请打开具体视频作品');
          return;
        }
        const id = douyinAwemeId(video);
        if (id && douyinPlayMap[id] && douyinPlayMap[id].length) {
          sendToBackground({
            url: douyinPlayMap[id][0],
            kind: 'http',
            filename: douyinName() + '.mp4',
            referer: location.origin + '/',
          });
          return;
        }
        chrome.runtime.sendMessage({ type: 'getSniffed' }, (resp) => {
          const list = (resp && resp.items) || [];
          const vids = list.filter((r) => /(douyinvod|zjcdn|douyincdn)/i.test(r.url) && !/\\.mp3/i.test(r.url));
          const pick = vids[vids.length - 1];
          if (pick) {
            sendToBackground({ url: pick.url, kind: 'http', filename: douyinName() + '.mp4', referer: location.origin + '/' });
          } else {
            showToast('请让视频播放 1~2 秒后再点击「JoelDeskPro 下载」');
          }
        });
        return;
      }

      // 2) Major video platforms
      if (/(youtube\\.com|youtu\\.be|x\\.com|twitter\\.com|tiktok\\.com|reddit\\.com|bilibili\\.com|vimeo\\.com|twitch\\.tv)/i.test(host)) {
        const postUrl = resolvePostUrl(video);
        sendToBackground({
          url: postUrl,
          kind: 'video-platform',
          filename: (document.title || 'video').replace(/[\\\\/:*?"<>|]/g, '_').slice(0, 80) + '.mp4',
          referer: postUrl,
        });
        return;
      }

      // 3) General sites: prefer sniffed m3u8 / mp4
      chrome.runtime.sendMessage({ type: 'getSniffed' }, (resp) => {
        const list = (resp && resp.items) || [];
        const pick =
          list.find((r) => /\\.(m3u8|mpd)/i.test(r.url) || r.kind === 'hls' || r.kind === 'dash') ||
          list.find((r) => /\\.(mp4|mkv|webm|mov)/i.test(r.url));
        if (pick) {
          sendToBackground({
            url: pick.url,
            kind: pick.kind || 'http',
            filename: (document.title || 'video').replace(/[\\\\/:*?"<>|]/g, '_').slice(0, 80) + '.mp4',
            referer: location.href,
          });
        } else {
          const src = (video && (video.currentSrc || video.src)) || location.href;
          sendToBackground({
            url: src.startsWith('blob:') ? location.href : src,
            kind: src.startsWith('blob:') ? 'video-platform' : 'http',
            filename: (document.title || 'video').replace(/[\\\\/:*?"<>|]/g, '_').slice(0, 80) + '.mp4',
            referer: location.href,
          });
        }
      });
    }

    let allVideos = [];
    const refreshVideos = () => {
      allVideos = [...document.querySelectorAll('video')].filter(isDownloadableVideo);
    };
    const videoUnderPoint = (x, y) => {
      let best = null;
      let bestArea = 0;
      for (const v of allVideos) {
        const r = v.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          const area = r.width * r.height;
          if (area > bestArea) {
            bestArea = area;
            best = v;
          }
        }
      }
      return best;
    };

    let lastMove = 0;
    document.addEventListener(
      'mousemove',
      (e) => {
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
      },
      true
    );

    window.addEventListener('scroll', () => {
      if (overlayEl && overlayEl.style.display !== 'none' && overlayTarget) positionOverlay(overlayTarget);
    }, true);
    window.addEventListener('resize', () => {
      refreshVideos();
      if (overlayEl && overlayEl.style.display !== 'none' && overlayTarget) positionOverlay(overlayTarget);
    });
    setInterval(refreshVideos, 2000);
    refreshVideos();
  }

  setTimeout(scanDomMedia, 1200);
  setInterval(scanDomMedia, 5000);
})();
`;

  const backgroundJs = `'use strict';
// DeskKit MV3 Service Worker:
// - Network resource sniffer (webRequest) + Toolbar Badge
// - IDM-style configurable download takeover (downloads.onDeterminingFilename)
// - Live browser Cookies extraction (youtube / douyin / bilibili / x...)
// - Local HTTP Bridge (${endpoint})
const DESKKIT_ENDPOINT = '${endpoint}';
const DESKKIT_HEALTH_URL = 'http://127.0.0.1:${port}/api/health';
const DESKKIT_TOKEN = '${token}';
const DEFAULT_WEB_URL = ${JSON.stringify(normalizedWebUrl)};

const VIDEO_PLATFORMS = /(^|\\.)(youtube\\.com|youtu\\.be|twitter\\.com|x\\.com|reddit\\.com|tiktok\\.com|vimeo\\.com|bilibili\\.com|facebook\\.com|instagram\\.com|twitch\\.tv)$/i;
const COOKIE_HOSTS = /(^|\\.)(youtube\\.com|youtu\\.be|douyin\\.com|iesdouyin\\.com|bilibili\\.com|x\\.com|twitter\\.com|instagram\\.com|facebook\\.com|weibo\\.com)$/i;
const RES_EXT = /\\.(mp4|mkv|avi|mov|flv|webm|m4v|mp3|flac|wav|aac|m4a|ogg|opus|zip|rar|7z|tar|gz|xz|iso|exe|msi|dmg|apk|pdf|docx?|xlsx?|pptx?|epub|torrent)(\\?|$)/i;
const MEDIA_MIME = /^(video|audio)\\//i;
const STREAM_MIME = /(mpegurl|dash\\+xml)/i;
const DOC_MIME = /(application\\/(zip|x-rar|x-7z|octet-stream|pdf|x-msdownload|x-apple-diskimage))/i;
const MIN_MEDIA_SIZE = 200 * 1024;

const CATEGORY_EXT = {
  video: ['mp4','mkv','webm','avi','mov','flv','wmv','m4v','ts','m3u8','mpd'],
  audio: ['mp3','m4a','aac','flac','wav','ogg','opus','wma'],
  archive: ['zip','rar','7z','tar','gz','bz2','xz','tgz','iso'],
  program: ['exe','msi','dmg','pkg','apk','deb','rpm'],
  document: ['pdf','doc','docx','xls','xlsx','ppt','pptx','epub','txt','csv'],
  model: ['gguf','safetensors','bin','ckpt','pt','pth','onnx'],
  other: ['torrent','magnet'],
};

const DEFAULT_SETTINGS = {
  takeover: true,
  targetMode: 'auto', // 'auto' (local first, fallback web) | 'web' | 'local'
  webAppUrl: DEFAULT_WEB_URL,
  categories: { video: true, audio: true, archive: true, program: true, document: true, model: true, other: true },
  customExt: [],
  minSize: 0,
  blacklist: [],
};

let extSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
const tabResources = new Map();
const tabInfo = new Map();
const webAppTabIds = new Set();
const selfDownloadIds = new Set();
let pendingWebItems = [];
let activeTabId = -1;

try {
  chrome.tabs.onActivated.addListener((info) => { activeTabId = info.tabId; });
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (tabs && tabs[0]) activeTabId = tabs[0].id;
  });
} catch (e) {}

function pageKey(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname + u.search;
  } catch (e) {
    return url || '';
  }
}

function isVideoPlatformPage(url) {
  try {
    const u = new URL(url);
    if (!VIDEO_PLATFORMS.test(u.hostname)) return false;
    const p = u.pathname;
    if (/youtube\\.com$/i.test(u.hostname)) return /\\/watch|\\/shorts\\//.test(p + u.search) || u.searchParams.has('v');
    if (/youtu\\.be$/i.test(u.hostname)) return p.length > 1;
    if (/tiktok\\.com$/i.test(u.hostname)) return /\\/video\\/|\\/@/.test(p);
    if (/(twitter|x)\\.com$/i.test(u.hostname)) return /\\/status\\//.test(p);
    if (/bilibili\\.com$/i.test(u.hostname)) return /\\/video\\//.test(p);
    return p.length > 1;
  } catch (e) {
    return false;
  }
}

function isBlacklisted(url) {
  const list = extSettings.blacklist || [];
  if (!list.length) return false;
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return false; }
  return list.some((d) => {
    const clean = String(d).trim().toLowerCase().replace(/^https?:\\/\\//, '').replace(/\\/.*$/, '').replace(/^\\*?\\./, '');
    return clean && (host === clean || host.endsWith('.' + clean));
  });
}

function filenameFromUrl(url, fallbackExt) {
  try {
    const u = new URL(url);
    let name = decodeURIComponent(u.pathname.split('/').pop() || '');
    if (!name || !name.includes('.')) {
      name = (name || u.hostname.replace(/^www\\./, '')) + (fallbackExt ? '.' + fallbackExt : '');
    }
    return name || 'download';
  } catch (e) {
    return 'download';
  }
}

function sanitize(s) {
  return (s || 'video').replace(/[\\\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'video';
}

function classify(mime, url) {
  const u = url.toLowerCase();
  if (/mpegurl/i.test(mime) || /\\.m3u8/.test(u)) return { kind: 'hls', tag: '视频流(HLS)' };
  if (/dash\\+xml/i.test(mime) || /\\.mpd/.test(u)) return { kind: 'dash', tag: '视频流(DASH)' };
  if (/^video\\//i.test(mime) || /\\.(mp4|mkv|webm|flv|mov|avi)/.test(u)) return { kind: 'http', tag: '视频' };
  if (/^audio\\//i.test(mime) || /\\.(mp3|flac|m4a|aac|wav|ogg|opus)/.test(u)) return { kind: 'http', tag: '音频' };
  if (/\\.(zip|rar|7z|tar|gz|xz|iso)/.test(u)) return { kind: 'http', tag: '压缩包' };
  if (/\\.(exe|msi|dmg|apk)/.test(u)) return { kind: 'http', tag: '程序' };
  if (/\\.(pdf|docx?|xlsx?|pptx?|epub)/.test(u)) return { kind: 'http', tag: '文档' };
  return { kind: 'http', tag: '文件' };
}

function updateBadge(tabId) {
  const n = tabResources.get(tabId)?.size || 0;
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#2563EB' });
    const p = chrome.action.setBadgeText({ tabId, text: n ? String(Math.min(n, 99)) : '' });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {}
}

function addResource(tabId, res) {
  if (tabId < 0) {
    if (activeTabId >= 0) tabId = activeTabId;
    else return;
  }
  if (!tabResources.has(tabId)) tabResources.set(tabId, new Map());
  const map = tabResources.get(tabId);
  const k = res.url.split('#')[0];
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
    if ((r.ownerPage || pageKey(r.url)) !== cur) map.delete(k);
  }
  updateBadge(tabId);
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
      filename: sanitize(title || (prev && prev.title) || 'video') + '.mp4',
      mime: 'video/*',
      size: null,
      kind: 'video-platform',
      tag: '在线视频',
      referer: url,
      ownerPage: pageKey(url),
    });
  }
}

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type === 'main_frame') return;
    const url = details.url;
    if (isBlacklisted(url)) return;
    const info0 = tabInfo.get(details.tabId);
    if (info0 && info0.isVideoPlatform) return;

    const headers = details.responseHeaders || [];
    let mime = '';
    let size = null;
    let disp = '';
    for (const h of headers) {
      const n = h.name.toLowerCase();
      if (n === 'content-type') mime = h.value || '';
      else if (n === 'content-length') size = parseInt(h.value, 10);
      else if (n === 'content-disposition') disp = h.value || '';
    }

    const isM3u8OrMpd = /\\.(m3u8|mpd)(\\?|$|#)/i.test(url);
    const isStream = STREAM_MIME.test(mime) || isM3u8OrMpd;
    const isMedia = MEDIA_MIME.test(mime);
    const isAttachment = /attachment/i.test(disp);
    const isResExt = RES_EXT.test(url);
    const isDoc = DOC_MIME.test(mime);
    if (!(isStream || isMedia || isAttachment || isResExt || isDoc)) return;
    if (!isM3u8OrMpd && /\\.(ts|m4s)(\\?|$)/i.test(url) && !isAttachment) return;
    if (/videoplayback|googlevideo\\.com/i.test(url) && !isAttachment) return;
    if (isMedia && !isStream && !isAttachment && size != null && size < MIN_MEDIA_SIZE) return;

    const cls = classify(mime, url);
    let filename = filenameFromUrl(url, cls.kind === 'hls' || cls.kind === 'dash' ? 'mp4' : '');
    const m = /filename\\*?=(?:UTF-8'')?"?([^;"]+)"?/i.exec(disp);
    if (m) {
      try { filename = decodeURIComponent(m[1]); } catch (e) { filename = m[1]; }
    }
    addResource(details.tabId, {
      url,
      filename,
      mime,
      size: Number.isFinite(size) ? size : null,
      kind: cls.kind,
      tag: cls.tag,
      referer: tabInfo.get(details.tabId)?.pageUrl || details.initiator || '',
    });
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

chrome.tabs.onUpdated.addListener((tabId, ch, tab) => {
  if (!tab) return;
  if (ch.url || ch.title || ch.status === 'complete') syncTab(tabId, ch.url || tab.url, tab.title);
});
chrome.webNavigation?.onCommitted?.addListener?.((d) => {
  if (d.frameId === 0) {
    tabResources.delete(d.tabId);
    updateBadge(d.tabId);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  tabResources.delete(tabId);
  tabInfo.delete(tabId);
  webAppTabIds.delete(tabId);
});

// Download takeover rules
function activeExtSet() {
  const set = new Set();
  for (const [cat, on] of Object.entries(extSettings.categories || {})) {
    if (on) for (const e of CATEGORY_EXT[cat] || []) set.add(e);
  }
  for (const e of extSettings.customExt || []) {
    const clean = String(e).trim().replace(/^\\./, '').toLowerCase();
    if (clean) set.add(clean);
  }
  return set;
}

function shouldIntercept(item) {
  if (!extSettings.takeover) return false;
  if (selfDownloadIds.has(item.id)) return false;
  const url = item.url || item.finalUrl || '';
  if (!/^https?:/i.test(url) || isBlacklisted(url) || item.byExtensionId) return false;
  if (extSettings.minSize > 0 && item.fileSize > 0 && item.fileSize < extSettings.minSize * 1024 * 1024) return false;
  const mime = (item.mime || '').toLowerCase();
  if (extSettings.categories.video && mime.startsWith('video/')) return true;
  if (extSettings.categories.audio && mime.startsWith('audio/')) return true;
  const src = (item.filename || item.finalUrl || item.url || '').split(/[?#]/)[0];
  const m = /\\.([a-z0-9]{1,12})$/i.exec(src);
  return Boolean(m && activeExtSet().has(m[1].toLowerCase()));
}

function applyStored(r) {
  if (!r || typeof r !== 'object') return;
  if (typeof r.takeover === 'boolean') extSettings.takeover = r.takeover;
  if (typeof r.targetMode === 'string') extSettings.targetMode = r.targetMode;
  if (typeof r.webAppUrl === 'string' && r.webAppUrl) extSettings.webAppUrl = r.webAppUrl;
  if (r.categories) extSettings.categories = Object.assign({}, DEFAULT_SETTINGS.categories, r.categories);
  if (Array.isArray(r.customExt)) extSettings.customExt = r.customExt;
  if (typeof r.minSize === 'number') extSettings.minSize = r.minSize;
  if (Array.isArray(r.blacklist)) extSettings.blacklist = r.blacklist;
}

chrome.storage.local.get(['takeover', 'targetMode', 'webAppUrl', 'categories', 'customExt', 'minSize', 'blacklist'], applyStored);
chrome.storage.onChanged.addListener((ch) => {
  const patch = {};
  for (const k of ['takeover', 'targetMode', 'webAppUrl', 'categories', 'customExt', 'minSize', 'blacklist']) {
    if (ch[k]) patch[k] = ch[k].newValue;
  }
  applyStored(patch);
});

if (chrome.downloads && chrome.downloads.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item) => {
    try {
      if (!shouldIntercept(item)) return;
      const fname = item.filename ? item.filename.split(/[\\\\/]/).pop() : filenameFromUrl(item.finalUrl || item.url);
      chrome.downloads.cancel(item.id, () => chrome.downloads.erase({ id: item.id }, () => {}));
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        sendToDeskKit([{
          url: item.finalUrl || item.url,
          filename: fname || 'download',
          mime: item.mime,
          size: item.fileSize > 0 ? item.fileSize : null,
          referer: (tabs[0] && tabs[0].url) || item.referrer || '',
        }]);
      });
    } catch (e) {}
  });
}

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'deskkit-dl', title: '使用 JoelDeskPro 高速下载此链接', contexts: ['link', 'video', 'audio'] });
    chrome.contextMenus.create({ id: 'deskkit-video', title: '使用 JoelDeskPro 下载当前视频', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'deskkit-all', title: '嗅探本页全部资源到 JoelDeskPro', contexts: ['page', 'action'] });
  });
}
chrome.runtime.onInstalled.addListener(createMenus);
createMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'deskkit-dl') {
    const url = info.linkUrl || info.srcUrl;
    if (url) sendToDeskKit([{ url, filename: filenameFromUrl(url), referer: tab?.url || '' }]);
  } else if (info.menuItemId === 'deskkit-video' && tab?.url) {
    sendToDeskKit([{ url: tab.url, filename: sanitize(tab.title || 'video') + '.mp4', kind: 'video-platform', referer: tab.url }]);
  } else if (info.menuItemId === 'deskkit-all' && tab) {
    const map = tabResources.get(tab.id);
    if (map && map.size) sendToDeskKit([...map.values()]);
    else notify('未发现资源', '当前页面暂未嗅探到可下载资源');
  }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab ? sender.tab.id : (msg.tabId ?? -1);
  if (msg.type === 'spaNavigate') {
    if (tabId >= 0 && msg.url) syncTab(tabId, msg.url, msg.title);
    reply && reply({ ok: true });
    return true;
  }
  if (msg.type === 'domMedia' && Array.isArray(msg.items)) {
    const ti = tabInfo.get(tabId);
    if (!ti || !ti.isVideoPlatform) {
      for (const it of msg.items) {
        if (!it.url || it.url.startsWith('blob:')) continue;
        const cls = classify(it.mime || '', it.url);
        addResource(tabId, { url: it.url, filename: filenameFromUrl(it.url, 'mp4'), mime: it.mime || '', size: null, kind: cls.kind, tag: cls.tag, referer: it.pageUrl || '' });
      }
    }
    reply && reply({ ok: true });
    return true;
  }
  if (msg.type === 'getResources') {
    chrome.tabs.get(msg.tabId, (tab) => {
      const liveUrl = (!chrome.runtime.lastError && tab && tab.url) || null;
      if (liveUrl) {
        const info = tabInfo.get(msg.tabId);
        if (!info || pageKey(info.pageUrl) !== pageKey(liveUrl)) syncTab(msg.tabId, liveUrl, tab.title);
        else pruneToPage(msg.tabId, liveUrl);
      }
      const map = tabResources.get(msg.tabId);
      reply({ resources: map ? [...map.values()] : [], info: tabInfo.get(msg.tabId) || {} });
    });
    return true;
  }
  if (msg.type === 'getSniffed') {
    const tid = sender && sender.tab && sender.tab.id;
    const map = tid != null ? tabResources.get(tid) : null;
    reply({ items: map ? [...map.values()] : [] });
    return true;
  }
  if (msg.type === 'registerWebApp') {
    if (tabId >= 0) {
      webAppTabIds.add(tabId);
      if (msg.url && /^https?:/i.test(msg.url)) {
        extSettings.webAppUrl = msg.url.split('#')[0];
        chrome.storage.local.set({ webAppUrl: extSettings.webAppUrl });
      }
      if (pendingWebItems.length) {
        const queued = pendingWebItems.splice(0, pendingWebItems.length);
        chrome.tabs.sendMessage(tabId, { type: 'DESKKIT_WEB_DISPATCH', items: queued }, () => {});
      }
    }
    checkLocalOnline().then((localOnline) => {
      reply && reply({ ok: true, localOnline, targetMode: extSettings.targetMode });
    });
    return true;
  }
  if (msg.type === 'getBridgeStatus') {
    Promise.all([checkLocalOnline(), findLiveWebAppTab()]).then(([localOnline, liveTab]) => {
      reply && reply({
        localOnline,
        webConnected: Boolean(liveTab),
        webAppUrl: extSettings.webAppUrl || DEFAULT_WEB_URL || '',
        targetMode: extSettings.targetMode || 'auto',
      });
    });
    return true;
  }
  if (msg.type === 'openWebApp') {
    openOrFocusWebApp().then((ok) => reply && reply({ ok }));
    return true;
  }
  if (msg.type === 'extDirectDownload' && msg.url) {
    const cleanName = sanitize(msg.fileName || filenameFromUrl(msg.url));
    chrome.downloads.download(
      { url: msg.url, filename: cleanName, conflictAction: 'uniquify' },
      (downloadId) => {
        if (downloadId != null) {
          selfDownloadIds.add(downloadId);
          setTimeout(() => selfDownloadIds.delete(downloadId), 60000);
        }
        reply && reply({ ok: !chrome.runtime.lastError && downloadId != null, downloadId });
      }
    );
    return true;
  }
  if (msg.type === 'send') {
    sendToDeskKit(msg.items || []);
    reply && reply({ ok: true });
    return true;
  }
  if (msg.type === 'clear') {
    tabResources.delete(msg.tabId);
    updateBadge(msg.tabId);
    reply && reply({ ok: true });
    return true;
  }
});

async function checkLocalOnline() {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 900);
    const res = await fetch(DESKKIT_HEALTH_URL, { signal: ac.signal });
    clearTimeout(t);
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function findLiveWebAppTab() {
  for (const tid of [...webAppTabIds]) {
    try {
      const tab = await chrome.tabs.get(tid);
      if (tab && tab.id != null) return tab;
    } catch (e) {
      webAppTabIds.delete(tid);
    }
  }
  const targetUrl = extSettings.webAppUrl || DEFAULT_WEB_URL;
  if (targetUrl) {
    try {
      const origin = new URL(targetUrl).origin;
      const tabs = await chrome.tabs.query({ url: origin + '/*' });
      if (tabs && tabs.length) {
        webAppTabIds.add(tabs[0].id);
        return tabs[0];
      }
    } catch (e) {}
  }
  return null;
}

async function openOrFocusWebApp() {
  const existing = await findLiveWebAppTab();
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) {
      chrome.windows.update(existing.windowId, { focused: true }).catch(() => {});
    }
    return true;
  }
  const url = extSettings.webAppUrl || DEFAULT_WEB_URL;
  if (!url) return false;
  await chrome.tabs.create({ url });
  return true;
}

async function deliverToWebApp(payload, focusTab) {
  const liveTab = await findLiveWebAppTab();
  if (liveTab) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(liveTab.id, { type: 'DESKKIT_WEB_DISPATCH', items: payload }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        if (focusTab) {
          chrome.tabs.update(liveTab.id, { active: true }).catch(() => {});
        }
        resolve(Boolean(resp && resp.ok));
      });
    });
  }
  const url = extSettings.webAppUrl || DEFAULT_WEB_URL;
  if (url) {
    pendingWebItems.push(...payload);
    await chrome.tabs.create({ url });
    return true;
  }
  return false;
}

function getCookiesForUrl(url) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve(null); }
    chrome.cookies.getAll({ url: u.origin + '/' }, (a) => {
      const byUrl = chrome.runtime.lastError ? [] : (a || []);
      const root = u.hostname.replace(/^www\\./, '').split('.').slice(-2).join('.');
      chrome.cookies.getAll({ domain: root }, (b) => {
        const byDomain = chrome.runtime.lastError ? [] : (b || []);
        const map = new Map();
        for (const c of [...byUrl, ...byDomain]) map.set(c.name + '|' + c.domain + '|' + c.path, c);
        resolve([...map.values()].map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly })));
      });
    });
  });
}

async function sendToDeskKit(items) {
  const payload = await Promise.all(
    items.map(async (it) => {
      const o = {
        source: 'chrome_extension',
        url: it.url,
        fileName: it.filename || it.fileName || filenameFromUrl(it.url),
        kind: it.kind || 'http',
        mime: it.mime || '',
        size: it.size || null,
        referer: it.referer || '',
        userAgent: navigator.userAgent,
      };
      try {
        if (COOKIE_HOSTS.test(new URL(it.url).hostname)) {
          const cks = await getCookiesForUrl(it.url);
          if (cks && cks.length) {
            o.cookies = cks;
            o.hasCookies = true;
          }
        }
      } catch (e) {}
      return o;
    })
  );

  const mode = extSettings.targetMode || 'auto';
  let sentToLocal = false;

  // 1) Try Local Desktop Engine if mode is 'auto' or 'local'
  if (mode === 'auto' || mode === 'local') {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 1400);
      const res = await fetch(DESKKIT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DeskKit-Token': DESKKIT_TOKEN,
        },
        body: JSON.stringify(payload.length === 1 ? payload[0] : { items: payload }),
        signal: ac.signal,
      });
      clearTimeout(t);
      if (res.ok) sentToLocal = true;
    } catch (e) {
      sentToLocal = false;
    }
  }

  if (sentToLocal) {
    // Also mirror into any already-open DeskKit Web tab (marked handledByLocal so Web won't double-download)
    const liveTab = await findLiveWebAppTab();
    if (liveTab) {
      const mirrored = payload.map((p) => Object.assign({}, p, { handledByLocal: true }));
      chrome.tabs.sendMessage(liveTab.id, { type: 'DESKKIT_WEB_DISPATCH', items: mirrored }, () => {});
    }
    notify('已发送到 Joel Desk Pro 本地引擎', payload.length === 1 ? payload[0].fileName : payload.length + ' 个资源');
    return;
  }

  // 2) Route to Joel Desk Pro Published Web App when mode is 'web' or 'auto' (local offline)
  if (mode === 'web' || mode === 'auto') {
    const sentToWeb = await deliverToWebApp(payload, true);
    if (sentToWeb) {
      notify('已发送到 Joel Desk Pro 网页端', payload.length === 1 ? payload[0].fileName : payload.length + ' 个资源');
      return;
    }
  }

  notify(
    '未检测到 Joel Desk Pro 连接',
    mode === 'local'
      ? '请先启动本地引擎（端口 ${port}），或在弹窗中切换到「自动 / 网页端」'
      : '请先打开一次 Joel Desk Pro 网页端或启动本地引擎'
  );
}

function notify(title, message) {
  try {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title, message });
  } catch (e) {}
}
`;

  const popupHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  body { width: 360px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 12px; background: #F8F9FA; color: #0F172A; }
  .head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: #FFFFFF; border-bottom: 1px solid #E5E7EB; }
  .head h1 { font-size: 14px; font-weight: 600; margin: 0; flex: 1; }
  .head button { background: #F3F4F6; border: none; color: #475569; padding: 5px 10px; border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: 500; }
  .head button:hover { background: #E5E7EB; color: #0F172A; }
  .takeover-row { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #FFFFFF; border-bottom: 1px solid #E5E7EB; color: #334155; }
  .takeover-row input { width: 15px; height: 15px; accent-color: #2563EB; cursor: pointer; }
  .takeover-row label { flex: 1; cursor: pointer; }
  .gear { background: #F3F4F6; border: none; cursor: pointer; font-size: 13px; padding: 4px 8px; color: #475569; border-radius: 10px; }
  .gear:hover { background: #E5E7EB; color: #0F172A; }
  .settings { display: none; padding: 12px 14px; background: #FCFDFE; border-bottom: 1px solid #E5E7EB; }
  .settings.open { display: block; }
  .settings h2 { font-size: 11px; color: #64748B; margin: 0 0 8px; font-weight: 600; }
  .cats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-bottom: 10px; }
  .cats label { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
  .cats input { accent-color: #2563EB; }
  .custom-row { margin-bottom: 8px; }
  .custom-row label { display: block; font-size: 11px; color: #64748B; margin-bottom: 4px; }
  .custom-row input, .custom-row textarea { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #E5E7EB; border-radius: 10px; font-size: 12px; background: #FFFFFF; }
  .size-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; color: #475569; }
  .size-row input { width: 56px; padding: 4px 6px; border: 1px solid #E5E7EB; border-radius: 8px; font-size: 12px; }
  .saved { font-size: 11px; color: #16A34A; height: 14px; }
  .bridge-bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 14px; background: #F8FAFC; border-bottom: 1px solid #E5E7EB; font-size: 11px; color: #475569; }
  .bridge-status { display: flex; align-items: center; gap: 8px; }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 9999px; background: #CBD5E1; margin-right: 4px; vertical-align: middle; }
  .dot.on { background: #16A34A; }
  .bridge-ctrl { display: flex; align-items: center; gap: 6px; }
  .bridge-ctrl select { border: 1px solid #E5E7EB; background: #FFFFFF; border-radius: 8px; padding: 3px 6px; font-size: 11px; color: #0F172A; }
  .bridge-ctrl button { border: 1px solid #E5E7EB; background: #FFFFFF; border-radius: 8px; padding: 3px 8px; font-size: 11px; color: #2563EB; cursor: pointer; font-weight: 500; }
  .bridge-ctrl button:hover { border-color: #2563EB; }
  .list { max-height: 300px; overflow-y: auto; }
  .item { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #E5E7EB; background: #FFFFFF; }
  .item:hover { background: #F8FAFC; }
  .item input { accent-color: #2563EB; }
  .meta { flex: 1; min-width: 0; }
  .fn { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { color: #64748B; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .tag { font-size: 10px; padding: 2px 7px; border-radius: 8px; background: #EFF6FF; color: #2563EB; white-space: nowrap; font-weight: 600; }
  .empty { padding: 28px 16px; text-align: center; color: #64748B; line-height: 1.6; }
  .foot { display: flex; gap: 8px; padding: 12px 14px; background: #F8F9FA; }
  .foot button { flex: 1; padding: 8px 12px; border: 1px solid #E5E7EB; border-radius: 12px; background: #FFFFFF; color: #0F172A; cursor: pointer; font-weight: 600; font-size: 12px; }
  .foot button.primary { background: #2563EB; color: #FFFFFF; border-color: #2563EB; }
  .foot button.primary:hover { background: #1D4ED8; }
</style>
</head>
<body>
  <div class="head">
    <h1>JoelDeskPro 嗅探到的资源</h1>
    <button id="clear">清空</button>
  </div>
  <div class="bridge-bar">
    <div class="bridge-status">
      <span><i id="dotWeb" class="dot"></i>网页端</span>
      <span><i id="dotLocal" class="dot"></i>本地端</span>
    </div>
    <div class="bridge-ctrl">
      <select id="targetMode" title="选择接收端">
        <option value="auto">自动双通道</option>
        <option value="web">仅网页端</option>
        <option value="local">仅本地端</option>
      </select>
      <button id="openWeb">打开网页</button>
    </div>
  </div>
  <div class="takeover-row">
    <input type="checkbox" id="takeover" checked>
    <label for="takeover">接管浏览器下载（自动转 Joel Desk Pro 分片提速）</label>
    <button class="gear" id="gear" title="接管规则设置">⚙</button>
  </div>
  <div class="settings" id="settings">
    <h2>接管以下类型的下载</h2>
    <div class="cats" id="cats"></div>
    <div class="custom-row">
      <label for="customExt">自定义扩展名（逗号分隔，如 psd, apk）</label>
      <input type="text" id="customExt" placeholder="留空则不额外接管">
    </div>
    <div class="size-row">
      <span>仅接管大于</span>
      <input type="number" id="minSize" min="0" step="1" value="0">
      <span>MB 的文件（0 = 不限）</span>
    </div>
    <div class="custom-row">
      <label for="blacklist">网站黑名单（不嗅探、不接管）</label>
      <textarea id="blacklist" rows="2" placeholder="如 bank.com, company.internal"></textarea>
    </div>
    <div class="saved" id="saved"></div>
  </div>
  <div id="list" class="list"></div>
  <div class="foot">
    <button id="selAll">全选</button>
    <button id="send" class="primary">发送到 Joel Desk Pro</button>
  </div>
  <script src="popup.js"></script>
</body>
</html>
`;

  const popupJs = `'use strict';
function fmtSize(b) {
  if (b == null) return '未知大小';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + ' ' + u[i];
}

let resources = [];
let tabId = null;
const selection = new Map();
const listEl = document.getElementById('list');

function sig(list) { return list.map((r) => r.url).join('|'); }

function draw() {
  listEl.innerHTML = '';
  if (!resources.length) {
    listEl.innerHTML = '<div class="empty">当前页面暂未嗅探到资源。<br>播放视频或等待播放器加载后即可一键下载。</div>';
    return;
  }
  resources.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'item';
    const checked = selection.get(r.url) ? 'checked' : '';
    div.innerHTML = \`
      <input type="checkbox" data-url="\${encodeURIComponent(r.url)}" \${checked}>
      <div class="meta">
        <div class="fn" title="\${r.filename}">\${r.filename}</div>
        <div class="sub" title="\${r.url}">\${fmtSize(r.size)} · \${r.url}</div>
      </div>
      <span class="tag">\${r.tag || '文件'}</span>\`;
    listEl.appendChild(div);
  });
  listEl.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.onchange = () => selection.set(decodeURIComponent(cb.dataset.url), cb.checked);
  });
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
    const items = resources.filter((r) => selection.get(r.url));
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

  const CATEGORY_LABELS = { video: '视频', audio: '音频', archive: '压缩包', program: '程序/安装包', document: '文档', model: '大模型', other: '种子/磁力' };
  const CATEGORY_ORDER = ['video','audio','archive','program','document','model','other'];
  const DEFAULTS = { takeover: true, categories: { video:true, audio:true, archive:true, program:true, document:true, model:true, other:true }, customExt: [], minSize: 0, blacklist: [] };

  const tk = document.getElementById('takeover');
  const gear = document.getElementById('gear');
  const panel = document.getElementById('settings');
  const catsEl = document.getElementById('cats');
  const customEl = document.getElementById('customExt');
  const minSizeEl = document.getElementById('minSize');
  const blacklistEl = document.getElementById('blacklist');
  const savedEl = document.getElementById('saved');
  const targetModeEl = document.getElementById('targetMode');
  const dotWebEl = document.getElementById('dotWeb');
  const dotLocalEl = document.getElementById('dotLocal');
  const openWebBtn = document.getElementById('openWeb');

  chrome.runtime.sendMessage({ type: 'getBridgeStatus' }, (st) => {
    if (!st) return;
    if (st.webConnected) dotWebEl.classList.add('on');
    if (st.localOnline) dotLocalEl.classList.add('on');
    if (st.targetMode) targetModeEl.value = st.targetMode;
  });

  targetModeEl.onchange = () => {
    chrome.storage.local.set({ targetMode: targetModeEl.value });
  };
  openWebBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: 'openWebApp' }, () => window.close());
  };

  for (const cat of CATEGORY_ORDER) {
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.cat = cat;
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(CATEGORY_LABELS[cat]));
    catsEl.appendChild(lab);
  }

  let saveTimer = null;
  function collectAndSave() {
    const categories = {};
    catsEl.querySelectorAll('input[data-cat]').forEach((cb) => { categories[cb.dataset.cat] = cb.checked; });
    const customExt = customEl.value.split(/[,，\\s]+/).map((s) => s.trim().replace(/^\\./, '').toLowerCase()).filter(Boolean);
    const minSize = Math.max(0, parseInt(minSizeEl.value, 10) || 0);
    const blacklist = blacklistEl.value.split(/[,，\\s\\n]+/).map((s) => s.trim().toLowerCase().replace(/^https?:\\/\\//, '').replace(/\\/.*$/, '')).filter(Boolean);
    chrome.storage.local.set({ takeover: tk.checked, targetMode: targetModeEl.value, categories, customExt, minSize, blacklist }, () => {
      savedEl.textContent = '✓ 已保存';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { savedEl.textContent = ''; }, 1200);
    });
  }

  chrome.storage.local.get(['takeover','targetMode','categories','customExt','minSize','blacklist'], (r) => {
    tk.checked = typeof r.takeover === 'boolean' ? r.takeover : DEFAULTS.takeover;
    if (typeof r.targetMode === 'string') targetModeEl.value = r.targetMode;
    const cats = Object.assign({}, DEFAULTS.categories, r.categories || {});
    catsEl.querySelectorAll('input[data-cat]').forEach((cb) => { cb.checked = !!cats[cb.dataset.cat]; });
    customEl.value = Array.isArray(r.customExt) ? r.customExt.join(', ') : '';
    minSizeEl.value = typeof r.minSize === 'number' ? r.minSize : 0;
    blacklistEl.value = Array.isArray(r.blacklist) ? r.blacklist.join(', ') : '';
  });

  gear.onclick = () => panel.classList.toggle('open');
  tk.onchange = collectAndSave;
  catsEl.addEventListener('change', collectAndSave);
  customEl.addEventListener('change', collectAndSave);
  minSizeEl.addEventListener('change', collectAndSave);
  blacklistEl.addEventListener('change', collectAndSave);
}
init();
`;

  const readmeTxt = `JoelDeskPro 浏览器插件（Joel Desk Pro 网页端 + 本地端双通道）
============================================================
1. 右键 joeldeskpro-chrome-extension.zip -> 全部解压缩到任意文件夹（如 Downloads\\joeldeskpro-chrome-extension）。
   注意：manifest.json 就在解压后的第一层目录里，无需再往里点一层！
2. 在 Chrome 地址栏打开：chrome://extensions
3. 打开右上角「开发者模式」。
4. 点击左上角「加载已解压的扩展程序」，直接选择解压出来的文件夹即可成功安装！

双通道说明：
- 网页端直用：打开已发布的 Joel Desk Pro 网页端，插件会自动握手注册，看视频右上角点击「JoelDeskPro 下载」即可直接推到网页端下载。
- 本地客户端：若同时运行了本机 joeldeskpro-local-engine.mjs（端口 ${port}），插件会自动优先走本地高速引擎并同步进度到网页端。
`;

  // IMPORTANT: All extension files sit directly at the ZIP root so Windows "Extract All"
  // produces Downloads\joeldeskpro-chrome-extension\manifest.json (never double-nested!).
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
      { path: 'README_INSTALL.txt', content: readmeTxt },
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
import { spawn } from 'node:child_process';

const PORT = ${port};
const TOKEN = ${JSON.stringify(token)};
let DEFAULT_SAVE_DIR = ${JSON.stringify(defaultSaveDir)}.startsWith('~')
  ? path.join(os.homedir(), ${JSON.stringify(defaultSaveDir)}.slice(1))
  : ${JSON.stringify(defaultSaveDir)};

const tasks = new Map();

function sanitizeName(name) {
  return (name || 'download.bin').replace(/[\\\\/:*?"<>|]+/g, '_').trim() || 'download.bin';
}

async function downloadMultiChunkRange(task) {
  const { url, filePath, threads, headers } = task;
  const reqHeaders = { 'User-Agent': 'Mozilla/5.0 JoelDeskPro/1.1', ...headers };

  // Probe Content-Length & Accept-Ranges
  const headRes = await fetch(url, { method: 'HEAD', headers: reqHeaders });
  const totalBytes = Number(headRes.headers.get('content-length') || 0);
  const acceptRanges = (headRes.headers.get('accept-ranges') || '').toLowerCase();

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Multi-chunk Range download when server supports Range & size >= 2MB
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

  // Fallback single stream if server doesn't expose Content-Length
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

function downloadViaYtdlp(task) {
  return new Promise((resolve, reject) => {
    const outTemplate = path.join(task.saveDir, '%(title).80s.%(ext)s');
    const proc = spawn('yt-dlp', ['-N', String(Math.min(16, task.threads)), '-o', outTemplate, task.url], {
      stdio: 'inherit',
    });
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
}

function startTask(payload) {
  const id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const saveDir = payload.saveDir || DEFAULT_SAVE_DIR;
  const fileName = sanitizeName(payload.fileName || payload.filename || 'download.mp4');
  const threads = Number(payload.threads) || 16;
  const cookieHeader = Array.isArray(payload.cookies)
    ? payload.cookies.map((c) => \`\${c.name}=\${c.value}\`).join('; ')
    : typeof payload.cookies === 'string'
      ? payload.cookies
      : '';

  const headers = {};
  if (payload.referer) headers.Referer = payload.referer;
  if (cookieHeader) headers.Cookie = cookieHeader;

  const task = {
    id,
    url: payload.url,
    fileName,
    saveDir,
    filePath: path.join(saveDir, fileName),
    threads,
    headers,
    totalBytes: 0,
    downloadedBytes: 0,
    chunks: Array.from({ length: 8 }, () => 0),
    status: 'downloading',
  };
  tasks.set(id, task);

  const isVideoPage = payload.kind === 'video-platform' || /(youtube\\.com|youtu\\.be|bilibili\\.com|tiktok\\.com)/i.test(payload.url);
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

  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, saveDir: DEFAULT_SAVE_DIR, tasks: [...tasks.values()] }));
    return;
  }

  if (req.method === 'POST' && (req.url === '/api/bridge/capture' || req.url === '/api/download')) {
    const reqToken = req.headers['x-deskkit-token'];
    if (TOKEN && reqToken && reqToken !== TOKEN) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid token' }));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const list = Array.isArray(body.items) ? body.items : [body];
      const created = list.filter((it) => it && it.url).map(startTask);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: created.length, tasks: created }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(\`[Joel Desk Pro] 本地多线程下载引擎已启动: http://127.0.0.1:\${PORT}\`);
  console.log(\`[Joel Desk Pro] 默认保存目录: \${DEFAULT_SAVE_DIR}\`);
});
`;
}
