// Local Colab/Kaggle compute proxy & GitHub self-updater backend for Joel Desk Pro Desktop (.exe).
// Zero external npm dependencies (uses Node.js 20+ built-in fetch).
const http = require('node:http');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

/**
 * Detects Chrome's currently configured default download directory on the user's machine.
 * Used when saving downloaded GitHub Release installers.
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
  const ACCEPTED_TOKENS = new Set(
    [TOKEN, 'joeldeskpro-local-bridge', 'deskkit-local-bridge'].filter(Boolean)
  );
  const IS_PACKAGED = Boolean(options.isPackaged);
  const onLaunchInstaller =
    typeof options.onLaunchInstaller === 'function' ? options.onLaunchInstaller : null;

  function isTokenAuthorized(reqToken) {
    if (!reqToken) return true; // Localhost loopback (127.0.0.1) allows omitted token
    return ACCEPTED_TOKENS.has(String(reqToken).trim());
  }

  const COLAB_MCP_URL = 'https://colab.googleapis.com/mcp';
  const COLAB_T4_DIR = process.env.COLAB_T4_DIR || path.join(os.homedir(), '.joeldeskpro', 'colab');
  const KAGGLE_CONFIG_PATH = process.env.KAGGLE_CONFIG_DIR
    ? path.join(process.env.KAGGLE_CONFIG_DIR, 'kaggle.json')
    : path.join(os.homedir(), '.kaggle', 'kaggle.json');
  const SETTINGS_FILE = options.settingsFile || path.join(os.homedir(), '.joeldeskpro', 'compute-settings.json');
  const COLAB_GATEWAY_URL = (process.env.COLAB_GATEWAY_URL || '').replace(/\/+$/, '');
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

  async function readJsonSafe(filePath) {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      return null;
    }
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
    } catch {}
  }

  async function saveComputeSettings() {
    const existing = (await readJsonSafe(SETTINGS_FILE)) || {};
    const merged = {
      ...existing,
      auto_shutdown_enabled: computeSettings.auto_shutdown_enabled,
      auto_shutdown_minutes: computeSettings.auto_shutdown_minutes,
    };
    await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
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

  async function buildStateSnapshot() {
    const nowSec = Math.floor(Date.now() / 1000);
    let idleRemaining = null;
    if (computeState.status === 'online' && computeSettings.auto_shutdown_enabled) {
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
      pending_tasks: 0,
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

  async function findGitProjectDir() {
    const candidates = [
      process.cwd(),
      path.resolve(__dirname, '..'),
      path.join(process.cwd(), 'JoelDeskPro'),
      path.join(os.homedir(), 'JoelDeskPro'),
      path.join(os.homedir(), 'Desktop', 'JoelDeskPro'),
    ];
    for (const dir of candidates) {
      if (!dir || dir.includes('.asar')) continue;
      try {
        await fs.access(path.join(dir, '.git'));
        return dir;
      } catch {}
    }
    return null;
  }

  async function downloadAndLaunchLatestReleaseExe(safeRepo) {
    const logs = [];
    const relUrl = `https://api.github.com/repos/${safeRepo}/releases/latest`;
    logs.push('> GET ' + relUrl);
    const relRes = await fetch(relUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'JoelDeskPro-Updater',
      },
    });
    if (!relRes.ok) {
      throw new Error(
        relRes.status === 404
          ? `未在 ${safeRepo} 找到已发布的 Release 安装包，请等待 GitHub Actions 构建完成或手动下载`
          : `查询 GitHub Release 失败（HTTP ${relRes.status}）`
      );
    }
    const rel = await relRes.json();
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
    const exeAssets = assets.filter(
      (a) => a && typeof a.name === 'string' && /\.exe$/i.test(a.name) && a.browser_download_url
    );
    const preferred =
      exeAssets.find((a) => (isPortable ? /portable/i.test(a.name) : /setup/i.test(a.name))) ||
      exeAssets[0];

    if (!preferred) {
      throw new Error(
        `最新 Release (${rel.tag_name || 'latest'}) 中暂未包含 Windows .exe 安装包，请稍后重试或前往 Releases 页面下载`
      );
    }

    const saveDir = detectChromeDefaultDownloadDir();
    await fs.mkdir(saveDir, { recursive: true });
    const fileName = sanitizeName(preferred.name);
    const destPath = path.join(saveDir, fileName);
    logs.push(`> Downloading ${preferred.name} -> ${destPath}`);

    const dlRes = await fetch(preferred.browser_download_url, {
      headers: { 'User-Agent': 'JoelDeskPro-Updater' },
    });
    if (!dlRes.ok || !dlRes.body) {
      throw new Error(`下载最新安装包失败（HTTP ${dlRes.status}）`);
    }

    const fh = await fs.open(destPath, 'w');
    let written = 0;
    try {
      for await (const chunk of dlRes.body) {
        const buf = Buffer.from(chunk);
        await fh.write(buf);
        written += buf.length;
      }
    } finally {
      await fh.close();
    }
    logs.push(`> Downloaded ${(written / (1024 * 1024)).toFixed(1)} MB`);

    if (onLaunchInstaller) {
      await onLaunchInstaller(destPath, isPortable);
      logs.push(isPortable ? '> Revealed portable .exe in folder' : '> Launched installer .exe');
    }

    const tag = rel.tag_name || 'latest';
    return {
      ok: true,
      mode: 'release_exe',
      updatedSha: tag,
      installerPath: destPath,
      message: isPortable
        ? `已下载新版便携包 ${fileName}（${tag}），已为你打开所在文件夹`
        : `已下载最新安装包 ${fileName}（${tag}）并启动安装程序`,
      log: logs.join('\n'),
    };
  }

  async function runLocalGitUpdate(repo, branch) {
    const safeRepo = (repo || 'joelting02-sys/JoelDeskPro').replace(/[^A-Za-z0-9_.\-/]/g, '');
    const safeBranch = (branch || 'main').replace(/[^A-Za-z0-9_.\-/]/g, '');

    if (IS_PACKAGED && process.platform === 'win32') {
      return downloadAndLaunchLatestReleaseExe(safeRepo);
    }

    const projectDir = await findGitProjectDir();
    if (!projectDir) {
      if (process.platform === 'win32') {
        return downloadAndLaunchLatestReleaseExe(safeRepo);
      }
      throw new Error(
        `未在当前目录检测到 .git 仓库（${process.cwd()}）。请使用一键更新脚本或前往 GitHub Releases 下载最新版本。`
      );
    }

    const logs = [];
    logs.push(`> git fetch origin ${safeBranch} (in ${projectDir})`);
    await execFileAsync('git', ['fetch', 'origin', safeBranch], { cwd: projectDir, timeout: 60000 });

    try {
      const pullRes = await execFileAsync('git', ['pull', '--ff-only', 'origin', safeBranch], {
        cwd: projectDir,
        timeout: 60000,
      });
      logs.push((pullRes.stdout || pullRes.stderr || '').trim());
    } catch {
      logs.push('> --ff-only failed, retrying with git pull --rebase --autostash');
      const rebaseRes = await execFileAsync(
        'git',
        ['pull', '--rebase', '--autostash', 'origin', safeBranch],
        { cwd: projectDir, timeout: 60000 }
      );
      logs.push((rebaseRes.stdout || rebaseRes.stderr || '').trim());
    }

    const execNpmOpts = {
      cwd: projectDir,
      timeout: 180000,
      shell: process.platform === 'win32',
    };
    logs.push('> npm install');
    const inst = await execFileAsync('npm', ['install'], execNpmOpts);
    if (inst.stdout) logs.push(inst.stdout.trim().slice(-400));

    logs.push('> npm run build');
    const build = await execFileAsync('npm', ['run', 'build'], execNpmOpts);
    if (build.stdout) logs.push(build.stdout.trim().slice(-400));

    const shaRes = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: projectDir,
      timeout: 15000,
    });
    const updatedSha = (shaRes.stdout || '').trim();
    return {
      ok: true,
      mode: 'git',
      updatedSha,
      message: `已成功从 ${safeRepo} (${safeBranch}) 拉取并构建最新版本 (${updatedSha.slice(0, 7)})`,
      log: logs.filter(Boolean).join('\n'),
    };
  }

  const watchdog = setInterval(async () => {
    if (computeState.status !== 'online' || !computeSettings.auto_shutdown_enabled) return;
    const nowSec = Math.floor(Date.now() / 1000);
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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          desktop: true,
          packaged: IS_PACKAGED,
          tdmHosted: true,
        })
      );
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
        res.end(
          JSON.stringify({
            ok: false,
            error: e.message || 'Update failed',
            log: [e.stdout, e.stderr].filter(Boolean).join('\n').trim() || undefined,
          })
        );
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
