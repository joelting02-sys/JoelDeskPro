// Built-in local multi-chunk Range downloader & Colab/Kaggle compute engine for Joel Desk Pro Desktop (.exe).
// Zero external npm dependencies (uses Node.js 20+ built-in fetch).
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function startLocalEngine(options = {}) {
  const PORT = Number(options.port || process.env.JOELDESKPRO_PORT || 17890);
  const TOKEN = options.token || process.env.JOELDESKPRO_TOKEN || 'deskkit-local-9f4a2c';
  const DEFAULT_SAVE_DIR = options.defaultSaveDir || path.join(os.homedir(), 'Downloads');

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

  async function downloadMultiChunkRange(task) {
    const { url, filePath, threads, headers } = task;
    const reqHeaders = { 'User-Agent': 'Mozilla/5.0 JoelDeskPro/1.2', ...headers };
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
            }
            task.chunks[idx] = 100;
          })
        );
      } finally {
        await fh.close();
      }
      task.status = 'completed';
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
  }

  function downloadViaYtdlp(task) {
    return new Promise((resolve, reject) => {
      const outTemplate = path.join(task.saveDir, '%(title).80s.%(ext)s');
      const proc = spawn('yt-dlp', ['-N', String(Math.min(16, task.threads)), '-o', outTemplate, task.url], {
        stdio: 'ignore',
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
    const saveDir = payload.saveDir && !payload.saveDir.startsWith('~')
      ? payload.saveDir
      : DEFAULT_SAVE_DIR;
    const fileName = sanitizeName(payload.fileName || payload.filename || 'download.mp4');
    const threads = Number(payload.threads) || 16;
    const cookieHeader = Array.isArray(payload.cookies)
      ? payload.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
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

    const isVideoPage =
      payload.kind === 'video-platform' ||
      /(youtube\.com|youtu\.be|bilibili\.com|tiktok\.com)/i.test(payload.url);
    const runner = isVideoPage ? downloadViaYtdlp(task) : downloadMultiChunkRange(task);
    runner.catch((err) => {
      task.status = 'error';
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DeskKit-Token');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1:' + PORT);

    if (reqUrl.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, desktop: true, saveDir: DEFAULT_SAVE_DIR, tasks: [...tasks.values()] }));
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
        res.end(JSON.stringify({ ok: false, error: e.message || 'Update failed' }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.on('error', () => {
    // Port may already be bound by a standalone local engine instance — continue cleanly.
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

module.exports = { startLocalEngine };
