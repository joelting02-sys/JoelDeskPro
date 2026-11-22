const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const PARTITION_NAME = 'persist:site-cookies';
const DEFAULT_STORE_PATH = path.join(os.homedir(), '.joeldeskpro', 'site-cookies.json');
const FALLBACK_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SITE_PRESETS = [
  {
    id: 'douyin',
    label: '抖音 Douyin',
    loginUrl: 'https://www.douyin.com/',
    domains: ['douyin.com', 'iesdouyin.com'],
    referer: 'https://www.douyin.com/',
  },
  {
    id: 'bilibili',
    label: 'B站 Bilibili',
    loginUrl: 'https://www.bilibili.com/',
    domains: ['bilibili.com', 'b23.tv'],
    referer: 'https://www.bilibili.com/',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    loginUrl: 'https://www.youtube.com/',
    domains: ['youtube.com', 'youtu.be', 'google.com'],
    referer: 'https://www.youtube.com/',
  },
  {
    id: 'xiaohongshu',
    label: '小红书',
    loginUrl: 'https://www.xiaohongshu.com/',
    domains: ['xiaohongshu.com', 'xhslink.com'],
    referer: 'https://www.xiaohongshu.com/',
  },
];

const HOST_DOMAIN_ALIASES = [
  {
    hosts: ['v.douyin.com', 'iesdouyin.com'],
    domains: ['douyin.com', 'iesdouyin.com'],
    referer: 'https://www.douyin.com/',
  },
  {
    hosts: ['b23.tv'],
    domains: ['bilibili.com'],
    referer: 'https://www.bilibili.com/',
  },
  {
    hosts: ['youtu.be'],
    domains: ['youtube.com', 'google.com'],
    referer: 'https://www.youtube.com/',
  },
  {
    hosts: ['xhslink.com'],
    domains: ['xiaohongshu.com'],
    referer: 'https://www.xiaohongshu.com/',
  },
  {
    hosts: ['vt.tiktok.com', 'vm.tiktok.com'],
    domains: ['tiktok.com'],
    referer: 'https://www.tiktok.com/',
  },
];

function hostMatchesDomain(hostname, targetDomain) {
  if (!hostname || !targetDomain) return false;
  const h = String(hostname).toLowerCase().replace(/^\.+/, '');
  const d = String(targetDomain).toLowerCase().replace(/^\.+/, '');
  return h === d || h.endsWith('.' + d);
}

function cookieKey(c) {
  return `${c.name}|${c.domain}|${c.path || '/'}`;
}

function normalizeCookie(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const domain = typeof raw.domain === 'string' ? raw.domain.trim() : '';
  if (!name || !domain) return null;

  const value = typeof raw.value === 'string' ? raw.value : String(raw.value ?? '');
  const cookiePath = typeof raw.path === 'string' && raw.path.trim() ? raw.path.trim() : '/';
  const secure = Boolean(raw.secure);
  const httpOnly = Boolean(raw.httpOnly);
  const hostOnly = typeof raw.hostOnly === 'boolean' ? raw.hostOnly : !domain.startsWith('.');

  const rawExp = Number(raw.expirationDate);
  const hasExp = Number.isFinite(rawExp) && rawExp > 0;
  const session = typeof raw.session === 'boolean' ? raw.session : !hasExp;

  const normalized = {
    name,
    value,
    domain,
    path: cookiePath,
    secure,
    httpOnly,
    hostOnly,
    session,
  };
  if (!session && hasExp) {
    normalized.expirationDate = rawExp;
  }
  return normalized;
}

function isCookieExpired(cookie, nowSec = Math.floor(Date.now() / 1000)) {
  if (!cookie || cookie.session) return false;
  const exp = Number(cookie.expirationDate);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  return exp <= nowSec;
}

function dedupeCookies(list) {
  const map = new Map();
  for (const item of list || []) {
    const c = normalizeCookie(item);
    if (!c) continue;
    map.set(cookieKey(c), c);
  }
  return Array.from(map.values());
}

function parseNetscapeCookiesTxt(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const parsed = [];
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    if (!rawLine || !rawLine.trim()) continue;
    let line = rawLine;
    let httpOnly = false;
    if (line.startsWith('#HttpOnly_')) {
      httpOnly = true;
      line = line.slice('#HttpOnly_'.length);
    } else if (line.trimStart().startsWith('#')) {
      continue;
    }

    const parts = line.split('\t');
    if (parts.length < 7) continue;

    const domain = parts[0].trim();
    const includeSubdomains = parts[1].trim().toUpperCase() === 'TRUE';
    const cookiePath = parts[2].trim() || '/';
    const secure = parts[3].trim().toUpperCase() === 'TRUE';
    const expNum = Number(parts[4].trim());
    const name = parts[5].trim();
    const value = parts.slice(6).join('\t');

    if (!domain || !name) continue;

    const hasExp = Number.isFinite(expNum) && expNum > 0;
    const c = normalizeCookie({
      name,
      value,
      domain,
      path: cookiePath,
      secure,
      httpOnly,
      hostOnly: !includeSubdomains,
      session: !hasExp,
      expirationDate: hasExp ? expNum : undefined,
    });
    if (c) parsed.push(c);
  }

  return dedupeCookies(parsed);
}

function formatNetscapeCookiesTxt(cookies) {
  const header = [
    '# Netscape HTTP Cookie File',
    '# Generated by Joel Desk Pro',
    '',
  ];
  const rows = [];
  for (const item of dedupeCookies(cookies)) {
    const rawDomain = item.domain;
    const includeSubdomains = rawDomain.startsWith('.') || item.hostOnly === false ? 'TRUE' : 'FALSE';
    const domainField = item.httpOnly ? `#HttpOnly_${rawDomain}` : rawDomain;
    const pathField = item.path || '/';
    const secureField = item.secure ? 'TRUE' : 'FALSE';
    const expField =
      !item.session && Number.isFinite(item.expirationDate) && item.expirationDate > 0
        ? String(Math.floor(item.expirationDate))
        : '0';
    rows.push(
      [domainField, includeSubdomains, pathField, secureField, expField, item.name, item.value].join(
        '\t'
      )
    );
  }
  return header.concat(rows).join('\n') + '\n';
}

function resolveUrlMatchContext(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl || '').trim());
  } catch {
    return null;
  }
  const hostname = u.hostname.toLowerCase();
  if (!hostname) return null;

  for (const alias of HOST_DOMAIN_ALIASES) {
    if (alias.hosts.some((h) => hostMatchesDomain(hostname, h))) {
      return {
        hostname,
        aliasDomains: alias.domains,
        referer: alias.referer,
      };
    }
  }

  for (const preset of SITE_PRESETS) {
    if (preset.domains.some((d) => hostMatchesDomain(hostname, d))) {
      return {
        hostname,
        aliasDomains: preset.domains,
        referer: preset.referer,
      };
    }
  }

  return {
    hostname,
    aliasDomains: [],
    referer: `${u.origin}/`,
  };
}

function matchCookiesForUrl(allCookies, rawUrl, nowSec = Math.floor(Date.now() / 1000)) {
  const ctx = resolveUrlMatchContext(rawUrl);
  if (!ctx) {
    return { cookies: [], referer: '' };
  }

  const matched = [];
  for (const item of allCookies || []) {
    const c = normalizeCookie(item);
    if (!c || isCookieExpired(c, nowSec)) continue;

    const cDom = c.domain.toLowerCase().replace(/^\.+/, '');
    if (!cDom) continue;

    const directMatch = c.hostOnly
      ? ctx.hostname === cDom
      : hostMatchesDomain(ctx.hostname, cDom);

    const aliasMatch =
      !directMatch &&
      ctx.aliasDomains.some((td) => cDom === td || cDom.endsWith('.' + td));

    if (directMatch || aliasMatch) {
      matched.push(c);
    }
  }

  return {
    cookies: dedupeCookies(matched),
    referer: ctx.referer,
  };
}

function cookieMatchesDomains(cookie, domains) {
  if (!cookie || !Array.isArray(domains) || domains.length === 0) return false;
  const cDom = cookie.domain.toLowerCase().replace(/^\.+/, '');
  return domains.some((d) => cDom === d || cDom.endsWith('.' + d));
}

function sanitizeUaForSites(rawUa) {
  const cleaned = String(rawUa || '')
    .replace(/Electron\/\S+\s*/gi, '')
    .replace(/joel-desk-pro\/\S+\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned && /Mozilla\//i.test(cleaned) ? cleaned : FALLBACK_CHROME_UA;
}

function createSiteCookieManager(options = {}) {
  const mainWindow = options.mainWindow || null;
  const BrowserWindowCtor = options.BrowserWindow || null;
  const sessionApi = options.session || null;
  const dialog = options.dialog || null;
  const downloadsDir =
    typeof options.downloadsDir === 'string' && options.downloadsDir.trim()
      ? options.downloadsDir.trim()
      : path.join(os.homedir(), 'Downloads');
  const storePath = options.storePath || DEFAULT_STORE_PATH;

  let loginWin = null;

  function getPartitionSession() {
    if (!sessionApi || typeof sessionApi.fromPartition !== 'function') return null;
    try {
      return sessionApi.fromPartition(PARTITION_NAME);
    } catch {
      return null;
    }
  }

  function readStoreSync() {
    try {
      if (!fsSync.existsSync(storePath)) {
        return { updatedAt: '', cookies: [] };
      }
      const parsed = JSON.parse(fsSync.readFileSync(storePath, 'utf8'));
      const list = Array.isArray(parsed?.cookies) ? parsed.cookies : [];
      return {
        updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : '',
        cookies: dedupeCookies(list),
      };
    } catch {
      return { updatedAt: '', cookies: [] };
    }
  }

  async function writeStore(cookies) {
    const deduped = dedupeCookies(cookies);
    const updatedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(
      storePath,
      JSON.stringify({ updatedAt, cookies: deduped }, null, 2),
      'utf8'
    );
    return { updatedAt, cookies: deduped };
  }

  async function syncFromSession() {
    const stored = readStoreSync();
    const ses = getPartitionSession();
    if (!ses || !ses.cookies || typeof ses.cookies.get !== 'function') {
      return stored;
    }

    let sessionCookies = [];
    try {
      const rawList = await ses.cookies.get({});
      sessionCookies = dedupeCookies(rawList);
    } catch {
      return stored;
    }

    if (sessionCookies.length === 0) {
      return stored;
    }

    const mergedMap = new Map();
    for (const c of stored.cookies) {
      mergedMap.set(cookieKey(c), c);
    }
    for (const c of sessionCookies) {
      mergedMap.set(cookieKey(c), c);
    }
    const merged = Array.from(mergedMap.values());
    return writeStore(merged);
  }

  function buildStatusSnapshot(storeData) {
    const nowSec = Math.floor(Date.now() / 1000);
    const active = (storeData?.cookies || []).filter((c) => !isCookieExpired(c, nowSec));
    const sites = SITE_PRESETS.map((preset) => {
      const count = active.filter((c) => cookieMatchesDomains(c, preset.domains)).length;
      return {
        id: preset.id,
        label: preset.label,
        count,
        hasCookies: count > 0,
      };
    });
    return {
      supported: true,
      totalCount: active.length,
      updatedAt: storeData?.updatedAt || '',
      sites,
    };
  }

  async function getStatus() {
    const synced = await syncFromSession();
    return buildStatusSnapshot(synced);
  }

  async function getCookiesForUrl(rawUrl) {
    const synced = await syncFromSession();
    return matchCookiesForUrl(synced.cookies, rawUrl);
  }

  async function openLoginWindow(siteId) {
    const preset = SITE_PRESETS.find((s) => s.id === siteId) || SITE_PRESETS[0];
    if (!BrowserWindowCtor) {
      return { ok: false, error: 'BrowserWindow unavailable' };
    }

    const ses = getPartitionSession();
    const rawUa =
      (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.getUserAgent()) ||
      (ses && typeof ses.getUserAgent === 'function' ? ses.getUserAgent() : '');
    const chromeUa = sanitizeUaForSites(rawUa);

    if (ses && typeof ses.setUserAgent === 'function') {
      try {
        ses.setUserAgent(chromeUa);
      } catch {}
    }

    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.setTitle(`登录 ${preset.label} — 登录完成后关闭此窗口即可保存 Cookies`);
      if (loginWin.isMinimized()) loginWin.restore();
      loginWin.focus();
      loginWin.loadURL(preset.loginUrl, { userAgent: chromeUa }).catch(() => {});
      const status = await getStatus();
      return { ok: true, reused: true, status };
    }

    return new Promise((resolve) => {
      const winOpts = {
        width: 1120,
        height: 760,
        title: `登录 ${preset.label} — 登录完成后关闭此窗口即可保存 Cookies`,
        autoHideMenuBar: true,
        backgroundColor: '#FFFFFF',
        webPreferences: {
          partition: PARTITION_NAME,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      };
      if (mainWindow && !mainWindow.isDestroyed()) {
        winOpts.parent = mainWindow;
      }

      loginWin = new BrowserWindowCtor(winOpts);
      loginWin.webContents.setUserAgent(chromeUa);
      loginWin.webContents.on('did-create-window', (childWin) => {
        try {
          childWin.webContents.setUserAgent(chromeUa);
        } catch {}
      });

      const syncSilently = () => {
        syncFromSession().catch(() => {});
      };
      loginWin.webContents.on('did-finish-load', syncSilently);
      loginWin.webContents.on('did-navigate', syncSilently);

      let settled = false;
      loginWin.on('closed', async () => {
        loginWin = null;
        if (settled) return;
        settled = true;
        try {
          const synced = await syncFromSession();
          resolve({ ok: true, status: buildStatusSnapshot(synced) });
        } catch (err) {
          resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      });

      loginWin.loadURL(preset.loginUrl, { userAgent: chromeUa }).catch(() => {});
    });
  }

  async function seedSessionCookies(cookies) {
    const ses = getPartitionSession();
    if (!ses || !ses.cookies || typeof ses.cookies.set !== 'function') return;
    for (const c of cookies) {
      if (isCookieExpired(c)) continue;
      const cleanDomain = c.domain.replace(/^\.+/, '');
      const cookieUrl = `https://${cleanDomain}${c.path || '/'}`;
      const details = {
        url: cookieUrl,
        name: c.name,
        value: c.value,
        path: c.path || '/',
        secure: Boolean(c.secure),
        httpOnly: Boolean(c.httpOnly),
      };
      if (c.domain.startsWith('.') || c.hostOnly === false) {
        details.domain = c.domain.startsWith('.') ? c.domain : `.${c.domain}`;
      }
      if (!c.session && Number.isFinite(c.expirationDate) && c.expirationDate > 0) {
        details.expirationDate = c.expirationDate;
      }
      try {
        await ses.cookies.set(details);
      } catch {}
    }
  }

  async function importCookiesTxt() {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Dialog unavailable' };
    }
    const pickerOpts = {
      title: '选择 Netscape cookies.txt 文件',
      defaultPath: downloadsDir,
      properties: ['openFile'],
      filters: [
        { name: 'Cookies Text (*.txt)', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };
    const res =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, pickerOpts)
        : await dialog.showOpenDialog(pickerOpts);

    if (res.canceled || !Array.isArray(res.filePaths) || res.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    const filePath = res.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');
    const imported = parseNetscapeCookiesTxt(content);
    if (imported.length === 0) {
      return {
        ok: false,
        error: '未能从该文件解析出有效 Cookies（需为标准 Netscape cookies.txt 格式）',
      };
    }

    const stored = await syncFromSession();
    const mergedMap = new Map();
    for (const c of stored.cookies) {
      mergedMap.set(cookieKey(c), c);
    }
    for (const c of imported) {
      mergedMap.set(cookieKey(c), c);
    }
    const saved = await writeStore(Array.from(mergedMap.values()));
    await seedSessionCookies(imported);

    return {
      ok: true,
      importedCount: imported.length,
      filePath,
      status: buildStatusSnapshot(saved),
    };
  }

  async function exportCookiesTxt(siteId) {
    if (!dialog || typeof dialog.showSaveDialog !== 'function') {
      return { ok: false, error: 'Dialog unavailable' };
    }
    const synced = await syncFromSession();
    const nowSec = Math.floor(Date.now() / 1000);
    const active = synced.cookies.filter((c) => !isCookieExpired(c, nowSec));
    const preset = siteId ? SITE_PRESETS.find((s) => s.id === siteId) : null;
    const toExport = preset
      ? active.filter((c) => cookieMatchesDomains(c, preset.domains))
      : active;

    if (toExport.length === 0) {
      return {
        ok: false,
        error: preset ? `${preset.label} 暂无可导出的 Cookies` : '暂无可导出的 Cookies',
      };
    }

    const defaultName = `${preset ? preset.id : 'all'}-cookies.txt`;
    const saveOpts = {
      title: '导出 Netscape cookies.txt（可用于 TDM Fast / yt-dlp 手动导入）',
      defaultPath: path.join(downloadsDir, defaultName),
      filters: [{ name: 'Cookies Text (*.txt)', extensions: ['txt'] }],
    };
    const res =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showSaveDialog(mainWindow, saveOpts)
        : await dialog.showSaveDialog(saveOpts);

    if (res.canceled || !res.filePath) {
      return { ok: false, canceled: true };
    }

    const formatted = formatNetscapeCookiesTxt(toExport);
    await fs.writeFile(res.filePath, formatted, 'utf8');
    return {
      ok: true,
      path: res.filePath,
      count: toExport.length,
    };
  }

  async function clearCookies(siteId) {
    const preset = siteId ? SITE_PRESETS.find((s) => s.id === siteId) : null;
    const stored = readStoreSync();
    const remaining = preset
      ? stored.cookies.filter((c) => !cookieMatchesDomains(c, preset.domains))
      : [];
    const saved = await writeStore(remaining);

    const ses = getPartitionSession();
    if (ses && ses.cookies) {
      try {
        const allSes = await ses.cookies.get({});
        for (const c of allSes) {
          if (preset && !cookieMatchesDomains(c, preset.domains)) continue;
          const cleanDomain = String(c.domain || '').replace(/^\.+/, '');
          if (!cleanDomain) continue;
          const cookieUrl = `${c.secure ? 'https' : 'http'}://${cleanDomain}${c.path || '/'}`;
          try {
            await ses.cookies.remove(cookieUrl, c.name);
          } catch {}
        }
      } catch {}
    }

    return {
      ok: true,
      status: buildStatusSnapshot(saved),
    };
  }

  return {
    getStatus,
    getCookiesForUrl,
    openLoginWindow,
    importCookiesTxt,
    exportCookiesTxt,
    clearCookies,
    syncFromSession,
  };
}

module.exports = {
  SITE_PRESETS,
  HOST_DOMAIN_ALIASES,
  normalizeCookie,
  parseNetscapeCookiesTxt,
  formatNetscapeCookiesTxt,
  matchCookiesForUrl,
  createSiteCookieManager,
};
