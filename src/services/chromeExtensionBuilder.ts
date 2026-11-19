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
 * Generates a valid RGBA PNG icon (luxury obsidian-black tile with brushed champagne-gold frame & "J" monogram)
 * with zero external dependencies so Chrome displays a matching JoelDeskPro emblem.
 */
function createDeskKitIconPng(size: number): Uint8Array {
  const stride = 1 + size * 4;
  const raw = new Uint8Array(stride * size);
  const radius = size * 0.25;
  const borderWidth = Math.max(1.2, size * 0.045);

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      // Rounded-square signed distance
      const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
      const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;

      // Edge distance for champagne-gold outer bezel
      const edgeDist = Math.min(x, y, size - 1 - x, size - 1 - y);
      const isBezel = dist >= radius - borderWidth || edgeDist < borderWidth;

      // Sculpted luxury "J" monogram geometry
      const isTopSerif = ny >= 0.23 && ny <= 0.305 && nx >= 0.45 && nx <= 0.72;
      const isStem = nx >= 0.54 && nx <= 0.65 && ny >= 0.27 && ny <= 0.61;
      const cx = 0.46;
      const cy = 0.60;
      const hookDist = Math.sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy));
      const isHookArc = ny >= cy - 0.01 && hookDist >= 0.085 && hookDist <= 0.19;
      const isLeftTerminal =
        Math.sqrt((nx - 0.33) * (nx - 0.33) + (ny - 0.635) * (ny - 0.635)) <= 0.056;
      const isGoldLetter = isTopSerif || isStem || isHookArc || isLeftTerminal;

      if (isGoldLetter || isBezel) {
        // Metallic champagne-gold gradient (#FCE7A2 -> #D4AF37 -> #A67E26)
        const t = Math.min(1, Math.max(0, (nx + ny) * 0.55));
        const r = Math.round(252 - t * 52);
        const g = Math.round(228 - t * 68);
        const b = Math.round(150 - t * 92);
        raw[px] = r;
        raw[px + 1] = g;
        raw[px + 2] = b;
        raw[px + 3] = 255;
      } else {
        // Deep obsidian radial highlight (#1E1E24 -> #09090C)
        const dLight = Math.sqrt((nx - 0.3) * (nx - 0.3) + (ny - 0.25) * (ny - 0.25));
        const v = Math.max(9, Math.round(34 - dLight * 28));
        raw[px] = v;
        raw[px + 1] = v;
        raw[px + 2] = Math.min(255, v + 4);
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
export function buildDeskKitChromeExtension(port: number, token: string, _defaultWebUrl = '') {
  const endpoint = `http://127.0.0.1:${port}/api/bridge/capture`;

  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: 'JoelDeskPro',
      version: '1.2.0',
      description:
        'JoelDeskPro Chrome 插件：配合 Joel Desk Pro 桌面客户端使用，在 YouTube / 抖音 / 小红书 / B站等任意视频平台弹出画质与大小选择小窗，后台静默高速下载不跳转页面。',
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

  function extractDouyinVariants(video) {
    if (!video || typeof video !== 'object') return [];
    const variants = [];
    const seenH = new Set();
    const firstUrl = (addr) => {
      if (!addr || typeof addr !== 'object') return null;
      const list = addr.url_list || addr.urlList || [];
      for (const u of list) {
        const n = normUrl(typeof u === 'string' ? u : u && (u.src || u.url));
        if (n) return n;
      }
      return null;
    };
    try {
      const brs = video.bit_rate || video.bitRateList || video.bitrateList;
      if (Array.isArray(brs)) {
        const sorted = [...brs].sort((a, b) => {
          const ah = (a && a.play_addr && a.play_addr.height) || (a && a.height) || 0;
          const bh = (b && b.play_addr && b.play_addr.height) || (b && b.height) || 0;
          if (bh !== ah) return bh - ah;
          return (Number(b && b.bit_rate) || 0) - (Number(a && a.bit_rate) || 0);
        });
        for (let i = 0; i < sorted.length; i++) {
          const b = sorted[i];
          if (!b) continue;
          const addr = b.play_addr || b.playAddr;
          const u = firstUrl(addr) || normUrl(b.play_api || b.playApi);
          if (!u) continue;
          const w = Number((addr && addr.width) || b.width || video.width || 0);
          const h = Number((addr && addr.height) || b.height || video.height || 0);
          const shortSide = w && h ? Math.min(w, h) : h || w;
          const gear = String(b.gear_name || b.gearName || '');
          const gm = gear.match(/(2160|1440|1080|720|540|480|360)/);
          const qualityH = gm ? Number(gm[1]) : shortSide >= 1000 ? 1080 : shortSide >= 700 ? 720 : shortSide >= 500 ? 540 : shortSide || h;
          const key = qualityH + '-' + (b.is_h265 ? 'h265' : 'h264');
          if (seenH.has(qualityH)) continue;
          seenH.add(qualityH);
          const sizeBytes = Number((addr && (addr.data_size || addr.dataSize)) || b.data_size || 0) || null;
          const fps = Number(b.FPS || b.fps || 0) || null;
          variants.push({
            id: 'dy-' + key + '-' + i,
            url: u,
            height: qualityH,
            width: w,
            fps: fps && fps >= 45 ? fps : null,
            sizeBytes,
            ext: 'mp4',
            label: qualityH >= 2160 ? '2160p (4K)' : qualityH >= 1080 ? '1080p HD' : qualityH >= 720 ? '720p HD' : qualityH ? qualityH + 'p' : '原画',
            note: [fps && fps >= 45 ? fps + 'fps' : '', 'MP4'].filter(Boolean).join(' · '),
          });
        }
      }
      if (!variants.length) {
        const urls = bestPlayUrls(video);
        if (urls.length) {
          const addr = video.play_addr || video.playAddr || {};
          const w = Number(addr.width || video.width || 0);
          const h = Number(addr.height || video.height || 0);
          const q = w && h ? Math.min(w, h) : h;
          variants.push({
            id: 'dy-orig',
            url: urls[0],
            height: q,
            width: w,
            fps: null,
            sizeBytes: Number(addr.data_size || addr.dataSize || 0) || null,
            ext: 'mp4',
            label: q >= 1080 ? '1080p HD' : q >= 720 ? '720p HD' : q ? q + 'p' : '原画',
            note: 'MP4',
          });
        }
      }
    } catch (e) {}
    return variants;
  }

  function awemeIdOf(node) {
    return node && (node.aweme_id || node.awemeId);
  }

  function deepCollectAweme(root, map, varMap, budgetMax) {
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
          if (varMap) {
            const vars = extractDouyinVariants(vid);
            if (vars.length) varMap[String(id)] = vars;
          }
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

  function reportDouyinMap(map, varMap) {
    try {
      if ((!map || !Object.keys(map).length) && (!varMap || !Object.keys(varMap).length)) return;
      window.postMessage({ __deskkit_douyin: true, map: map || {}, variants: varMap || {} }, '*');
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
    const varMap = {};
    try {
      deepCollectAweme(obj, map, varMap);
    } catch (e) {}
    reportDouyinMap(map, varMap);
  }

  function scanDouyinGlobals() {
    if (!/(^|\\.)douyin\\.com$/i.test(location.hostname)) return;
    const map = {};
    const varMap = {};
    const keys = ['_ROUTER_DATA', '__INITIAL_STATE__', '__INIT_PROPS__', '_SSR_DATA', 'RENDER_DATA', '__NEXT_DATA__'];
    for (const key of keys) {
      try {
        if (window[key]) deepCollectAweme(window[key], map, varMap);
      } catch (e) {}
    }
    reportDouyinMap(map, varMap);
  }

  // Xiaohongshu multi-quality stream extractor
  function scanXhsStreams() {
    if (!/(^|\\.)xiaohongshu\\.com$/i.test(location.hostname)) return;
    try {
      const state = window.__INITIAL_STATE__;
      if (!state || typeof state !== 'object') return;
      const variants = [];
      const seenH = new Set();
      const stack = [[state, 0]];
      const visited = new Set();
      let budget = 18000;
      while (stack.length && budget-- > 0) {
        const [node, depth] = stack.pop();
        if (!node || typeof node !== 'object' || depth > 12 || visited.has(node)) continue;
        visited.add(node);
        if (node.stream && typeof node.stream === 'object') {
          const pools = [...(node.stream.h264 || []), ...(node.stream.h265 || []), ...(node.stream.av1 || [])];
          for (const st of pools) {
            if (!st || typeof st !== 'object') continue;
            const u = normUrl(st.masterUrl || (Array.isArray(st.backupUrls) && st.backupUrls[0]));
            if (!u) continue;
            const w = Number(st.width || 0);
            const h = Number(st.height || 0);
            const q = w && h ? Math.min(w, h) : h;
            if (seenH.has(q || u)) continue;
            seenH.add(q || u);
            variants.push({
              id: 'xhs-' + (q || variants.length),
              url: u,
              height: q,
              width: w,
              fps: Number(st.fps || 0) >= 45 ? Math.round(Number(st.fps)) : null,
              sizeBytes: Number(st.size || 0) || null,
              ext: 'mp4',
              label: q >= 2160 ? '2160p (4K)' : q >= 1080 ? '1080p HD' : q >= 720 ? '720p HD' : q ? q + 'p' : (st.streamDesc || '原画'),
              note: st.streamDesc || 'MP4',
            });
          }
        }
        for (const k in node) {
          try {
            const v = node[k];
            if (v && typeof v === 'object') stack.push([v, depth + 1]);
          } catch (e) {}
        }
      }
      if (variants.length) {
        window.postMessage({ __deskkit_xhs: true, variants, pageUrl: location.href }, '*');
      }
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
    const varMap = {};
    let hops = 0;
    while (fiber && hops++ < 40 && !Object.keys(map).length) {
      for (const key of ['memoizedProps', 'pendingProps', 'memoizedState']) {
        try {
          const p = fiber[key];
          if (p && typeof p === 'object') deepCollectAweme(p, map, varMap, 6000);
        } catch (e) {}
      }
      fiber = fiber.return;
    }
    reportDouyinMap(map, varMap);
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
                const vm = {};
                deepCollectAweme(this.response, m, vm);
                reportDouyinMap(m, vm);
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

  if (/(^|\\.)xiaohongshu\\.com$/i.test(location.hostname)) {
    setInterval(scanXhsStreams, 1500);
    scanXhsStreams();
  }
})();
`;

  const contentJs = `'use strict';
// JoelDeskPro Content Script (Desktop Client Bridge Only):
// 1) Top-right Black & Gold hover "JoelDeskPro 下载" button on any <video>
// 2) In-page Shadow DOM Quality & File-Size Picker mini-window (YouTube, Douyin, Xiaohongshu, Bilibili, TikTok, X, HLS, MP4...)
// 3) Pure silent background download -> NEVER jumps away or steals focus
(function () {
  const seen = new Set();
  const douyinPlayMap = Object.create(null);
  const douyinVariantMap = Object.create(null);
  let xhsVariants = [];
  let dismissed = false;

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || typeof ev.data !== 'object') return;
    if (ev.data.__deskkit_media && ev.data.url && !seen.has(ev.data.url)) {
      seen.add(ev.data.url);
      report([{ url: ev.data.url, mime: ev.data.mime || '', title: document.title, pageUrl: location.href }]);
      return;
    }
    if (ev.data.__deskkit_douyin) {
      if (ev.data.map) {
        for (const k in ev.data.map) {
          if (Array.isArray(ev.data.map[k]) && ev.data.map[k].length) {
            douyinPlayMap[k] = ev.data.map[k];
          }
        }
      }
      if (ev.data.variants) {
        for (const k in ev.data.variants) {
          if (Array.isArray(ev.data.variants[k]) && ev.data.variants[k].length) {
            douyinVariantMap[k] = ev.data.variants[k];
          }
        }
      }
      return;
    }
    if (ev.data.__deskkit_xhs && Array.isArray(ev.data.variants) && ev.data.variants.length) {
      xhsVariants = ev.data.variants;
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
    xhsVariants = [];
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

  // Top-frame floating download button + Shadow DOM Quality Picker mini-window
  if (window.top === window.self) {
    const OVERLAY_ID = 'deskkit-video-overlay';
    const PICKER_HOST_ID = 'joeldeskpro-quality-picker-host';
    let overlayEl = null;
    let overlayTarget = null;
    let hideTimer = null;
    let pickerHost = null;
    let pickerCloseTimer = null;

    function fmtSize(bytes, estimated) {
      if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '大小未知';
      const u = ['B', 'KB', 'MB', 'GB'];
      let i = 0;
      let n = bytes;
      while (n >= 1024 && i < u.length - 1) {
        n /= 1024;
        i++;
      }
      return (estimated ? '约 ' : '') + n.toFixed(i >= 2 ? 1 : 0) + ' ' + u[i];
    }

    function fmtDuration(sec) {
      if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
      const s = Math.floor(sec);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const r = s % 60;
      const pad = (x) => String(x).padStart(2, '0');
      return h > 0 ? h + ':' + pad(m) + ':' + pad(r) : m + ':' + pad(r);
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function isDownloadableVideo(v) {
      if (!(v instanceof HTMLVideoElement)) return false;
      const r = v.getBoundingClientRect();
      if (r.width < 120 || r.height < 80) return false;
      if (v.readyState === 0 && !v.currentSrc && !v.querySelector('source')) return false;
      return true;
    }

    function showToast(msg, tone) {
      const t = document.createElement('div');
      t.textContent = msg;
      Object.assign(t.style, {
        position: 'fixed',
        right: '22px',
        bottom: '22px',
        zIndex: '2147483647',
        padding: '10px 15px',
        borderRadius: '14px',
        border: tone === 'error' ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(212,175,55,0.45)',
        background: 'rgba(12,12,14,0.94)',
        color: tone === 'error' ? '#FCA5A5' : '#F8FAFC',
        font: '600 12.5px/1.4 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif',
        boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      });
      (document.body || document.documentElement).appendChild(t);
      setTimeout(() => t.remove(), 2600);
    }

    function closePicker() {
      clearTimeout(pickerCloseTimer);
      if (pickerHost) {
        pickerHost.remove();
        pickerHost = null;
      }
    }

    function openQualityPicker(candidate, anchorRect) {
      closePicker();

      const host = document.createElement('div');
      host.id = PICKER_HOST_ID;
      Object.assign(host.style, {
        position: 'fixed',
        zIndex: '2147483647',
        top: '0',
        left: '0',
        width: '0',
        height: '0',
        pointerEvents: 'none',
      });
      const shadow = host.attachShadow({ mode: 'open' });

      const panelW = 336;
      const defaultLeft = anchorRect
        ? Math.max(12, Math.min(window.innerWidth - panelW - 14, anchorRect.right - panelW))
        : window.innerWidth - panelW - 22;
      const defaultTop = anchorRect
        ? Math.max(12, Math.min(window.innerHeight - 360, anchorRect.top + 46))
        : 64;

      shadow.innerHTML = \`
        <style>
          * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }
          .card {
            position: fixed;
            top: \${defaultTop}px;
            left: \${defaultLeft}px;
            width: \${panelW}px;
            max-height: 440px;
            display: flex;
            flex-direction: column;
            background: #111215;
            color: #F8FAFC;
            border: 1px solid rgba(212, 175, 55, 0.38);
            border-radius: 16px;
            box-shadow: 0 20px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.04) inset;
            overflow: hidden;
            pointer-events: auto;
            animation: jdpFadeIn 0.14s ease-out;
          }
          @keyframes jdpFadeIn {
            from { opacity: 0; transform: translateY(-6px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .hd {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 11px 13px;
            background: linear-gradient(135deg, #17181C 0%, #0D0E10 100%);
            border-bottom: 1px solid rgba(255,255,255,0.08);
          }
          .logo {
            width: 22px;
            height: 22px;
            border-radius: 6px;
            background: linear-gradient(135deg, #F3D98B 0%, #C89B2B 100%);
            color: #0B0B0D;
            font-weight: 800;
            font-size: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .brand { font-size: 12.5px; font-weight: 700; letter-spacing: 0.2px; color: #F5E1A4; }
          .plat {
            font-size: 10.5px;
            font-weight: 600;
            padding: 2px 7px;
            border-radius: 6px;
            background: rgba(212,175,55,0.14);
            color: #E5C466;
            border: 1px solid rgba(212,175,55,0.28);
            max-width: 110px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .spacer { flex: 1; }
          .close {
            width: 24px;
            height: 24px;
            border: none;
            border-radius: 8px;
            background: rgba(255,255,255,0.06);
            color: #94A3B8;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .close:hover { background: rgba(255,255,255,0.14); color: #fff; }
          .title-box {
            padding: 9px 13px 7px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .title {
            font-size: 12px;
            font-weight: 600;
            color: #E2E8F0;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .meta { font-size: 10.5px; color: #94A3B8; margin-top: 3px; display: flex; gap: 8px; }
          .body {
            padding: 8px 10px;
            overflow-y: auto;
            max-height: 235px;
            display: flex;
            flex-direction: column;
            gap: 5px;
          }
          .loading {
            padding: 24px 12px;
            text-align: center;
            color: #94A3B8;
            font-size: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 9px;
          }
          .spin {
            width: 20px;
            height: 20px;
            border: 2px solid rgba(212,175,55,0.22);
            border-top-color: #D4AF37;
            border-radius: 9999px;
            animation: jdpSpin 0.75s linear infinite;
          }
          @keyframes jdpSpin { to { transform: rotate(360deg); } }
          .row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.07);
            background: rgba(255,255,255,0.03);
            cursor: pointer;
            transition: all 0.12s ease;
          }
          .row:hover {
            background: rgba(212,175,55,0.09);
            border-color: rgba(212,175,55,0.34);
          }
          .row.active {
            background: rgba(212,175,55,0.14);
            border-color: rgba(212,175,55,0.72);
          }
          .radio {
            width: 14px;
            height: 14px;
            border-radius: 9999px;
            border: 1.5px solid #64748B;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .row.active .radio { border-color: #E5C466; }
          .row.active .radio::after {
            content: '';
            width: 7px;
            height: 7px;
            border-radius: 9999px;
            background: #E5C466;
          }
          .q-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
          .q-label { font-size: 12.5px; font-weight: 700; color: #F8FAFC; }
          .q-note {
            font-size: 10px;
            color: #94A3B8;
            background: rgba(255,255,255,0.06);
            padding: 1px 6px;
            border-radius: 5px;
            white-space: nowrap;
          }
          .q-size {
            font-size: 11.5px;
            font-weight: 600;
            color: #E5C466;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
          }
          .q-go {
            border: none;
            border-radius: 7px;
            padding: 4px 8px;
            background: rgba(212,175,55,0.18);
            color: #F5E1A4;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
          }
          .q-go:hover { background: #D4AF37; color: #0B0B0D; }
          .warn {
            margin: 4px 10px 0;
            padding: 6px 9px;
            border-radius: 8px;
            background: rgba(245,158,11,0.12);
            border: 1px solid rgba(245,158,11,0.3);
            color: #FCD34D;
            font-size: 11px;
            line-height: 1.45;
          }
          .ft {
            padding: 10px 12px 11px;
            border-top: 1px solid rgba(255,255,255,0.08);
            background: #0D0E10;
            display: flex;
            flex-direction: column;
            gap: 7px;
          }
          .cta {
            width: 100%;
            border: none;
            border-radius: 10px;
            padding: 9px 12px;
            background: linear-gradient(135deg, #F3D98B 0%, #C89B2B 100%);
            color: #0B0B0D;
            font-size: 12.5px;
            font-weight: 700;
            cursor: pointer;
            transition: opacity 0.12s;
          }
          .cta:hover { opacity: 0.92; }
          .cta:disabled { opacity: 0.45; cursor: not-allowed; }
          .cta.ok { background: #16A34A; color: #FFFFFF; }
          .hint {
            font-size: 10.5px;
            color: #94A3B8;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
        <div class="card" role="dialog" aria-label="JoelDeskPro 画质选择">
          <div class="hd">
            <div class="logo">J</div>
            <span class="brand">JoelDeskPro</span>
            <span class="plat" id="plat">解析中</span>
            <div class="spacer"></div>
            <button type="button" class="close" id="closeBtn" title="关闭">✕</button>
          </div>
          <div class="title-box">
            <div class="title" id="titleText">\${escapeHtml(candidate.title || document.title || '视频资源')}</div>
            <div class="meta" id="metaText"><span>正在检测可用画质与文件大小…</span></div>
          </div>
          <div id="warnBox"></div>
          <div class="body" id="bodyEl">
            <div class="loading">
              <div class="spin"></div>
              <span>正在分析当前视频支持的画质与大小…</span>
            </div>
          </div>
          <div class="ft">
            <button type="button" class="cta" id="dlBtn" disabled>后台下载</button>
            <div class="hint" id="hintText">后台静默下载，不会跳转页面</div>
          </div>
        </div>
      \`;

      (document.body || document.documentElement).appendChild(host);
      pickerHost = host;

      const platEl = shadow.getElementById('plat');
      const titleEl = shadow.getElementById('titleText');
      const metaEl = shadow.getElementById('metaText');
      const warnBox = shadow.getElementById('warnBox');
      const bodyEl = shadow.getElementById('bodyEl');
      const dlBtn = shadow.getElementById('dlBtn');
      const hintText = shadow.getElementById('hintText');
      const closeBtn = shadow.getElementById('closeBtn');

      closeBtn.onclick = closePicker;

      const onKey = (e) => {
        if (e.key === 'Escape') {
          closePicker();
          window.removeEventListener('keydown', onKey, true);
        }
      };
      window.addEventListener('keydown', onKey, true);

      let formats = [];
      let selectedIdx = 0;
      let resolvedTitle = candidate.title || document.title || 'video';
      let saveDir = '';

      function updateCta() {
        const f = formats[selectedIdx];
        if (!f) {
          dlBtn.disabled = true;
          dlBtn.textContent = '暂无可下载画质';
          return;
        }
        dlBtn.disabled = false;
        const sizeTxt = f.sizeBytes ? ' · ' + fmtSize(f.sizeBytes, f.estimated) : '';
        dlBtn.textContent = '后台下载 (' + f.label + sizeTxt + ')';
      }

      function dispatchFormat(idx) {
        const f = formats[idx];
        if (!f) return;
        dlBtn.disabled = true;
        dlBtn.textContent = '正在加入后台队列…';
        const cleanTitle = (resolvedTitle || 'video').replace(/[\\\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'video';
        const ext = f.ext || (f.audioOnly ? 'mp3' : 'mp4');
        const item = {
          url: f.url || candidate.url,
          kind: f.kind || candidate.kind || 'http',
          filename: cleanTitle + '.' + ext,
          referer: candidate.referer || location.href,
          formatId: f.formatId || '',
          qualityLabel: f.label || '',
          audioOnly: Boolean(f.audioOnly),
          ext,
          size: f.sizeBytes || null,
        };
        chrome.runtime.sendMessage({ type: 'send', items: [item] }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            dlBtn.disabled = false;
            updateCta();
            warnBox.innerHTML = '<div class="warn">未检测到 Joel Desk Pro 客户端（端口 ${port}），请先启动桌面客户端后重试。</div>';
            return;
          }
          dlBtn.classList.add('ok');
          dlBtn.textContent = '✓ 已开始后台下载（' + f.label + '）';
          const dir = (resp && resp.saveDir) || saveDir || 'Chrome 默认下载目录';
          hintText.textContent = '保存至: ' + dir + ' · 无需跳转';
          showToast('已开始后台下载：' + f.label + (f.sizeBytes ? ' (' + fmtSize(f.sizeBytes, f.estimated) + ')' : ''));
          pickerCloseTimer = setTimeout(closePicker, 1500);
        });
      }

      function renderFormats() {
        bodyEl.innerHTML = '';
        if (!formats.length) {
          bodyEl.innerHTML = '<div class="loading"><span>未能解析出画质列表，请稍后重试。</span></div>';
          updateCta();
          return;
        }
        formats.forEach((f, idx) => {
          const row = document.createElement('div');
          row.className = 'row' + (idx === selectedIdx ? ' active' : '');
          row.innerHTML = \`
            <div class="radio"></div>
            <div class="q-main">
              <span class="q-label">\${escapeHtml(f.label)}</span>
              \${f.note ? '<span class="q-note">' + escapeHtml(f.note) + '</span>' : ''}
            </div>
            <span class="q-size">\${escapeHtml(fmtSize(f.sizeBytes, f.estimated))}</span>
            <button type="button" class="q-go">下载</button>
          \`;
          row.onclick = () => {
            selectedIdx = idx;
            bodyEl.querySelectorAll('.row').forEach((r, i) => r.classList.toggle('active', i === idx));
            updateCta();
          };
          row.querySelector('.q-go').onclick = (e) => {
            e.stopPropagation();
            selectedIdx = idx;
            dispatchFormat(idx);
          };
          bodyEl.appendChild(row);
        });
        updateCta();
      }

      dlBtn.onclick = () => dispatchFormat(selectedIdx);

      // Call background -> local Desktop Client /api/bridge/probe
      chrome.runtime.sendMessage({ type: 'probe', item: candidate }, (resp) => {
        if (!pickerHost) return;
        if (chrome.runtime.lastError || !resp || !resp.clientOnline) {
          platEl.textContent = '客户端未启动';
          metaEl.innerHTML = '<span>请先打开 Joel Desk Pro 桌面客户端</span>';
          warnBox.innerHTML = '<div class="warn">未检测到本地客户端（127.0.0.1:${port}），打开 Joel Desk Pro 后即可自动解析任意平台画质并后台高速下载。</div>';
          // If page already has direct variants (Douyin/Xiaohongshu), still preview them cleanly
          if (Array.isArray(candidate.variants) && candidate.variants.length) {
            formats = candidate.variants;
            renderFormats();
          } else {
            bodyEl.innerHTML = '<div class="loading"><span>等待连接 Joel Desk Pro 桌面客户端…</span></div>';
          }
          return;
        }

        resolvedTitle = resp.title || resolvedTitle;
        saveDir = resp.saveDir || '';
        platEl.textContent = resp.platform || 'Video';
        titleEl.textContent = resolvedTitle;
        const dur = fmtDuration(resp.duration);
        const countTxt = Array.isArray(resp.formats) ? resp.formats.length + ' 种可选画质' : '';
        metaEl.innerHTML = [dur ? '<span>时长 ' + dur + '</span>' : '', countTxt ? '<span>' + countTxt + '</span>' : '']
          .filter(Boolean)
          .join('<span>·</span>');
        if (saveDir) {
          hintText.textContent = '保存至: ' + saveDir + ' · 后台下载不跳转';
        }
        if (resp.probeError) {
          warnBox.innerHTML = '<div class="warn">' + escapeHtml(resp.probeError) + '</div>';
        }
        formats = Array.isArray(resp.formats) ? resp.formats : [];
        selectedIdx = 0;
        renderFormats();
      });
    }

    function buildOverlay() {
      if (overlayEl) return overlayEl;
      const el = document.createElement('div');
      el.id = OVERLAY_ID;
      el.innerHTML = \`
        <button type="button" class="dk-dl-btn" title="选择画质并后台高速下载（不跳转页面）">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M12 3v11M12 14l-4-4M12 14l4-4" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 19h14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>
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
        padding: '7px 12px',
        border: '1px solid rgba(212,175,55,0.65)',
        borderRadius: '14px',
        background: 'rgba(15,16,19,0.92)',
        backdropFilter: 'blur(8px)',
        color: '#F5E1A4',
        font: '600 12px/1 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif',
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(0,0,0,0.42)',
        whiteSpace: 'nowrap',
      });

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = el.getBoundingClientRect();
        triggerDownloadPicker(overlayTarget, rect);
      };

      const closeBtn = el.querySelector('.dk-close-btn');
      Object.assign(closeBtn.style, {
        width: '25px',
        height: '25px',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '9999px',
        background: 'rgba(15,16,19,0.78)',
        color: '#CBD5E1',
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
      const w = el.offsetWidth || 152;
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

    function cleanPageTitle(fallback) {
      let t = (document.title || '').replace(/[\\\\/:*?"<>|]/g, '_').trim();
      t = t.replace(/\\s*[-|_–—]\\s*(抖音|小红书|YouTube|哔哩哔哩)[^-]*$/i, '').trim();
      if (!t) t = fallback || 'video_' + Date.now();
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

    function triggerDownloadPicker(video, anchorRect) {
      const host = location.hostname.replace(/^www\\./, '');
      const title = cleanPageTitle('video');
      const vHeight = (video && video.videoHeight) || 0;
      const vWidth = (video && video.videoWidth) || 0;
      const vDuration = (video && Number.isFinite(video.duration) && video.duration > 0) ? video.duration : null;

      // 1) Douyin: pass extracted multi-bitrate variants (1080p/720p/540p + exact MB sizes)
      if (/(^|\\.)douyin\\.com$/i.test(location.hostname)) {
        if (/(^|\\.)live\\.douyin\\.com$/i.test(location.hostname)) {
          showToast('抖音直播暂不支持下载，请打开具体视频作品', 'error');
          return;
        }
        const id = douyinAwemeId(video);
        const variants = (id && douyinVariantMap[id]) || [];
        if (variants.length) {
          openQualityPicker({
            url: variants[0].url,
            kind: 'http',
            title,
            referer: location.origin + '/',
            duration: vDuration,
            variants,
          }, anchorRect);
          return;
        }
        if (id && douyinPlayMap[id] && douyinPlayMap[id].length) {
          openQualityPicker({
            url: douyinPlayMap[id][0],
            kind: 'http',
            title,
            referer: location.origin + '/',
            height: vHeight,
            width: vWidth,
            duration: vDuration,
          }, anchorRect);
          return;
        }
        chrome.runtime.sendMessage({ type: 'getSniffed' }, (resp) => {
          const list = (resp && resp.items) || [];
          const vids = list.filter((r) => /(douyinvod|zjcdn|douyincdn)/i.test(r.url) && !/\\.mp3/i.test(r.url));
          const pick = vids[vids.length - 1];
          if (pick) {
            openQualityPicker({
              url: pick.url,
              kind: 'http',
              title,
              referer: location.origin + '/',
              height: vHeight,
              width: vWidth,
              duration: vDuration,
            }, anchorRect);
          } else {
            openQualityPicker({
              url: location.href,
              kind: 'video-platform',
              title,
              referer: location.href,
              duration: vDuration,
            }, anchorRect);
          }
        });
        return;
      }

      // 2) Xiaohongshu: pass extracted multi-quality streams or probe via desktop engine
      if (/(^|\\.)xiaohongshu\\.com$/i.test(location.hostname)) {
        if (xhsVariants.length) {
          openQualityPicker({
            url: xhsVariants[0].url,
            kind: 'http',
            title,
            referer: location.href,
            duration: vDuration,
            variants: xhsVariants,
          }, anchorRect);
          return;
        }
        const src = (video && (video.currentSrc || video.src)) || '';
        if (src && /^https?:/i.test(src)) {
          openQualityPicker({
            url: src,
            kind: 'http',
            title,
            referer: location.href,
            height: vHeight,
            width: vWidth,
            duration: vDuration,
          }, anchorRect);
          return;
        }
        openQualityPicker({
          url: location.href,
          kind: 'video-platform',
          title,
          referer: location.href,
          duration: vDuration,
        }, anchorRect);
        return;
      }

      // 3) Major video platforms (YouTube, Bilibili, TikTok, X, Vimeo, Twitch, Reddit, Instagram, Kuaishou, Weibo...)
      if (/(youtube\\.com|youtu\\.be|x\\.com|twitter\\.com|tiktok\\.com|reddit\\.com|bilibili\\.com|b23\\.tv|vimeo\\.com|twitch\\.tv|instagram\\.com|facebook\\.com|kuaishou\\.com|weibo\\.com|dailymotion\\.com|youku\\.com|v\\.qq\\.com|iqiyi\\.com)/i.test(host)) {
        const postUrl = resolvePostUrl(video);
        openQualityPicker({
          url: postUrl,
          kind: 'video-platform',
          title,
          referer: postUrl,
          duration: vDuration,
        }, anchorRect);
        return;
      }

      // 4) Any other site: prefer sniffed m3u8 / mpd / mp4, else video.src or page URL
      chrome.runtime.sendMessage({ type: 'getSniffed' }, (resp) => {
        const list = (resp && resp.items) || [];
        const pick =
          list.find((r) => /\\.(m3u8|mpd)/i.test(r.url) || r.kind === 'hls' || r.kind === 'dash') ||
          list.find((r) => /\\.(mp4|mkv|webm|mov)/i.test(r.url));
        if (pick) {
          openQualityPicker({
            url: pick.url,
            kind: pick.kind || 'http',
            title,
            referer: location.href,
            height: vHeight,
            width: vWidth,
            duration: vDuration,
            size: pick.size || null,
          }, anchorRect);
        } else {
          const src = (video && (video.currentSrc || video.src)) || location.href;
          openQualityPicker({
            url: src.startsWith('blob:') ? location.href : src,
            kind: src.startsWith('blob:') ? 'video-platform' : 'http',
            title,
            referer: location.href,
            height: vHeight,
            width: vWidth,
            duration: vDuration,
          }, anchorRect);
        }
      });
    }

    // Listen for context menu "OPEN_QUALITY_PICKER"
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg && msg.type === 'OPEN_QUALITY_PICKER') {
        const target = overlayTarget || [...document.querySelectorAll('video')].find(isDownloadableVideo) || null;
        if (msg.item && msg.item.url) {
          openQualityPicker(msg.item, target ? target.getBoundingClientRect() : null);
        } else {
          triggerDownloadPicker(target, target ? target.getBoundingClientRect() : null);
        }
        reply && reply({ ok: true });
        return true;
      }
    });

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
// JoelDeskPro MV3 Service Worker (Desktop Client Bridge Only):
// - Network resource sniffer (webRequest) + Toolbar Badge
// - Universal quality & file-size probe -> POST http://127.0.0.1:${port}/api/bridge/probe
// - Silent background download dispatch -> POST ${endpoint} (NEVER switches tabs or steals focus)
// - Live browser Cookies extraction (YouTube / Douyin / Xiaohongshu / Bilibili / X...)
const DESKKIT_ENDPOINT = '${endpoint}';
const DESKKIT_PROBE_URL = 'http://127.0.0.1:${port}/api/bridge/probe';
const DESKKIT_HEALTH_URL = 'http://127.0.0.1:${port}/api/health';
const DESKKIT_TOKEN = '${token}';

const VIDEO_PLATFORMS = /(^|\\.)(youtube\\.com|youtu\\.be|twitter\\.com|x\\.com|reddit\\.com|tiktok\\.com|vimeo\\.com|bilibili\\.com|b23\\.tv|facebook\\.com|instagram\\.com|twitch\\.tv|xiaohongshu\\.com|xhslink\\.com|kuaishou\\.com|weibo\\.com|dailymotion\\.com|youku\\.com|v\\.qq\\.com|iqiyi\\.com)$/i;
const COOKIE_HOSTS = /(^|\\.)(youtube\\.com|youtu\\.be|douyin\\.com|iesdouyin\\.com|xiaohongshu\\.com|xhslink\\.com|bilibili\\.com|b23\\.tv|x\\.com|twitter\\.com|instagram\\.com|facebook\\.com|weibo\\.com|kuaishou\\.com|tiktok\\.com|vimeo\\.com|twitch\\.tv)$/i;
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
  categories: { video: true, audio: true, archive: true, program: true, document: true, model: true, other: true },
  customExt: [],
  minSize: 0,
  blacklist: [],
};

let extSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
const tabResources = new Map();
const tabInfo = new Map();
const selfDownloadIds = new Set();
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
    if (/xiaohongshu\\.com$/i.test(u.hostname)) return /\\/explore\\/|\\/discovery\\/item\\//.test(p);
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
    chrome.action.setBadgeBackgroundColor({ color: '#C89B2B' });
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
      tag: '可选画质',
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
  if (r.categories) extSettings.categories = Object.assign({}, DEFAULT_SETTINGS.categories, r.categories);
  if (Array.isArray(r.customExt)) extSettings.customExt = r.customExt;
  if (typeof r.minSize === 'number') extSettings.minSize = r.minSize;
  if (Array.isArray(r.blacklist)) extSettings.blacklist = r.blacklist;
}

chrome.storage.local.get(['takeover', 'categories', 'customExt', 'minSize', 'blacklist'], applyStored);
chrome.storage.onChanged.addListener((ch) => {
  const patch = {};
  for (const k of ['takeover', 'categories', 'customExt', 'minSize', 'blacklist']) {
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
    chrome.contextMenus.create({ id: 'deskkit-dl', title: '使用 JoelDeskPro 后台下载此链接', contexts: ['link', 'video', 'audio'] });
    chrome.contextMenus.create({ id: 'deskkit-video', title: '使用 JoelDeskPro 选择画质下载当前视频', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'deskkit-all', title: '批量后台下载本页嗅探资源', contexts: ['page', 'action'] });
  });
}
chrome.runtime.onInstalled.addListener(createMenus);
createMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'deskkit-dl') {
    const url = info.linkUrl || info.srcUrl;
    if (url && tab && tab.id >= 0) {
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'OPEN_QUALITY_PICKER', item: { url, title: filenameFromUrl(url), kind: 'http', referer: tab.url || '' } },
        () => {
          if (chrome.runtime.lastError) {
            sendToDeskKit([{ url, filename: filenameFromUrl(url), referer: tab.url || '' }]);
          }
        }
      );
    } else if (url) {
      sendToDeskKit([{ url, filename: filenameFromUrl(url), referer: tab?.url || '' }]);
    }
  } else if (info.menuItemId === 'deskkit-video' && tab && tab.id >= 0) {
    chrome.tabs.sendMessage(tab.id, { type: 'OPEN_QUALITY_PICKER' }, () => {
      if (chrome.runtime.lastError && tab.url) {
        sendToDeskKit([{ url: tab.url, filename: sanitize(tab.title || 'video') + '.mp4', kind: 'video-platform', referer: tab.url }]);
      }
    });
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
  if (msg.type === 'getBridgeStatus') {
    checkLocalStatus().then((st) => {
      reply && reply(st);
    });
    return true;
  }
  if (msg.type === 'probe') {
    probeMedia(msg.item || {}).then((result) => {
      reply && reply(result);
    });
    return true;
  }
  if (msg.type === 'send') {
    sendToDeskKit(msg.items || []).then((result) => {
      reply && reply(result);
    });
    return true;
  }
  if (msg.type === 'clear') {
    tabResources.delete(msg.tabId);
    updateBadge(msg.tabId);
    reply && reply({ ok: true });
    return true;
  }
});

async function checkLocalStatus() {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 900);
    const res = await fetch(DESKKIT_HEALTH_URL, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return { localOnline: false, saveDir: '' };
    const data = await res.json().catch(() => ({}));
    return { localOnline: true, saveDir: data.saveDir || '' };
  } catch (e) {
    return { localOnline: false, saveDir: '' };
  }
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
        resolve([...map.values()].map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          expirationDate: c.expirationDate,
        })));
      });
    });
  });
}

async function attachCookiesIfNeeded(url, referer) {
  const target = referer && COOKIE_HOSTS.test((() => { try { return new URL(referer).hostname; } catch { return ''; } })())
    ? referer
    : url;
  try {
    const host = new URL(target).hostname;
    if (COOKIE_HOSTS.test(host)) {
      const cks = await getCookiesForUrl(target);
      if (cks && cks.length) return cks;
    }
  } catch (e) {}
  return null;
}

async function probeMedia(item) {
  const url = item && item.url ? String(item.url) : '';
  if (!url) return { ok: false, clientOnline: false, error: 'Missing URL' };
  const cookies = await attachCookiesIfNeeded(url, item.referer || '');
  const body = {
    url,
    title: item.title || item.filename || item.fileName || '',
    kind: item.kind || 'http',
    referer: item.referer || '',
    height: item.height || 0,
    width: item.width || 0,
    duration: item.duration || null,
    size: item.size || null,
    variants: Array.isArray(item.variants) ? item.variants : undefined,
    cookies: cookies || undefined,
  };

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 24000);
    const res = await fetch(DESKKIT_PROBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DeskKit-Token': DESKKIT_TOKEN,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, clientOnline: true, error: 'HTTP ' + res.status };
    const data = await res.json();
    return { ...data, clientOnline: true };
  } catch (e) {
    return { ok: false, clientOnline: false, error: 'Client offline' };
  }
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
        formatId: it.formatId || '',
        qualityLabel: it.qualityLabel || '',
        audioOnly: Boolean(it.audioOnly),
        ext: it.ext || '',
      };
      const cks = await attachCookiesIfNeeded(it.url, it.referer || '');
      if (cks && cks.length) {
        o.cookies = cks;
        o.hasCookies = true;
      }
      return o;
    })
  );

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2000);
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
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const label = payload.length === 1
        ? (payload[0].qualityLabel ? '[' + payload[0].qualityLabel + '] ' : '') + payload[0].fileName
        : payload.length + ' 个资源';
      notify('已开始后台下载（不跳转页面）', label);
      return { ok: true, clientOnline: true, count: payload.length, saveDir: data.saveDir || '' };
    }
  } catch (e) {}

  notify('未检测到 Joel Desk Pro 客户端', '请先打开 Joel Desk Pro 桌面客户端（端口 ${port}）');
  return { ok: false, clientOnline: false, count: 0 };
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
  body { width: 372px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 12px; background: #111215; color: #F8FAFC; }
  .head { display: flex; align-items: center; gap: 8px; padding: 11px 14px; background: linear-gradient(135deg, #17181C 0%, #0D0E10 100%); border-bottom: 1px solid rgba(255,255,255,0.08); }
  .logo { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg, #F3D98B 0%, #C89B2B 100%); color: #0B0B0D; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .head h1 { font-size: 13.5px; font-weight: 700; margin: 0; flex: 1; color: #F5E1A4; }
  .head button { background: rgba(255,255,255,0.07); border: none; color: #CBD5E1; padding: 5px 10px; border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 500; }
  .head button:hover { background: rgba(255,255,255,0.14); color: #fff; }
  .bridge-bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 7px 14px; background: #0D0E10; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: #94A3B8; }
  .bridge-status { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 9999px; background: #64748B; flex-shrink: 0; }
  .dot.on { background: #22C55E; }
  .port-tag { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; color: #64748B; flex-shrink: 0; }
  .takeover-row { display: flex; align-items: center; gap: 8px; padding: 9px 14px; background: #14161A; border-bottom: 1px solid rgba(255,255,255,0.06); color: #CBD5E1; }
  .takeover-row input { width: 14px; height: 14px; accent-color: #D4AF37; cursor: pointer; }
  .takeover-row label { flex: 1; cursor: pointer; font-size: 11.5px; }
  .gear { background: rgba(255,255,255,0.07); border: none; cursor: pointer; font-size: 12px; padding: 4px 8px; color: #CBD5E1; border-radius: 8px; }
  .gear:hover { background: rgba(255,255,255,0.14); color: #fff; }
  .settings { display: none; padding: 11px 14px; background: #0F1013; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .settings.open { display: block; }
  .settings h2 { font-size: 11px; color: #94A3B8; margin: 0 0 8px; font-weight: 600; }
  .cats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-bottom: 10px; }
  .cats label { display: flex; align-items: center; gap: 6px; font-size: 11.5px; cursor: pointer; color: #E2E8F0; }
  .cats input { accent-color: #D4AF37; }
  .custom-row { margin-bottom: 8px; }
  .custom-row label { display: block; font-size: 11px; color: #94A3B8; margin-bottom: 4px; }
  .custom-row input, .custom-row textarea { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; font-size: 11.5px; background: #181A1F; color: #F8FAFC; }
  .size-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; color: #94A3B8; }
  .size-row input { width: 54px; padding: 4px 6px; border: 1px solid rgba(255,255,255,0.12); border-radius: 7px; font-size: 11.5px; background: #181A1F; color: #F8FAFC; }
  .saved { font-size: 11px; color: #4ADE80; height: 14px; }
  .list { max-height: 280px; overflow-y: auto; }
  .item { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); background: #111215; }
  .item:hover { background: #181A20; }
  .item input { accent-color: #D4AF37; }
  .meta { flex: 1; min-width: 0; cursor: pointer; }
  .fn { font-weight: 600; color: #F1F5F9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { color: #94A3B8; font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .pick-btn { border: 1px solid rgba(212,175,55,0.45); background: rgba(212,175,55,0.14); color: #F5E1A4; font-size: 11px; font-weight: 600; padding: 4px 9px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
  .pick-btn:hover { background: #D4AF37; color: #0B0B0D; }
  .empty { padding: 26px 16px; text-align: center; color: #94A3B8; line-height: 1.6; }
  .foot { display: flex; gap: 8px; padding: 11px 14px; background: #0D0E10; border-top: 1px solid rgba(255,255,255,0.07); }
  .foot button { flex: 1; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; background: #181A1F; color: #E2E8F0; cursor: pointer; font-weight: 600; font-size: 12px; }
  .foot button:hover { background: #22252C; }
  .foot button.primary { background: linear-gradient(135deg, #F3D98B 0%, #C89B2B 100%); color: #0B0B0D; border-color: transparent; font-weight: 700; }
  .foot button.primary:hover { opacity: 0.92; }
  .status-banner { display: none; padding: 8px 14px; font-size: 11.5px; font-weight: 600; background: rgba(22,163,74,0.16); color: #86EFAC; border-bottom: 1px solid rgba(22,163,74,0.3); }
  .status-banner.err { background: rgba(239,68,68,0.16); color: #FCA5A5; border-bottom-color: rgba(239,68,68,0.3); }
  /* Inline Quality Picker View */
  .picker { display: none; flex-direction: column; }
  .picker.open { display: flex; }
  .picker-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #15171C; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .back-btn { border: none; background: rgba(255,255,255,0.08); color: #E2E8F0; border-radius: 7px; padding: 4px 8px; cursor: pointer; font-size: 11px; }
  .back-btn:hover { background: rgba(255,255,255,0.15); }
  .picker-title { flex: 1; min-width: 0; font-weight: 600; color: #F8FAFC; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .picker-plat { font-size: 10px; padding: 2px 6px; border-radius: 6px; background: rgba(212,175,55,0.16); color: #E5C466; font-weight: 600; }
  .q-list { max-height: 240px; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; }
  .q-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); cursor: pointer; }
  .q-row:hover { border-color: rgba(212,175,55,0.45); background: rgba(212,175,55,0.1); }
  .q-label { font-weight: 700; color: #F8FAFC; font-size: 12.5px; }
  .q-note { font-size: 10px; color: #94A3B8; background: rgba(255,255,255,0.07); padding: 1px 6px; border-radius: 5px; }
  .q-size { margin-left: auto; font-weight: 600; color: #E5C466; font-variant-numeric: tabular-nums; font-size: 11.5px; }
  .q-dl { border: none; border-radius: 7px; padding: 4px 9px; background: linear-gradient(135deg, #F3D98B 0%, #C89B2B 100%); color: #0B0B0D; font-weight: 700; font-size: 11px; cursor: pointer; }
  .q-msg { padding: 22px 14px; text-align: center; color: #94A3B8; font-size: 12px; }
  .picker-foot { padding: 8px 14px 10px; font-size: 10.5px; color: #94A3B8; background: #0D0E10; border-top: 1px solid rgba(255,255,255,0.07); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
</head>
<body>
  <div class="head">
    <div class="logo">J</div>
    <h1>JoelDeskPro</h1>
    <button id="clear">清空</button>
  </div>
  <div class="bridge-bar">
    <div class="bridge-status">
      <i id="dotLocal" class="dot"></i>
      <span id="clientText">正在检测桌面客户端…</span>
    </div>
    <span class="port-tag">127.0.0.1:${port}</span>
  </div>
  <div id="statusBanner" class="status-banner"></div>
  <div id="mainView">
    <div class="takeover-row">
      <input type="checkbox" id="takeover" checked>
      <label for="takeover">接管浏览器下载（后台分片提速，不跳转）</label>
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
      <button id="send" class="primary">后台下载所选</button>
    </div>
  </div>
  <div id="pickerView" class="picker">
    <div class="picker-head">
      <button id="pickerBack" class="back-btn">← 返回</button>
      <div id="pickerTitle" class="picker-title">解析画质中…</div>
      <span id="pickerPlat" class="picker-plat">检测中</span>
    </div>
    <div id="qList" class="q-list"></div>
    <div id="pickerFoot" class="picker-foot">后台静默下载，不会跳转页面</div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
`;

  const popupJs = `'use strict';
function fmtSize(b, est) {
  if (!b || !Number.isFinite(b) || b <= 0) return '大小未知';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (est ? '约 ' : '') + n.toFixed(i >= 2 ? 1 : 0) + ' ' + u[i];
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let resources = [];
let tabId = null;
let clientSaveDir = '';
const selection = new Map();
const listEl = document.getElementById('list');
const mainView = document.getElementById('mainView');
const pickerView = document.getElementById('pickerView');
const pickerTitle = document.getElementById('pickerTitle');
const pickerPlat = document.getElementById('pickerPlat');
const qList = document.getElementById('qList');
const pickerFoot = document.getElementById('pickerFoot');
const statusBanner = document.getElementById('statusBanner');

function showBanner(msg, isErr) {
  statusBanner.textContent = msg;
  statusBanner.className = 'status-banner' + (isErr ? ' err' : '');
  statusBanner.style.display = 'block';
}

function sig(list) { return list.map((r) => r.url).join('|'); }

function openInlinePicker(res) {
  mainView.style.display = 'none';
  pickerView.classList.add('open');
  pickerTitle.textContent = res.filename || '解析中…';
  pickerPlat.textContent = '解析中';
  qList.innerHTML = '<div class="q-msg">正在解析该视频支持的画质与文件大小…</div>';
  pickerFoot.textContent = clientSaveDir ? '保存至: ' + clientSaveDir + ' · 后台下载不跳转' : '后台静默下载，不会跳转页面';

  chrome.runtime.sendMessage({
    type: 'probe',
    item: {
      url: res.url,
      title: (res.filename || '').replace(/\\.[a-z0-9]{2,5}$/i, ''),
      kind: res.kind || 'http',
      referer: res.referer || '',
      size: res.size || null,
    },
  }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.clientOnline) {
      pickerPlat.textContent = '未连接';
      qList.innerHTML = '<div class="q-msg">未检测到 Joel Desk Pro 客户端（127.0.0.1:${port}），请先启动客户端。</div>';
      return;
    }
    const title = resp.title || res.filename || 'video';
    pickerTitle.textContent = title;
    pickerPlat.textContent = resp.platform || 'Video';
    if (resp.saveDir) pickerFoot.textContent = '保存至: ' + resp.saveDir + ' · 后台下载不跳转';
    const formats = Array.isArray(resp.formats) ? resp.formats : [];
    if (!formats.length) {
      qList.innerHTML = '<div class="q-msg">未能解析出可用画质。</div>';
      return;
    }
    qList.innerHTML = '';
    formats.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'q-row';
      row.innerHTML = \`
        <span class="q-label">\${esc(f.label)}</span>
        \${f.note ? '<span class="q-note">' + esc(f.note) + '</span>' : ''}
        <span class="q-size">\${esc(fmtSize(f.sizeBytes, f.estimated))}</span>
        <button type="button" class="q-dl">下载</button>
      \`;
      const trigger = () => {
        const cleanTitle = title.replace(/[\\\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'video';
        const ext = f.ext || (f.audioOnly ? 'mp3' : 'mp4');
        chrome.runtime.sendMessage({
          type: 'send',
          items: [{
            url: f.url || res.url,
            kind: f.kind || res.kind || 'http',
            filename: cleanTitle + '.' + ext,
            referer: res.referer || '',
            formatId: f.formatId || '',
            qualityLabel: f.label || '',
            audioOnly: Boolean(f.audioOnly),
            ext,
            size: f.sizeBytes || null,
          }],
        }, (sendResp) => {
          if (sendResp && sendResp.ok) {
            showBanner('✓ 已开始后台下载：' + f.label + '（无需跳转页面）', false);
            setTimeout(() => window.close(), 1200);
          } else {
            showBanner('未检测到桌面客户端，请先启动 Joel Desk Pro', true);
          }
        });
      };
      row.onclick = trigger;
      row.querySelector('.q-dl').onclick = (e) => { e.stopPropagation(); trigger(); };
      qList.appendChild(row);
    });
  });
}

function draw() {
  listEl.innerHTML = '';
  if (!resources.length) {
    listEl.innerHTML = '<div class="empty">当前页面暂未嗅探到资源。<br>播放视频或悬停视频右上角即可弹出画质选择小窗。</div>';
    return;
  }
  resources.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'item';
    const checked = selection.get(r.url) ? 'checked' : '';
    const isMedia = r.kind === 'video-platform' || r.kind === 'hls' || r.kind === 'dash' || /视频|画质/.test(r.tag || '');
    div.innerHTML = \`
      <input type="checkbox" data-url="\${encodeURIComponent(r.url)}" \${checked}>
      <div class="meta">
        <div class="fn" title="\${esc(r.filename)}">\${esc(r.filename)}</div>
        <div class="sub" title="\${esc(r.url)}">\${r.size ? fmtSize(r.size) + ' · ' : ''}\${esc(r.tag || '文件')}</div>
      </div>
      <button type="button" class="pick-btn">\${isMedia ? '选画质' : '下载'}</button>\`;
    div.querySelector('.meta').onclick = () => openInlinePicker(r);
    div.querySelector('.pick-btn').onclick = () => openInlinePicker(r);
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

  document.getElementById('pickerBack').onclick = () => {
    pickerView.classList.remove('open');
    mainView.style.display = 'block';
  };

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
    // If user selected 1 video item, open quality picker directly!
    if (items.length === 1 && (items[0].kind === 'video-platform' || items[0].kind === 'hls' || items[0].kind === 'dash')) {
      openInlinePicker(items[0]);
      return;
    }
    chrome.runtime.sendMessage({ type: 'send', items }, (resp) => {
      if (resp && resp.ok) {
        showBanner('✓ 已将 ' + items.length + ' 个任务加入后台下载', false);
        setTimeout(() => window.close(), 1100);
      } else {
        showBanner('未检测到桌面客户端，请先打开 Joel Desk Pro', true);
      }
    });
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
  const dotLocalEl = document.getElementById('dotLocal');
  const clientTextEl = document.getElementById('clientText');

  chrome.runtime.sendMessage({ type: 'getBridgeStatus' }, (st) => {
    if (st && st.localOnline) {
      dotLocalEl.classList.add('on');
      clientSaveDir = st.saveDir || '';
      clientTextEl.textContent = '桌面客户端已连接（后台静默下载）';
    } else {
      clientTextEl.textContent = '未检测到桌面客户端（请先打开）';
    }
  });

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
    chrome.storage.local.set({ takeover: tk.checked, categories, customExt, minSize, blacklist }, () => {
      savedEl.textContent = '✓ 已保存';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { savedEl.textContent = ''; }, 1200);
    });
  }

  chrome.storage.local.get(['takeover','categories','customExt','minSize','blacklist'], (r) => {
    tk.checked = typeof r.takeover === 'boolean' ? r.takeover : DEFAULTS.takeover;
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

  const readmeTxt = `JoelDeskPro Chrome 插件（配合 Joel Desk Pro 桌面客户端使用）
============================================================
1. 右键 joeldeskpro-chrome-extension.zip -> 全部解压缩到任意文件夹（如 Downloads\\joeldeskpro-chrome-extension）。
   注意：manifest.json 就在解压后的第一层目录里，无需再往里点一层！
2. 在 Chrome 地址栏打开：chrome://extensions
3. 打开右上角「开发者模式」。
4. 点击左上角「加载已解压的扩展程序」，选择解压出来的文件夹即可成功安装！
5. 打开 Joel Desk Pro 桌面客户端（默认监听 127.0.0.1:${port}），刷视频或下载大文件时会自动分片提速并保存到 Chrome 默认下载目录（或你在客户端里选择的目录）。
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
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const PORT = ${port};
const TOKEN = ${JSON.stringify(token)};
let DEFAULT_SAVE_DIR = ${JSON.stringify(defaultSaveDir)}.startsWith('~')
  ? path.join(os.homedir(), ${JSON.stringify(defaultSaveDir)}.slice(1))
  : ${JSON.stringify(defaultSaveDir)};

const tasks = new Map();

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
  const safeRepo = (repo || 'joelting02-sys/JoelDeskPro').replace(/[^A-Za-z0-9_.-/]/g, '');
  const safeBranch = (branch || 'main').replace(/[^A-Za-z0-9_.-/]/g, '');
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

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  logs.push('> npm install');
  const inst = await execFileAsync(npmCmd, ['install'], { cwd: projectDir, timeout: 180000 });
  if (inst.stdout) logs.push(inst.stdout.trim().slice(-400));

  logs.push('> npm run build');
  const build = await execFileAsync(npmCmd, ['run', 'build'], { cwd: projectDir, timeout: 180000 });
  if (build.stdout) logs.push(build.stdout.trim().slice(-400));

  const shaRes = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, timeout: 15000 });
  const updatedSha = (shaRes.stdout || '').trim();
  console.log('[Joel Desk Pro] 已拉取最新 GitHub 版本:', updatedSha.slice(0, 7));
  return { ok: true, updatedSha, message: '已成功拉取最新代码并完成构建（' + updatedSha.slice(0, 7) + '）', log: logs.filter(Boolean).join('\\n') };
}

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

const COLAB_MCP_URL = 'https://colab.googleapis.com/mcp';
const COLAB_T4_DIR = process.env.COLAB_T4_DIR || path.join(os.homedir(), '.joeldeskpro', 'colab');
const KAGGLE_CONFIG_PATH = process.env.KAGGLE_CONFIG_DIR
  ? path.join(process.env.KAGGLE_CONFIG_DIR, 'kaggle.json')
  : path.join(os.homedir(), '.kaggle', 'kaggle.json');
const SETTINGS_FILE = path.join(os.homedir(), '.joeldeskpro', 'compute-settings.json');
const COLAB_GATEWAY_URL = (process.env.COLAB_GATEWAY_URL || '').replace(/\\/+$/, '');
const COLAB_GATEWAY_TOKEN = process.env.COLAB_GATEWAY_TOKEN || '';
const COLAB_ADMIN_TOKEN = process.env.COLAB_ADMIN_TOKEN || '';

const computeSettings = {
  auto_shutdown_enabled: false,
  auto_shutdown_minutes: 15,
};

const computeState = {
  status: 'offline',
  provider: 'colab-t4',
  gpu: 'T4',
  model: 'faster-whisper-medium',
  started_at: null,
  last_activity_at: null,
  orphan_colab_count: 0,
  endpoint: null,
  error: null,
};

async function loadComputeSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.auto_shutdown_enabled === 'boolean') {
      computeSettings.auto_shutdown_enabled = parsed.auto_shutdown_enabled;
    }
    if ([10, 15, 30].includes(Number(parsed.auto_shutdown_minutes))) {
      computeSettings.auto_shutdown_minutes = Number(parsed.auto_shutdown_minutes);
    }
  } catch {}
}

async function saveComputeSettings() {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(computeSettings, null, 2), 'utf8');
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function hasColabAuth() {
  const tok = await readJsonSafe(path.join(COLAB_T4_DIR, 'token.json'));
  return Boolean(tok && (tok.access_token || tok.refresh_token));
}

async function hasKaggleAuth() {
  const k = await readJsonSafe(KAGGLE_CONFIG_PATH);
  return Boolean(k && k.username && k.key);
}

async function refreshColabAccessToken() {
  const secretRaw = await readJsonSafe(path.join(COLAB_T4_DIR, 'client_secret.json'));
  const tokenRaw = await readJsonSafe(path.join(COLAB_T4_DIR, 'token.json'));
  const client = secretRaw?.installed || secretRaw?.web || secretRaw;
  if (!client?.client_id || !client?.client_secret || !tokenRaw?.refresh_token) return null;

  const form = new URLSearchParams({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: tokenRaw.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) return null;
  const refreshed = await res.json();
  const next = { ...tokenRaw, ...refreshed, updated_at: Math.floor(Date.now() / 1000) };
  await fs.mkdir(COLAB_T4_DIR, { recursive: true });
  await fs.writeFile(path.join(COLAB_T4_DIR, 'token.json'), JSON.stringify(next, null, 2), 'utf8');
  return next.access_token || null;
}

async function getColabAccessToken() {
  const tokenRaw = await readJsonSafe(path.join(COLAB_T4_DIR, 'token.json'));
  return tokenRaw?.access_token || (await refreshColabAccessToken());
}

async function colabMcpCall(toolName, args = {}, retry = true) {
  const accessToken = await getColabAccessToken();
  if (!accessToken) throw new Error('Colab OAuth token missing');
  const res = await fetch(COLAB_MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  if (res.status === 401 && retry) {
    const renewed = await refreshColabAccessToken();
    if (renewed) return colabMcpCall(toolName, args, false);
  }
  const text = await res.text();
  if (!res.ok) throw new Error('Colab MCP HTTP ' + res.status + ': ' + text.slice(0, 160));
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function probeRemoteHealth(url) {
  if (!url) return false;
  try {
    const res = await fetch(url.replace(/\\/+$/, '') + '/health', { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

function getPendingTaskCount() {
  let count = 0;
  for (const t of tasks.values()) {
    if (t.status === 'downloading' || t.status === 'queued' || t.status === 'running') count++;
  }
  return count;
}

async function buildStateSnapshot() {
  const pending = getPendingTaskCount();
  const nowSec = Math.floor(Date.now() / 1000);
  let idleRemaining = null;
  if (computeState.status === 'online' && computeSettings.auto_shutdown_enabled && pending === 0) {
    const base = computeState.last_activity_at || computeState.started_at || nowSec;
    idleRemaining = Math.max(0, computeSettings.auto_shutdown_minutes * 60 - (nowSec - base));
  }
  return {
    compute: {
      status: computeState.status,
      provider: computeState.provider,
      gpu: computeState.gpu,
      model: computeState.model,
      started_at: computeState.started_at,
      last_activity_at: computeState.last_activity_at,
      idle_remaining_seconds: idleRemaining,
      orphan_colab_count: computeState.orphan_colab_count,
      colab_authed: await hasColabAuth(),
      kaggle_authed: await hasKaggleAuth(),
      error: computeState.error,
    },
    settings: { ...computeSettings },
    pending_tasks: pending,
  };
}

async function stopComputeRuntime() {
  computeState.status = 'stopping';
  // 1. Remote graceful /shutdown
  const targetUrl = computeState.endpoint || COLAB_GATEWAY_URL;
  if (targetUrl) {
    try {
      await fetch(targetUrl + '/shutdown', {
        method: 'POST',
        headers: COLAB_GATEWAY_TOKEN ? { Authorization: 'Bearer ' + COLAB_GATEWAY_TOKEN } : {},
      });
    } catch {}
  }
  // 2. Clear Worker /_gateway/clear mapping
  if (COLAB_GATEWAY_URL && COLAB_ADMIN_TOKEN) {
    try {
      await fetch(COLAB_GATEWAY_URL + '/_gateway/clear', {
        method: 'POST',
        headers: { 'X-Admin-Token': COLAB_ADMIN_TOKEN },
      });
    } catch {}
  }
  // 3. Delete all Colab runtimes via MCP
  if (await hasColabAuth()) {
    try {
      const listed = await colabMcpCall('list_runtimes', {});
      const rawStr = JSON.stringify(listed);
      const matches = [...rawStr.matchAll(/m-s-[a-z0-9]+/gi)].map((m) => m[0]);
      for (const endpointId of [...new Set(matches)]) {
        await colabMcpCall('delete_runtime', { endpoint: endpointId }).catch(() => {});
      }
    } catch {}
  }
  computeState.status = 'offline';
  computeState.started_at = null;
  computeState.last_activity_at = null;
  computeState.orphan_colab_count = 0;
  computeState.endpoint = null;
  computeState.error = null;
}

async function refreshComputeRuntime() {
  const targetUrl = computeState.endpoint || COLAB_GATEWAY_URL;
  const healthy = await probeRemoteHealth(targetUrl);
  let colabCount = 0;
  if (await hasColabAuth()) {
    try {
      const listed = await colabMcpCall('list_runtimes', {});
      const matches = [...JSON.stringify(listed).matchAll(/m-s-[a-z0-9]+/gi)].map((m) => m[0]);
      colabCount = new Set(matches).size;
    } catch {}
  }
  if (healthy) {
    computeState.status = 'online';
    computeState.orphan_colab_count = 0;
    if (!computeState.started_at) computeState.started_at = Math.floor(Date.now() / 1000);
  } else {
    if (computeState.status === 'online') computeState.status = 'offline';
    computeState.orphan_colab_count = colabCount;
  }
}

// 12-second queue-aware idle auto-shutdown watchdog
setInterval(async () => {
  if (computeState.status !== 'online' || !computeSettings.auto_shutdown_enabled) return;
  const pending = getPendingTaskCount();
  const nowSec = Math.floor(Date.now() / 1000);
  if (pending > 0) {
    computeState.last_activity_at = nowSec;
    return;
  }
  const base = computeState.last_activity_at || computeState.started_at || nowSec;
  if (nowSec - base >= computeSettings.auto_shutdown_minutes * 60) {
    console.log('[Joel Desk Pro] Idle timeout reached with empty queue -> auto-stopping GPU...');
    await stopComputeRuntime();
  }
}, 12000);

loadComputeSettings();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DeskKit-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const reqUrl = new URL(req.url || '/', 'http://127.0.0.1:' + PORT);

  if (reqUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, saveDir: DEFAULT_SAVE_DIR, tasks: [...tasks.values()] }));
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(await buildStateSnapshot()));
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/compute/auth/colab') {
    const secretRaw = await readJsonSafe(path.join(COLAB_T4_DIR, 'client_secret.json'));
    const client = secretRaw?.installed || secretRaw?.web || secretRaw;
    if (client?.client_id) {
      const redirectUri = 'http://127.0.0.1:' + PORT + '/api/compute/auth/colab/callback';
      const authParams = new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: 'https://www.googleapis.com/auth/colaboratory',
      });
      res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + authParams.toString() });
      res.end();
      return;
    }
    res.writeHead(302, { Location: 'https://colab.research.google.com/' });
    res.end();
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/compute/auth/colab/callback') {
    const code = reqUrl.searchParams.get('code');
    const secretRaw = await readJsonSafe(path.join(COLAB_T4_DIR, 'client_secret.json'));
    const client = secretRaw?.installed || secretRaw?.web || secretRaw;
    if (code && client?.client_id && client?.client_secret) {
      const redirectUri = 'http://127.0.0.1:' + PORT + '/api/compute/auth/colab/callback';
      const form = new URLSearchParams({
        code,
        client_id: client.client_id,
        client_secret: client.client_secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (tokenRes.ok) {
        const tokenJson = await tokenRes.json();
        await fs.mkdir(COLAB_T4_DIR, { recursive: true });
        await fs.writeFile(
          path.join(COLAB_T4_DIR, 'token.json'),
          JSON.stringify({ ...tokenJson, updated_at: Math.floor(Date.now() / 1000) }, null, 2),
          'utf8'
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>Google Colab Connected</h2><p>You can close this tab and return to Joel Desk Pro.</p></body></html>');
        return;
      }
    }
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OAuth callback failed. Check client_secret.json in ' + COLAB_T4_DIR);
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/compute/auth/kaggle') {
    res.writeHead(302, { Location: 'https://www.kaggle.com/account/login' });
    res.end();
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/compute/start') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    const provider = body.provider === 'kaggle' ? 'kaggle-t4' : 'colab-t4';
    const gpu = provider === 'kaggle-t4' ? 'T4 x2' : (['T4', 'L4', 'A100'].includes(body.gpu) ? body.gpu : 'T4');
    const model = body.model || 'faster-whisper-medium';

    const authed = provider === 'kaggle-t4' ? await hasKaggleAuth() : await hasColabAuth();
    if (!authed) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        needs_auth: true,
        auth_url: 'http://127.0.0.1:' + PORT + '/api/compute/auth/' + (provider === 'kaggle-t4' ? 'kaggle' : 'colab'),
      }));
      return;
    }

    computeState.status = 'starting';
    computeState.provider = provider;
    computeState.gpu = gpu;
    computeState.model = model;
    computeState.error = null;

    if (provider === 'colab-t4') {
      (async () => {
        try {
          await colabMcpCall('create_runtime', { variant: 'GPU', accelerator: gpu });
          if (COLAB_GATEWAY_URL && (await probeRemoteHealth(COLAB_GATEWAY_URL))) {
            const nowSec = Math.floor(Date.now() / 1000);
            computeState.status = 'online';
            computeState.started_at = nowSec;
            computeState.last_activity_at = nowSec;
            computeState.endpoint = COLAB_GATEWAY_URL;
          } else {
            computeState.status = 'error';
            computeState.error = 'Runtime created; configure COLAB_GATEWAY_URL for /health verification.';
          }
        } catch (err) {
          computeState.status = 'error';
          computeState.error = err.message || 'Failed to start Colab runtime';
        }
      })();
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...(await buildStateSnapshot()) }));
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/compute/stop') {
    await stopComputeRuntime();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(await buildStateSnapshot()));
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/compute/refresh') {
    await refreshComputeRuntime();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(await buildStateSnapshot()));
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/settings') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      if (typeof body.auto_shutdown_enabled === 'boolean') {
        computeSettings.auto_shutdown_enabled = body.auto_shutdown_enabled;
      }
      if ([10, 15, 30].includes(Number(body.auto_shutdown_minutes))) {
        computeSettings.auto_shutdown_minutes = Number(body.auto_shutdown_minutes);
      }
      await saveComputeSettings();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(await buildStateSnapshot()));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && (reqUrl.pathname === '/api/bridge/capture' || reqUrl.pathname === '/api/download')) {
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

  if (req.method === 'POST' && reqUrl.pathname === '/api/update') {
    const reqToken = req.headers['x-deskkit-token'];
    if (TOKEN && reqToken && reqToken !== TOKEN) {
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
      res.end(JSON.stringify({ ok: false, error: e.message || 'Update failed', log: (e.stderr || e.stdout || '').toString() }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(\`[Joel Desk Pro] 本地多线程下载与算力引擎已启动: http://127.0.0.1:\${PORT}\`);
  console.log(\`[Joel Desk Pro] 默认保存目录: \${DEFAULT_SAVE_DIR}\`);
});
`;
}
