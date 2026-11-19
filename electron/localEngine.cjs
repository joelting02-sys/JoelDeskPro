// Built-in local multi-chunk Range downloader & Colab/Kaggle compute engine for Joel Desk Pro Desktop (.exe).
// Zero external npm dependencies (uses Node.js 20+ built-in fetch).
const http = require('node:http');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

/**
 * Detects Chrome's currently configured default download directory on the user's machine.
 * Falls back cleanly to the OS Downloads folder (~/Downloads) if Chrome Preferences has no custom path.
 */
function detectChromeDefaultDownloadDir() {
  const candidates = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    candidates.push(
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Preferences'),
      path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Preferences')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Preferences')
    );
  } else {
    candidates.push(
      path.join(os.homedir(), '.config', 'google-chrome', 'Default', 'Preferences'),
      path.join(os.homedir(), '.config', 'chromium', 'Default', 'Preferences')
    );
  }

  for (const prefPath of candidates) {
    try {
      if (!fsSync.existsSync(prefPath)) continue;
      const raw = fsSync.readFileSync(prefPath, 'utf8');
      const prefs = JSON.parse(raw);
      const chromeDir = prefs?.download?.default_directory || prefs?.savefile?.default_directory;
      if (typeof chromeDir === 'string' && chromeDir.trim()) {
        return chromeDir.trim();
      }
    } catch {}
  }

  return path.join(os.homedir(), 'Downloads');
}

function startLocalEngine(options = {}) {
  const PORT = Number(options.port || process.env.JOELDESKPRO_PORT || 17890);
  const TOKEN = options.token || process.env.JOELDESKPRO_TOKEN || 'joeldeskpro-local-bridge';
  const onPickFolder = typeof options.onPickFolder === 'function' ? options.onPickFolder : null;

  const COLAB_MCP_URL = 'https://colab.googleapis.com/mcp';
  const COLAB_T4_DIR = process.env.COLAB_T4_DIR || path.join(os.homedir(), '.joeldeskpro', 'colab');
  const KAGGLE_CONFIG_PATH = process.env.KAGGLE_CONFIG_DIR
    ? path.join(process.env.KAGGLE_CONFIG_DIR, 'kaggle.json')
    : path.join(os.homedir(), '.kaggle', 'kaggle.json');
  const SETTINGS_FILE = path.join(os.homedir(), '.joeldeskpro', 'compute-settings.json');
  const COLAB_GATEWAY_URL = (process.env.COLAB_GATEWAY_URL || '').replace(/\/+$/, '');
  const COLAB_GATEWAY_TOKEN = process.env.COLAB_GATEWAY_TOKEN || '';
  const COLAB_ADMIN_TOKEN = process.env.COLAB_ADMIN_TOKEN || '';

  const tasks = new Map();
  let customSaveDir = '';

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

  function resolveEffectiveSaveDir(requestedDir) {
    const req = typeof requestedDir === 'string' ? requestedDir.trim() : '';
    if (req) {
      return req.startsWith('~') ? path.join(os.homedir(), req.slice(1)) : req;
    }
    if (customSaveDir) {
      return customSaveDir;
    }
    return detectChromeDefaultDownloadDir();
  }

  async function loadComputeSettings() {
    try {
      const parsed = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'));
      if (typeof parsed.auto_shutdown_enabled === 'boolean') {
        computeSettings.auto_shutdown_enabled = parsed.auto_shutdown_enabled;
      }
      if ([10, 15, 30].includes(Number(parsed.auto_shutdown_minutes))) {
        computeSettings.auto_shutdown_minutes = Number(parsed.auto_shutdown_minutes);
      }
      if (typeof parsed.custom_save_dir === 'string') {
        customSaveDir = parsed.custom_save_dir.trim();
      }
    } catch {}
  }

  async function saveComputeSettings() {
    await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    await fs.writeFile(
      SETTINGS_FILE,
      JSON.stringify({ ...computeSettings, custom_save_dir: customSaveDir }, null, 2),
      'utf8'
    );
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
      const res = await fetch(url.replace(/\/+$/, '') + '/health', { method: 'GET' });
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
    const targetUrl = computeState.endpoint || COLAB_GATEWAY_URL;
    if (targetUrl) {
      try {
        await fetch(targetUrl + '/shutdown', {
          method: 'POST',
          headers: COLAB_GATEWAY_TOKEN ? { Authorization: 'Bearer ' + COLAB_GATEWAY_TOKEN } : {},
        });
      } catch {}
    }
    if (COLAB_GATEWAY_URL && COLAB_ADMIN_TOKEN) {
      try {
        await fetch(COLAB_GATEWAY_URL + '/_gateway/clear', {
          method: 'POST',
          headers: { 'X-Admin-Token': COLAB_ADMIN_TOKEN },
        });
      } catch {}
    }
    if (await hasColabAuth()) {
      try {
        const listed = await colabMcpCall('list_runtimes', {});
        const matches = [...JSON.stringify(listed).matchAll(/m-s-[a-z0-9]+/gi)].map((m) => m[0]);
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

  function sanitizeName(name) {
    return (name || 'download.bin').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'download.bin';
  }

  const VIDEO_PLATFORM_RE =
    /(youtube\.com|youtu\.be|bilibili\.com|b23\.tv|tiktok\.com|douyin\.com|iesdouyin\.com|xiaohongshu\.com|xhslink\.com|x\.com|twitter\.com|instagram\.com|facebook\.com|vimeo\.com|twitch\.tv|reddit\.com|weibo\.com|kuaishou\.com|dailymotion\.com|youku\.com|v\.qq\.com|iqiyi\.com)/i;

  function detectPlatformLabel(urlStr) {
    try {
      const h = new URL(urlStr).hostname.toLowerCase();
      if (/youtube\.com|youtu\.be/.test(h)) return 'YouTube';
      if (/douyin\.com|iesdouyin\.com|douyinvod|zjcdn/.test(h)) return '抖音';
      if (/xiaohongshu\.com|xhslink\.com|xhscdn/.test(h)) return '小红书';
      if (/bilibili\.com|b23\.tv/.test(h)) return 'Bilibili';
      if (/tiktok\.com/.test(h)) return 'TikTok';
      if (/(^|\.)(x|twitter)\.com/.test(h)) return 'X / Twitter';
      if (/instagram\.com/.test(h)) return 'Instagram';
      if (/vimeo\.com/.test(h)) return 'Vimeo';
      if (/twitch\.tv/.test(h)) return 'Twitch';
      if (/kuaishou\.com/.test(h)) return '快手';
      if (/weibo\.com/.test(h)) return '微博';
      if (/\.m3u8(\?|$)/i.test(urlStr)) return 'HLS 流媒体';
      return h.replace(/^www\./, '');
    } catch {
      return 'Video';
    }
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
      const val = String(c.value || '').replace(/[\r\n\t]/g, '');
      lines.push(`${domain}\t${includeSub}\t${cpath}\t${secure}\t${expiry}\t${c.name}\t${val}`);
    }
    if (lines.length <= 1) return null;
    const tmpFile = path.join(
      os.tmpdir(),
      `joeldeskpro-ck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.txt`
    );
    await fs.writeFile(tmpFile, lines.join('\n') + '\n', 'utf8');
    return tmpFile;
  }

  function buildCookieHeader(cookies) {
    if (Array.isArray(cookies)) {
      return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    }
    return typeof cookies === 'string' ? cookies : '';
  }

  async function headFileSize(url, headers) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 JoelDeskPro/1.2', ...headers },
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const len = Number(res.headers.get('content-length') || 0);
      return Number.isFinite(len) && len > 0 ? len : null;
    } catch {
      return null;
    }
  }

  async function probeHlsVariants(url, headers, title) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 6500);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 JoelDeskPro/1.2', ...headers },
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const text = await res.text();
      if (!/#EXT-X-STREAM-INF/i.test(text)) return null;

      const lines = text.split(/\r?\n/);
      const variants = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
        const attrs = line.slice('#EXT-X-STREAM-INF:'.length);
        const bwMatch = attrs.match(/BANDWIDTH=(\d+)/i);
        const resMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
        const fpsMatch = attrs.match(/FRAME-RATE=([\d.]+)/i);
        let nextUri = '';
        for (let j = i + 1; j < lines.length; j++) {
          const cand = lines[j].trim();
          if (cand && !cand.startsWith('#')) {
            nextUri = cand;
            break;
          }
        }
        if (!nextUri) continue;
        let absUrl = nextUri;
        try {
          absUrl = new URL(nextUri, url).href;
        } catch {}
        const width = resMatch ? Number(resMatch[1]) : 0;
        const height = resMatch ? Number(resMatch[2]) : 0;
        const bandwidth = bwMatch ? Number(bwMatch[1]) : 0;
        const fps = fpsMatch ? Math.round(Number(fpsMatch[1])) : null;
        variants.push({
          id: 'hls-' + (height || bandwidth || i),
          formatId: '',
          url: absUrl,
          kind: 'hls',
          label: height ? `${height}p` : `${Math.round(bandwidth / 1000)} kbps`,
          height,
          width,
          fps,
          ext: 'mp4',
          sizeBytes: null,
          estimated: true,
          note: bandwidth ? `${(bandwidth / 1000000).toFixed(1)} Mbps` : 'HLS',
        });
      }
      if (!variants.length) return null;
      variants.sort((a, b) => (b.height || 0) - (a.height || 0));
      const dedup = [];
      const seenH = new Set();
      for (const v of variants) {
        const key = v.height || v.label;
        if (seenH.has(key)) continue;
        seenH.add(key);
        dedup.push(v);
      }
      return {
        ok: true,
        title: title || 'HLS Video',
        platform: detectPlatformLabel(url),
        duration: null,
        saveDir: resolveEffectiveSaveDir(''),
        formats: dedup,
      };
    } catch {
      return null;
    }
  }

  function qualityTagForHeight(h) {
    if (h >= 2160) return '2160p (4K)';
    if (h >= 1440) return '1440p (2K)';
    if (h >= 1080) return '1080p HD';
    if (h >= 720) return '720p HD';
    if (h >= 480) return '480p';
    if (h >= 360) return '360p';
    return h ? `${h}p` : '原画';
  }

  function parseYtdlpFormats(info, originalUrl) {
    const duration = Number(info.duration) || 0;
    const rawFormats = Array.isArray(info.formats) ? info.formats : [];

    // Find best audio stream to accurately compute combined sizes for video-only DASH streams
    const audioStreams = rawFormats.filter(
      (f) => f && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
    );
    audioStreams.sort((a, b) => {
      const aM4a = a.ext === 'm4a' ? 1 : 0;
      const bM4a = b.ext === 'm4a' ? 1 : 0;
      if (aM4a !== bM4a) return bM4a - aM4a;
      return (Number(b.abr || b.tbr || 0) || 0) - (Number(a.abr || a.tbr || 0) || 0);
    });
    const bestAudio = audioStreams[0] || null;
    const estimateStreamBytes = (f) => {
      if (!f) return null;
      const exact = Number(f.filesize || f.filesize_approx || 0);
      if (exact > 0) return exact;
      const bitrateKbps = Number(f.tbr || f.vbr || f.abr || 0);
      if (bitrateKbps > 0 && duration > 0) {
        return Math.round((bitrateKbps * 1000 * duration) / 8);
      }
      return null;
    };
    const bestAudioBytes = estimateStreamBytes(bestAudio) || 0;

    // Group video streams by height, preferring mp4 & higher fps/tbr
    const byHeight = new Map();
    for (const f of rawFormats) {
      if (!f || !f.format_id) continue;
      if (f.vcodec === 'none') continue;
      const h = Number(f.height) || 0;
      if (!h && !f.url) continue;
      const hasAudio = Boolean(f.acodec && f.acodec !== 'none');
      const isMp4 = f.ext === 'mp4';
      const fps = Math.round(Number(f.fps) || 0);
      const tbr = Number(f.tbr || f.vbr || 0);
      const vBytes = estimateStreamBytes(f);
      const totalBytes = vBytes != null ? vBytes + (hasAudio ? 0 : bestAudioBytes) : null;
      const isExact = Boolean(f.filesize || f.filesize_approx);

      const score =
        (isMp4 ? 1000 : 0) +
        (hasAudio ? 400 : 0) +
        (fps >= 50 ? 150 : 0) +
        Math.min(tbr, 50000) / 100;

      const key = h || 'best';
      const prev = byHeight.get(key);
      if (!prev || score > prev.score) {
        const formatSelector = hasAudio
          ? String(f.format_id)
          : bestAudio && bestAudio.format_id
            ? `${f.format_id}+${bestAudio.format_id}/${f.format_id}+bestaudio/best`
            : `${f.format_id}+bestaudio/best`;
        byHeight.set(key, {
          score,
          id: String(f.format_id),
          formatId: formatSelector,
          url: originalUrl,
          kind: 'video-platform',
          label: qualityTagForHeight(h),
          height: h,
          width: Number(f.width) || 0,
          fps: fps >= 45 ? fps : null,
          ext: 'mp4',
          sizeBytes: totalBytes,
          estimated: !isExact,
          audioOnly: false,
          note: [fps >= 45 ? `${fps}fps` : '', 'MP4'].filter(Boolean).join(' · '),
        });
      }
    }

    const result = [...byHeight.values()]
      .sort((a, b) => (b.height || 0) - (a.height || 0))
      .map(({ score, ...pub }) => pub);

    // If platform returned only a single direct info without formats array
    if (!result.length && info.url) {
      const h = Number(info.height) || 0;
      const bytes = estimateStreamBytes(info);
      result.push({
        id: String(info.format_id || 'best'),
        formatId: String(info.format_id || 'best'),
        url: originalUrl,
        kind: 'video-platform',
        label: h ? qualityTagForHeight(h) : '原画',
        height: h,
        width: Number(info.width) || 0,
        fps: null,
        ext: info.ext || 'mp4',
        sizeBytes: bytes,
        estimated: !(info.filesize || info.filesize_approx),
        audioOnly: false,
        note: (info.ext || 'mp4').toUpperCase(),
      });
    }

    // Add Audio Only option when audio stream is available
    if (bestAudio || result.length > 0) {
      result.push({
        id: 'audio-only',
        formatId: bestAudio?.format_id ? String(bestAudio.format_id) : 'bestaudio/best',
        url: originalUrl,
        kind: 'video-platform',
        label: '仅音频',
        height: 0,
        width: 0,
        fps: null,
        ext: bestAudio?.ext === 'm4a' ? 'm4a' : 'mp3',
        sizeBytes: bestAudioBytes || (duration > 0 ? Math.round((128 * 1000 * duration) / 8) : null),
        estimated: !(bestAudio && (bestAudio.filesize || bestAudio.filesize_approx)),
        audioOnly: true,
        note: bestAudio?.abr ? `${Math.round(bestAudio.abr)}kbps` : 'M4A / MP3',
      });
    }

    return result;
  }

  async function probeMediaFormats(payload) {
    const url = String(payload.url || '').trim();
    if (!url) throw new Error('Missing url');
    const title = sanitizeName(payload.title || payload.fileName || payload.filename || 'video').replace(/\.(mp4|mkv|webm|mov|m4a|mp3)$/i, '');
    const cookieHeader = buildCookieHeader(payload.cookies);
    const headers = {};
    if (payload.referer) headers.Referer = payload.referer;
    if (cookieHeader) headers.Cookie = cookieHeader;
    const saveDir = resolveEffectiveSaveDir('');

    // 1) If page already extracted multiple direct variants (e.g., Douyin bit_rate / Xiaohongshu streams)
    if (Array.isArray(payload.variants) && payload.variants.length > 0) {
      const probedVariants = await Promise.all(
        payload.variants.slice(0, 8).map(async (v, idx) => {
          const vUrl = v.url || url;
          let sizeBytes = Number(v.sizeBytes || v.size || 0) || null;
          if (!sizeBytes && /^https?:/i.test(vUrl)) {
            sizeBytes = await headFileSize(vUrl, headers);
          }
          const h = Number(v.height) || 0;
          return {
            id: v.id || `var-${idx}`,
            formatId: '',
            url: vUrl,
            kind: 'http',
            label: v.label || (h ? qualityTagForHeight(h) : '原画'),
            height: h,
            width: Number(v.width) || 0,
            fps: v.fps ? Number(v.fps) : null,
            ext: v.ext || 'mp4',
            sizeBytes,
            estimated: false,
            audioOnly: false,
            note: v.note || (v.ext || 'MP4').toUpperCase(),
          };
        })
      );
      probedVariants.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.sizeBytes || 0) - (a.sizeBytes || 0));
      return {
        ok: true,
        title,
        platform: detectPlatformLabel(payload.referer || url),
        duration: payload.duration || null,
        saveDir,
        formats: probedVariants,
      };
    }

    // 2) HLS master playlist (.m3u8) -> parse real resolution variants directly
    if (/\.m3u8(\?|$|#)/i.test(url) || payload.kind === 'hls') {
      const hlsRes = await probeHlsVariants(url, headers, title);
      if (hlsRes) return hlsRes;
    }

    // 3) Direct downloadable HTTP media/file (non-video-platform page) -> fast HEAD size probe
    const isPlatformPage =
      payload.kind === 'video-platform' ||
      (VIDEO_PLATFORM_RE.test(url) && !/\.(mp4|mkv|webm|mov|m4a|mp3|zip|rar|7z|pdf|exe)(\?|$)/i.test(url));

    if (!isPlatformPage && !/\.m3u8|\.mpd/i.test(url)) {
      const bytes = await headFileSize(url, headers);
      const extMatch = /\.([a-z0-9]{2,5})(\?|$)/i.exec(url);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'mp4';
      return {
        ok: true,
        title,
        platform: detectPlatformLabel(payload.referer || url),
        duration: payload.duration || null,
        saveDir,
        formats: [
          {
            id: 'direct-original',
            formatId: '',
            url,
            kind: 'http',
            label: payload.height ? qualityTagForHeight(Number(payload.height)) : '原画直链',
            height: Number(payload.height) || 0,
            width: Number(payload.width) || 0,
            fps: null,
            ext,
            sizeBytes: bytes || Number(payload.size || 0) || null,
            estimated: false,
            audioOnly: false,
            note: ext.toUpperCase(),
          },
        ],
      };
    }

    // 4) Universal video platform probing via yt-dlp -J (YouTube, Bilibili, Douyin, Xiaohongshu, TikTok, X, Vimeo, Twitch, etc.)
    let cookieFile = null;
    try {
      cookieFile = await writeNetscapeCookiesTempFile(payload.cookies);
      const args = ['--dump-single-json', '--no-playlist', '--no-warnings', '--skip-download'];
      if (cookieFile) args.push('--cookies', cookieFile);
      if (payload.referer) args.push('--referer', payload.referer);
      args.push(url);

      const { stdout } = await execFileAsync('yt-dlp', args, {
        timeout: 22000,
        maxBuffer: 16 * 1024 * 1024,
      });
      const info = JSON.parse(stdout);
      const formats = parseYtdlpFormats(info, url);
      return {
        ok: true,
        title: info.title || title,
        platform: info.extractor_key || detectPlatformLabel(url),
        duration: Number(info.duration) || null,
        thumbnail: info.thumbnail || null,
        saveDir,
        formats,
      };
    } catch (err) {
      const missing = err && (err.code === 'ENOENT' || /not recognized|not found/i.test(String(err.message || '')));
      return {
        ok: true,
        title,
        platform: detectPlatformLabel(url),
        duration: null,
        saveDir,
        ytdlpMissing: missing,
        probeError: missing ? '未检测到 yt-dlp，请安装 yt-dlp 后可自动解析多画质与准确大小' : String(err?.message || '').slice(0, 140),
        formats: [
          {
            id: 'best-auto',
            formatId: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            url,
            kind: 'video-platform',
            label: '最高画质（自动）',
            height: 1080,
            width: 0,
            fps: null,
            ext: 'mp4',
            sizeBytes: null,
            estimated: true,
            audioOnly: false,
            note: 'MP4',
          },
          {
            id: '1080p-fallback',
            formatId: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best',
            url,
            kind: 'video-platform',
            label: '1080p HD',
            height: 1080,
            width: 0,
            fps: null,
            ext: 'mp4',
            sizeBytes: null,
            estimated: true,
            audioOnly: false,
            note: 'MP4',
          },
          {
            id: '720p-fallback',
            formatId: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best',
            url,
            kind: 'video-platform',
            label: '720p HD',
            height: 720,
            width: 0,
            fps: null,
            ext: 'mp4',
            sizeBytes: null,
            estimated: true,
            audioOnly: false,
            note: 'MP4',
          },
          {
            id: 'audio-fallback',
            formatId: 'bestaudio/best',
            url,
            kind: 'video-platform',
            label: '仅音频',
            height: 0,
            width: 0,
            fps: null,
            ext: 'mp3',
            sizeBytes: null,
            estimated: true,
            audioOnly: true,
            note: 'MP3 / M4A',
          },
        ],
      };
    } finally {
      if (cookieFile) {
        fs.unlink(cookieFile).catch(() => {});
      }
    }
  }

  async function downloadMultiChunkRange(task) {
    const { url, filePath, threads, headers } = task;
    const reqHeaders = { 'User-Agent': 'Mozilla/5.0 JoelDeskPro/1.2', ...headers };
    const headRes = await fetch(url, { method: 'HEAD', headers: reqHeaders });
    const totalBytes = Number(headRes.headers.get('content-length') || 0);
    const acceptRanges = (headRes.headers.get('accept-ranges') || '').toLowerCase();

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const updateSpeed = () => {
      const elapsedSec = Math.max(0.2, (Date.now() - task.startedAtMs) / 1000);
      task.speedMBps = Number((task.downloadedBytes / (1024 * 1024) / elapsedSec).toFixed(1));
    };

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
              headers: { ...reqHeaders, Range: `bytes=${start}-${end}` },
            });
            if (!res.ok || !res.body) throw new Error('Chunk ' + idx + ' HTTP ' + res.status);

            let written = 0;
            for await (const buf of res.body) {
              const bytes = Buffer.from(buf);
              await fh.write(bytes, 0, bytes.length, start + written);
              written += bytes.length;
              task.downloadedBytes += bytes.length;
              task.chunks[idx] = Math.min(100, Math.round((written / expected) * 100));
              updateSpeed();
            }
            task.chunks[idx] = 100;
          })
        );
      } finally {
        await fh.close();
      }
      task.speedMBps = 0;
      task.status = 'completed';
      return;
    }

    const res = await fetch(url, { headers: reqHeaders });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const streamLen = Number(res.headers.get('content-length') || totalBytes || 0);
    if (streamLen > 0) task.totalBytes = streamLen;

    const fh = await fs.open(filePath, 'w');
    try {
      for await (const buf of res.body) {
        const bytes = Buffer.from(buf);
        await fh.write(bytes);
        task.downloadedBytes += bytes.length;
        updateSpeed();
        if (task.totalBytes > 0) {
          const pct = Math.min(99, Math.round((task.downloadedBytes / task.totalBytes) * 100));
          task.chunks = task.chunks.map(() => pct);
        }
      }
    } finally {
      await fh.close();
    }
    task.totalBytes = Math.max(task.totalBytes, task.downloadedBytes);
    task.chunks = task.chunks.map(() => 100);
    task.speedMBps = 0;
    task.status = 'completed';
  }

  function parseUnitBytes(numStr, unitStr) {
    const n = parseFloat(numStr);
    if (!Number.isFinite(n)) return 0;
    const u = (unitStr || '').toLowerCase();
    if (u.startsWith('g')) return Math.round(n * 1024 * 1024 * 1024);
    if (u.startsWith('m')) return Math.round(n * 1024 * 1024);
    if (u.startsWith('k')) return Math.round(n * 1024);
    return Math.round(n);
  }

  async function downloadViaYtdlp(task) {
    await fs.mkdir(task.saveDir, { recursive: true });
    let cookieFile = null;
    try {
      cookieFile = await writeNetscapeCookiesTempFile(task.rawCookies);
      const qualitySuffix = task.qualityLabel ? ` [${sanitizeName(task.qualityLabel)}]` : '';
      const outTemplate = path.join(task.saveDir, `%(title).80s${qualitySuffix}.%(ext)s`);
      const args = ['--newline', '--progress', '-N', String(Math.min(16, task.threads)), '-o', outTemplate];

      if (task.audioOnly) {
        args.push('-f', task.formatId || 'bestaudio/best', '-x', '--audio-format', task.ext === 'm4a' ? 'm4a' : 'mp3');
      } else {
        args.push('-f', task.formatId || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
        args.push('--merge-output-format', 'mp4');
      }
      if (cookieFile) args.push('--cookies', cookieFile);
      if (task.headers && task.headers.Referer) args.push('--referer', task.headers.Referer);
      args.push(task.url);

      await new Promise((resolve, reject) => {
        const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderrTail = '';

        const parseLine = (line) => {
          const m = line.match(
            /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+)\s*([KMG]?i?B)(?:\s+at\s+([\d.]+)\s*([KMG]?i?B)\/s)?/i
          );
          if (m) {
            const pct = Math.min(99, Math.round(parseFloat(m[1])));
            const total = parseUnitBytes(m[2], m[3]);
            if (total > 0) {
              task.totalBytes = total;
              task.downloadedBytes = Math.round((total * pct) / 100);
            }
            if (m[4] && m[5]) {
              task.speedMBps = Number((parseUnitBytes(m[4], m[5]) / (1024 * 1024)).toFixed(1));
            }
            task.chunks = task.chunks.map(() => pct);
          }
        };

        let buf = '';
        proc.stdout.on('data', (d) => {
          buf += d.toString('utf8');
          const parts = buf.split(/\r?\n/);
          buf = parts.pop() || '';
          for (const p of parts) parseLine(p);
        });
        proc.stderr.on('data', (d) => {
          stderrTail = (stderrTail + d.toString('utf8')).slice(-400);
        });
        proc.on('exit', (code) => {
          if (code === 0) {
            task.status = 'completed';
            task.speedMBps = 0;
            if (task.totalBytes > 0) task.downloadedBytes = task.totalBytes;
            task.chunks = task.chunks.map(() => 100);
            resolve();
          } else {
            reject(new Error('yt-dlp exited with code ' + code + (stderrTail ? ': ' + stderrTail.trim() : '')));
          }
        });
        proc.on('error', reject);
      });
    } finally {
      if (cookieFile) {
        fs.unlink(cookieFile).catch(() => {});
      }
    }
  }

  function startTask(payload) {
    const id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const saveDir = resolveEffectiveSaveDir(payload.saveDir);
    const rawName = sanitizeName(payload.fileName || payload.filename || 'download.mp4');
    const qualityLabel = typeof payload.qualityLabel === 'string' ? payload.qualityLabel.trim() : '';
    const fileName = qualityLabel && !rawName.includes(qualityLabel)
      ? rawName.replace(/(\.[a-z0-9]{2,5})$/i, ` [${sanitizeName(qualityLabel)}]$1`)
      : rawName;
    const threads = Number(payload.threads) || 16;
    const cookieHeader = buildCookieHeader(payload.cookies);

    const headers = {};
    if (payload.referer) headers.Referer = payload.referer;
    if (cookieHeader) headers.Cookie = cookieHeader;

    const isVideoPage =
      payload.kind === 'video-platform' ||
      payload.kind === 'hls' ||
      payload.kind === 'dash' ||
      Boolean(payload.formatId) ||
      Boolean(payload.audioOnly) ||
      (VIDEO_PLATFORM_RE.test(payload.url) && !/\.(mp4|mkv|webm|mov|m4a|mp3|zip|rar|7z|pdf|exe)(\?|$)/i.test(payload.url));

    const task = {
      id,
      url: payload.url,
      fileName,
      saveDir,
      filePath: path.join(saveDir, fileName),
      engine: isVideoPage ? 'ytdlp' : 'http_range',
      source: payload.source === 'chrome_extension' ? 'chrome_extension' : 'manual',
      hasCookies: Boolean(cookieHeader || payload.hasCookies),
      qualityLabel: qualityLabel || (payload.audioOnly ? 'Audio' : ''),
      formatId: typeof payload.formatId === 'string' ? payload.formatId : '',
      audioOnly: Boolean(payload.audioOnly),
      ext: typeof payload.ext === 'string' ? payload.ext : 'mp4',
      threads,
      headers,
      rawCookies: Array.isArray(payload.cookies) ? payload.cookies : null,
      startedAtMs: Date.now(),
      totalBytes: Number(payload.size || payload.sizeBytes || 0) || 0,
      downloadedBytes: 0,
      speedMBps: 0,
      chunks: Array.from({ length: 8 }, () => 0),
      status: 'downloading',
    };
    tasks.set(id, task);

    const runner = isVideoPage ? downloadViaYtdlp(task) : downloadMultiChunkRange(task);
    runner.catch((err) => {
      task.status = 'error';
      task.speedMBps = 0;
      task.error = err.message;
    });
    return task;
  }

  async function runLocalGitUpdate(repo, branch) {
    const safeRepo = (repo || 'joelting02-sys/JoelDeskPro').replace(/[^A-Za-z0-9_.-/]/g, '');
    const safeBranch = (branch || 'main').replace(/[^A-Za-z0-9_.-/]/g, '');
    const cwd = process.cwd();
    await execFileAsync('git', ['fetch', 'origin', safeBranch], { cwd, timeout: 60000 });
    const pullRes = await execFileAsync('git', ['pull', '--ff-only', 'origin', safeBranch], { cwd, timeout: 60000 });
    const shaRes = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, timeout: 15000 });
    return {
      ok: true,
      updatedSha: (shaRes.stdout || '').trim(),
      message: 'Updated from ' + safeRepo + ' (' + safeBranch + ')',
      log: (pullRes.stdout || pullRes.stderr || '').trim(),
    };
  }

  const watchdog = setInterval(async () => {
    if (computeState.status !== 'online' || !computeSettings.auto_shutdown_enabled) return;
    const pending = getPendingTaskCount();
    const nowSec = Math.floor(Date.now() / 1000);
    if (pending > 0) {
      computeState.last_activity_at = nowSec;
      return;
    }
    const base = computeState.last_activity_at || computeState.started_at || nowSec;
    if (nowSec - base >= computeSettings.auto_shutdown_minutes * 60) {
      await stopComputeRuntime();
    }
  }, 12000);

  loadComputeSettings();

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DeskKit-Token');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1:' + PORT);

    if (reqUrl.pathname === '/api/health') {
      const chromeDefaultDir = detectChromeDefaultDownloadDir();
      const effectiveSaveDir = customSaveDir || chromeDefaultDir;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          desktop: true,
          saveDir: effectiveSaveDir,
          chromeDefaultDir,
          customSaveDir,
          tasks: [...tasks.values()].map(({ headers, rawCookies, ...pub }) => pub),
        })
      );
      return;
    }

    if (req.method === 'POST' && reqUrl.pathname === '/api/folder/pick') {
      if (!onPickFolder) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, unsupported: true }));
        return;
      }
      try {
        const picked = await onPickFolder(customSaveDir || detectChromeDefaultDownloadDir());
        if (picked) {
          customSaveDir = picked;
          await saveComputeSettings();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, dir: picked, saveDir: picked }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, canceled: true }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    if (req.method === 'POST' && reqUrl.pathname === '/api/folder/set') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        customSaveDir = typeof body.dir === 'string' ? body.dir.trim() : '';
        await saveComputeSettings();
        const chromeDefaultDir = detectChromeDefaultDownloadDir();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            customSaveDir,
            chromeDefaultDir,
            saveDir: customSaveDir || chromeDefaultDir,
          })
        );
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    if (req.method === 'DELETE' && reqUrl.pathname.startsWith('/api/tasks/')) {
      const id = decodeURIComponent(reqUrl.pathname.slice('/api/tasks/'.length));
      tasks.delete(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
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
              computeState.error = 'Runtime created; set COLAB_GATEWAY_URL for /health verification.';
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

    if (req.method === 'POST' && reqUrl.pathname === '/api/bridge/probe') {
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
        const result = await probeMediaFormats(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message || 'Probe failed' }));
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
        res.end(
          JSON.stringify({
            ok: true,
            count: created.length,
            saveDir: resolveEffectiveSaveDir(''),
            tasks: created.map(({ headers, rawCookies, ...pub }) => pub),
          })
        );
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
        res.end(JSON.stringify({ ok: false, error: e.message || 'Update failed' }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.on('error', () => {
    // Port may already be bound by another local engine instance.
  });

  server.listen(PORT, '127.0.0.1');

  return {
    close() {
      clearInterval(watchdog);
      try {
        server.close();
      } catch {}
    },
  };
}

module.exports = { startLocalEngine, detectChromeDefaultDownloadDir };
