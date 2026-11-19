const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const DEFAULT_SETTINGS_FILE = path.join(os.homedir(), '.joeldeskpro', 'compute-settings.json');

function isValidWhisperProjectDir(dir) {
  if (!dir || typeof dir !== 'string') return false;
  try {
    const mainPy = path.join(dir, 'backend', 'main.py');
    const indexHtml = path.join(dir, 'frontend', 'index.html');
    return (
      fsSync.existsSync(mainPy) &&
      fsSync.statSync(mainPy).isFile() &&
      fsSync.existsSync(indexHtml) &&
      fsSync.statSync(indexHtml).isFile()
    );
  } catch {
    return false;
  }
}

function autoDetectProjectDir(shell) {
  const home = os.homedir();
  const candidates = [];

  if (process.platform === 'win32' && shell && typeof shell.readShortcutLink === 'function') {
    const lnkPath = path.join(home, 'Desktop', 'Cloud Whisper Studio.lnk');
    try {
      if (fsSync.existsSync(lnkPath)) {
        const info = shell.readShortcutLink(lnkPath);
        if (info?.cwd) candidates.push(info.cwd);
        if (info?.target) candidates.push(path.dirname(info.target));
      }
    } catch {}
  }

  candidates.push(
    path.join(home, 'Documents', 'Projects', 'cloud-whisper-studio'),
    path.join(home, 'Projects', 'cloud-whisper-studio'),
    path.join(home, 'Desktop', 'cloud-whisper-studio'),
    path.join(home, 'cloud-whisper-studio')
  );

  for (const dir of candidates) {
    if (isValidWhisperProjectDir(dir)) {
      return dir;
    }
  }
  return '';
}

function parsePyDirVersion(name) {
  const m = String(name).match(/Python(\d+)/i);
  if (!m) return 0;
  const digits = m[1];
  if (digits.length >= 2) {
    const major = Number(digits[0]);
    const minor = Number(digits.slice(1));
    return major * 1000 + minor;
  }
  return Number(digits) || 0;
}

function autoDetectPythonExe(projectDir) {
  const home = os.homedir();
  const venvCandidates = [];
  if (projectDir) {
    if (process.platform === 'win32') {
      venvCandidates.push(
        path.join(projectDir, '.venv', 'Scripts', 'python.exe'),
        path.join(projectDir, 'venv', 'Scripts', 'python.exe')
      );
    } else {
      venvCandidates.push(
        path.join(projectDir, '.venv', 'bin', 'python'),
        path.join(projectDir, 'venv', 'bin', 'python')
      );
    }
  }
  for (const cand of venvCandidates) {
    try {
      if (fsSync.existsSync(cand) && fsSync.statSync(cand).isFile()) return cand;
    } catch {}
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const searchRoots = [
      path.join(localAppData, 'Programs', 'Python'),
      'C:\\',
    ];
    const found = [];
    for (const root of searchRoots) {
      try {
        if (!fsSync.existsSync(root)) continue;
        const entries = fsSync.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || !/^Python3/i.test(entry.name)) continue;
          const exe = path.join(root, entry.name, 'python.exe');
          if (fsSync.existsSync(exe) && fsSync.statSync(exe).isFile()) {
            found.push({ exe, score: parsePyDirVersion(entry.name) });
          }
        }
      } catch {}
    }
    if (found.length > 0) {
      found.sort((a, b) => b.score - a.score);
      return found[0].exe;
    }

    try {
      const out = execFileSync('where.exe', ['python'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 3000,
      });
      const lines = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/WindowsApps/i.test(l));
      for (const line of lines) {
        if (fsSync.existsSync(line) && fsSync.statSync(line).isFile()) {
          return line;
        }
      }
    } catch {}
    return '';
  }

  try {
    const out = execFileSync('which', ['python3'], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const p = out.split(/\r?\n/)[0]?.trim();
    if (p && fsSync.existsSync(p)) return p;
  } catch {}
  return 'python3';
}

function requestLocal(port, method, urlPath, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: Number(port),
        path: urlPath,
        method,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function probeState(port, timeoutMs = 1500) {
  const res = await requestLocal(port, 'GET', '/api/state', timeoutMs);
  if (!res || res.status !== 200) return null;
  try {
    const data = JSON.parse(res.body);
    if (data && typeof data === 'object' && data.compute && data.settings) {
      return data;
    }
  } catch {}
  return null;
}

async function fetchLocalText(port, urlPath, timeoutMs = 8000) {
  const res = await requestLocal(port, 'GET', urlPath, timeoutMs);
  if (!res || res.status < 200 || res.status >= 300) {
    throw new Error(`本地服务请求失败（HTTP ${res ? res.status : 'timeout'}）`);
  }
  return res.body;
}

function createWhisperManager(options = {}) {
  const mainWindow = options.mainWindow || null;
  const dialog = options.dialog || null;
  const shell = options.shell || null;
  const clipboard = options.clipboard || null;
  const settingsFile = options.settingsFile || DEFAULT_SETTINGS_FILE;

  const settings = {
    whisper_project_dir: '',
    whisper_python_path: '',
    whisper_port: 8788,
    whisper_auto_start: true,
    whisper_close_on_exit: true,
    llm_runtime_mode: 'mock',
    llm_base_url: 'http://127.0.0.1:11434/v1',
    llm_model: 'qwen2.5:14b',
    llm_api_key: '',
    llm_system_prompt: '',
  };

  let childProc = null;
  let startingPromise = null;
  let monitorTimer = null;
  let monitorInFlight = false;
  let settingsLoaded = false;
  let stderrTail = '';

  const state = {
    supported: true,
    running: false,
    starting: false,
    managedByUs: false,
    port: 8788,
    url: 'http://127.0.0.1:8788',
    projectDir: '',
    projectExists: false,
    pythonPath: '',
    lastError: '',
    computeStatus: 'offline',
    computeProvider: 'colab',
    computeGpu: '',
    pendingTasks: 0,
    whisperRemoteProvider: 'colab',
    whisperRemoteModel: 'large-v3-turbo',
    whisperRemoteLanguage: 'auto',
  };

  function syncFlags() {
    if (!settings.whisper_project_dir || !isValidWhisperProjectDir(settings.whisper_project_dir)) {
      const detected = autoDetectProjectDir(shell);
      if (detected) {
        settings.whisper_project_dir = detected;
        mergeSettingsFile({ whisper_project_dir: detected }).catch(() => {});
      }
    }
    if (!settings.whisper_python_path || !fsSync.existsSync(settings.whisper_python_path)) {
      const py = autoDetectPythonExe(settings.whisper_project_dir);
      if (py) {
        settings.whisper_python_path = py;
      }
    }

    state.port = settings.whisper_port;
    state.url = `http://127.0.0.1:${settings.whisper_port}`;
    state.projectDir = settings.whisper_project_dir || '';
    state.projectExists = isValidWhisperProjectDir(state.projectDir);
    state.pythonPath = settings.whisper_python_path || '';
  }

  async function mergeSettingsFile(patch) {
    let existing = {};
    try {
      existing = JSON.parse(await fs.readFile(settingsFile, 'utf8')) || {};
    } catch {}
    const merged = { ...existing, ...patch };
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify(merged, null, 2), 'utf8');
  }

  function loadSettingsSync() {
    if (settingsLoaded) return;
    settingsLoaded = true;
    try {
      if (fsSync.existsSync(settingsFile)) {
        const parsed = JSON.parse(fsSync.readFileSync(settingsFile, 'utf8'));
        if (typeof parsed.whisper_project_dir === 'string') {
          settings.whisper_project_dir = parsed.whisper_project_dir.trim();
        }
        if (typeof parsed.whisper_python_path === 'string') {
          settings.whisper_python_path = parsed.whisper_python_path.trim();
        }
        const port = Number(parsed.whisper_port);
        if (Number.isFinite(port) && port >= 1024 && port <= 65535) {
          settings.whisper_port = Math.round(port);
        }
        if (typeof parsed.whisper_auto_start === 'boolean') {
          settings.whisper_auto_start = parsed.whisper_auto_start;
        }
        if (typeof parsed.whisper_close_on_exit === 'boolean') {
          settings.whisper_close_on_exit = parsed.whisper_close_on_exit;
        }
        if (parsed.llm_runtime_mode === 'mock' || parsed.llm_runtime_mode === 'custom_endpoint') {
          settings.llm_runtime_mode = parsed.llm_runtime_mode;
        }
        if (typeof parsed.llm_base_url === 'string') {
          settings.llm_base_url = parsed.llm_base_url.trim();
        }
        if (typeof parsed.llm_model === 'string') {
          settings.llm_model = parsed.llm_model.trim();
        }
        if (typeof parsed.llm_api_key === 'string') {
          settings.llm_api_key = parsed.llm_api_key.trim();
        }
        if (typeof parsed.llm_system_prompt === 'string') {
          settings.llm_system_prompt = parsed.llm_system_prompt;
        }
      }
    } catch {}
    syncFlags();
  }

  function getPublicSnapshot() {
    return {
      ...state,
      settings: { ...settings },
    };
  }

  function emitEvent(eventName = 'whisper-state') {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.webContents.send('whisper:event', {
        event: eventName,
        status: getPublicSnapshot(),
      });
    } catch {}
  }

  function applyRemoteStateSnapshot(snap) {
    if (!snap || !snap.compute) return false;
    const prevKey = `${state.running}|${state.computeStatus}|${state.computeProvider}|${state.computeGpu}|${state.pendingTasks}|${state.whisperRemoteProvider}|${state.whisperRemoteModel}|${state.whisperRemoteLanguage}`;
    state.running = true;
    state.computeStatus = String(snap.compute.status || 'offline');
    state.computeProvider = String(snap.compute.provider || 'colab');
    state.computeGpu = String(snap.compute.gpu || '');
    state.pendingTasks = Number(snap.compute.pending_tasks_count || 0);
    if (snap.settings) {
      state.whisperRemoteProvider = String(snap.settings.provider || 'colab');
      state.whisperRemoteModel = String(snap.settings.whisper_model || 'large-v3-turbo');
      state.whisperRemoteLanguage = String(snap.settings.language || 'auto');
    }
    const nextKey = `${state.running}|${state.computeStatus}|${state.computeProvider}|${state.computeGpu}|${state.pendingTasks}|${state.whisperRemoteProvider}|${state.whisperRemoteModel}|${state.whisperRemoteLanguage}`;
    return prevKey !== nextKey;
  }

  function clearRemoteStateSnapshot() {
    const changed = state.running || state.computeStatus !== 'offline' || state.pendingTasks !== 0;
    state.running = false;
    state.managedByUs = false;
    state.computeStatus = 'offline';
    state.computeGpu = '';
    state.pendingTasks = 0;
    return changed;
  }

  function ensureMonitorRunning() {
    if (monitorTimer) return;
    monitorTimer = setInterval(async () => {
      if (!state.running || monitorInFlight) return;
      monitorInFlight = true;
      try {
        const snap = await probeState(settings.whisper_port, 1800);
        if (snap) {
          const changed = applyRemoteStateSnapshot(snap);
          if (changed) emitEvent('whisper-state');
        } else if (!state.starting) {
          const changed = clearRemoteStateSnapshot();
          stopMonitor();
          if (changed) emitEvent('whisper-exited');
        }
      } finally {
        monitorInFlight = false;
      }
    }, 3000);
  }

  function stopMonitor() {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  }

  async function getStatus() {
    loadSettingsSync();
    syncFlags();
    const snap = await probeState(settings.whisper_port, 1200);
    if (snap) {
      applyRemoteStateSnapshot(snap);
      ensureMonitorRunning();
    } else if (!state.starting) {
      clearRemoteStateSnapshot();
      stopMonitor();
    }
    return getPublicSnapshot();
  }

  async function killChildProcessTree(proc) {
    if (!proc || proc.killed) return;
    const pid = proc.pid;
    let exited = false;
    const waitExit = new Promise((resolve) => {
      const onExit = () => {
        exited = true;
        resolve();
      };
      proc.once('exit', onExit);
      setTimeout(() => {
        proc.removeListener('exit', onExit);
        resolve();
      }, 1500);
    });

    try {
      proc.kill();
    } catch {}
    await waitExit;

    if (!exited && process.platform === 'win32' && pid) {
      try {
        await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
          timeout: 5000,
        });
      } catch {}
    }
  }

  async function start() {
    loadSettingsSync();
    syncFlags();
    if (startingPromise) return startingPromise;

    startingPromise = (async () => {
      state.starting = true;
      state.lastError = '';
      emitEvent('whisper-starting');

      try {
        // 1. Check if Cloud Whisper Studio is already running on this port
        const existing = await probeState(settings.whisper_port, 1200);
        if (existing) {
          state.starting = false;
          state.managedByUs = Boolean(childProc && !childProc.killed);
          applyRemoteStateSnapshot(existing);
          ensureMonitorRunning();
          emitEvent('whisper-started');
          return { ok: true, status: getPublicSnapshot() };
        }

        // 2. Re-validate project directory & Python executable
        syncFlags();
        if (!state.projectExists) {
          state.starting = false;
          state.lastError = '未定位到 Cloud Whisper Studio 项目目录（需含 backend/main.py 与 frontend/index.html）';
          emitEvent('whisper-error');
          return {
            ok: false,
            needsDir: true,
            error: state.lastError,
            status: getPublicSnapshot(),
          };
        }
        if (!state.pythonPath) {
          state.starting = false;
          state.lastError = '未检测到可用的 Python 运行环境，请在设置中指定 python.exe 路径';
          emitEvent('whisper-error');
          return {
            ok: false,
            needsDir: false,
            error: state.lastError,
            status: getPublicSnapshot(),
          };
        }

        // 3. Spawn uvicorn backend headless inside the project directory
        stderrTail = '';
        let procExited = false;
        let spawnError = null;

        const proc = spawn(
          state.pythonPath,
          [
            '-X',
            'utf8',
            '-m',
            'uvicorn',
            'backend.main:app',
            '--host',
            '127.0.0.1',
            '--port',
            String(settings.whisper_port),
            '--log-level',
            'warning',
          ],
          {
            cwd: state.projectDir,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );

        childProc = proc;
        proc.stderr?.on('data', (chunk) => {
          stderrTail = (stderrTail + chunk.toString('utf8')).slice(-400);
        });
        proc.on('error', (err) => {
          spawnError = err;
          procExited = true;
        });
        proc.on('exit', () => {
          procExited = true;
          if (childProc === proc) {
            childProc = null;
          }
          if (!state.starting && state.managedByUs) {
            clearRemoteStateSnapshot();
            stopMonitor();
            emitEvent('whisper-exited');
          }
        });

        // 4. Wait up to 15s for /api/state readiness
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          if (procExited) break;
          const snap = await probeState(settings.whisper_port, 1000);
          if (snap) {
            state.starting = false;
            state.managedByUs = true;
            state.lastError = '';
            applyRemoteStateSnapshot(snap);
            ensureMonitorRunning();
            emitEvent('whisper-started');
            return { ok: true, status: getPublicSnapshot() };
          }
          await new Promise((r) => setTimeout(r, 250));
        }

        state.starting = false;
        state.managedByUs = false;
        if (childProc === proc) {
          await killChildProcessTree(proc);
          childProc = null;
        }
        const detail = spawnError?.message || stderrTail.trim();
        state.lastError = detail
          ? `Cloud Whisper Studio 启动失败：${detail.slice(-220)}`
          : `Cloud Whisper Studio 后端在 15 秒内未响应（端口 ${settings.whisper_port}）`;
        emitEvent('whisper-error');
        return { ok: false, error: state.lastError, status: getPublicSnapshot() };
      } finally {
        state.starting = false;
        startingPromise = null;
      }
    })();

    return startingPromise;
  }

  async function stop() {
    loadSettingsSync();
    stopMonitor();
    state.starting = false;
    if (state.managedByUs && childProc) {
      const proc = childProc;
      childProc = null;
      await killChildProcessTree(proc);
      clearRemoteStateSnapshot();
      emitEvent('whisper-stopped');
    } else {
      const snap = await probeState(settings.whisper_port, 1000);
      if (!snap) {
        clearRemoteStateSnapshot();
        emitEvent('whisper-stopped');
      }
    }
    return { ok: true, status: getPublicSnapshot() };
  }

  async function restart() {
    await stop();
    return start();
  }

  async function shutdown() {
    stopMonitor();
    if (state.managedByUs && settings.whisper_close_on_exit && childProc) {
      const proc = childProc;
      childProc = null;
      await killChildProcessTree(proc);
      clearRemoteStateSnapshot();
    }
  }

  async function pickDir() {
    loadSettingsSync();
    if (!dialog) return { ok: false, canceled: true, status: getPublicSnapshot() };
    const defaultPath =
      settings.whisper_project_dir || path.join(os.homedir(), 'Documents', 'Projects');
    const res = await dialog.showOpenDialog(mainWindow || undefined, {
      title: '选择 Cloud Whisper Studio 项目目录',
      defaultPath,
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) {
      return { ok: false, canceled: true, status: getPublicSnapshot() };
    }
    const chosen = res.filePaths[0];
    if (!isValidWhisperProjectDir(chosen)) {
      return {
        ok: false,
        error: '所选目录不是有效的 Cloud Whisper Studio 工程（缺少 backend/main.py 或 frontend/index.html）',
        status: await getStatus(),
      };
    }
    settings.whisper_project_dir = chosen;
    const py = autoDetectPythonExe(chosen);
    if (py) settings.whisper_python_path = py;
    state.lastError = '';
    syncFlags();
    await mergeSettingsFile({
      whisper_project_dir: chosen,
      ...(py ? { whisper_python_path: py } : {}),
    });
    const st = await getStatus();
    emitEvent('whisper-state');
    return { ok: true, projectDir: chosen, status: st };
  }

  async function saveSettings(patch = {}) {
    loadSettingsSync();
    const diskPatch = {};
    const prevPort = settings.whisper_port;
    const prevDir = settings.whisper_project_dir;

    if (typeof patch.whisper_project_dir === 'string') {
      settings.whisper_project_dir = patch.whisper_project_dir.trim();
      diskPatch.whisper_project_dir = settings.whisper_project_dir;
    }
    if (typeof patch.whisper_python_path === 'string') {
      settings.whisper_python_path = patch.whisper_python_path.trim();
      diskPatch.whisper_python_path = settings.whisper_python_path;
    }
    const port = Number(patch.whisper_port);
    if (Number.isFinite(port) && port >= 1024 && port <= 65535) {
      settings.whisper_port = Math.round(port);
      diskPatch.whisper_port = settings.whisper_port;
    }
    if (typeof patch.whisper_auto_start === 'boolean') {
      settings.whisper_auto_start = patch.whisper_auto_start;
      diskPatch.whisper_auto_start = settings.whisper_auto_start;
    }
    if (typeof patch.whisper_close_on_exit === 'boolean') {
      settings.whisper_close_on_exit = patch.whisper_close_on_exit;
      diskPatch.whisper_close_on_exit = settings.whisper_close_on_exit;
    }
    if (patch.llm_runtime_mode === 'mock' || patch.llm_runtime_mode === 'custom_endpoint') {
      settings.llm_runtime_mode = patch.llm_runtime_mode;
      diskPatch.llm_runtime_mode = settings.llm_runtime_mode;
    }
    if (typeof patch.llm_base_url === 'string') {
      settings.llm_base_url = patch.llm_base_url.trim();
      diskPatch.llm_base_url = settings.llm_base_url;
    }
    if (typeof patch.llm_model === 'string') {
      settings.llm_model = patch.llm_model.trim();
      diskPatch.llm_model = settings.llm_model;
    }
    if (typeof patch.llm_api_key === 'string') {
      settings.llm_api_key = patch.llm_api_key.trim();
      diskPatch.llm_api_key = settings.llm_api_key;
    }
    if (typeof patch.llm_system_prompt === 'string') {
      settings.llm_system_prompt = patch.llm_system_prompt;
      diskPatch.llm_system_prompt = settings.llm_system_prompt;
    }

    syncFlags();
    await mergeSettingsFile(diskPatch);

    if (
      state.managedByUs &&
      (settings.whisper_port !== prevPort || settings.whisper_project_dir !== prevDir)
    ) {
      await stop();
    }
    const st = await getStatus();
    emitEvent('whisper-state');
    return { ok: true, status: st };
  }

  async function saveTranscriptDialog(itemId, fmt) {
    loadSettingsSync();
    if (!itemId) return { ok: false, error: '缺少转录记录 ID' };
    if (!dialog) return { ok: false, error: '对话框不可用' };

    let item;
    try {
      const raw = await fetchLocalText(
        settings.whisper_port,
        `/api/history/${encodeURIComponent(String(itemId))}`
      );
      item = JSON.parse(raw);
    } catch (err) {
      return { ok: false, error: `读取转录记录失败：${err.message}` };
    }

    const ext = fmt === 'srt' ? 'srt' : 'txt';
    const rawName = String(item?.filename || 'transcript');
    let stem = path.parse(rawName).name.trim() || 'transcript';
    stem = stem.replace(/[<>:"/\\|?*]/g, '_');
    const content = ext === 'srt' ? String(item?.srt || '') : String(item?.text || '');
    const desktopDir = path.join(os.homedir(), 'Desktop');
    const filters =
      ext === 'srt'
        ? [{ name: 'SRT 字幕 (*.srt)', extensions: ['srt'] }]
        : [{ name: '纯文本 (*.txt)', extensions: ['txt'] }];

    const res = await dialog.showSaveDialog(mainWindow || undefined, {
      title: '保存转录结果',
      defaultPath: path.join(desktopDir, `${stem}.${ext}`),
      filters,
    });
    if (res.canceled || !res.filePath) {
      return { ok: false, cancelled: true };
    }
    await fs.writeFile(res.filePath, content, 'utf8');
    return { ok: true, path: res.filePath };
  }

  async function saveKaggleNotebookDialog() {
    loadSettingsSync();
    if (!dialog) return { ok: false, error: '对话框不可用' };
    let nbJson;
    try {
      nbJson = await fetchLocalText(settings.whisper_port, '/api/kaggle/notebook');
    } catch (err) {
      return { ok: false, error: `生成笔记本失败：${err.message}` };
    }

    const res = await dialog.showSaveDialog(mainWindow || undefined, {
      title: '导出 Kaggle 备用笔记本',
      defaultPath: path.join(os.homedir(), 'Desktop', 'cloud_whisper_kaggle.ipynb'),
      filters: [{ name: 'Jupyter Notebook (*.ipynb)', extensions: ['ipynb'] }],
    });
    if (res.canceled || !res.filePath) {
      return { ok: false, cancelled: true };
    }
    await fs.writeFile(res.filePath, nbJson, 'utf8');
    return { ok: true, path: res.filePath };
  }

  function copyText(text) {
    if (!clipboard) return { ok: false, error: 'Clipboard unavailable' };
    clipboard.writeText(String(text || ''));
    return { ok: true };
  }

  async function openStandalone() {
    loadSettingsSync();
    syncFlags();
    if (!shell) return { ok: false, error: 'Shell unavailable' };

    const exeInProject = state.projectDir
      ? path.join(state.projectDir, 'Cloud Whisper Studio.exe')
      : '';
    if (exeInProject && fsSync.existsSync(exeInProject)) {
      const err = await shell.openPath(exeInProject);
      if (!err) return { ok: true, mode: 'exe' };
    }

    const desktopLnk = path.join(os.homedir(), 'Desktop', 'Cloud Whisper Studio.lnk');
    if (fsSync.existsSync(desktopLnk)) {
      const err = await shell.openPath(desktopLnk);
      if (!err) return { ok: true, mode: 'shortcut' };
    }

    await shell.openExternal(`http://127.0.0.1:${settings.whisper_port}`);
    return { ok: true, mode: 'browser' };
  }

  async function openOutputsFolder() {
    loadSettingsSync();
    syncFlags();
    if (state.running) {
      const res = await requestLocal(settings.whisper_port, 'POST', '/api/open-outputs', 2000);
      if (res && res.status === 200) return { ok: true };
    }
    if (shell && state.projectDir) {
      const outputsDir = path.join(state.projectDir, 'data', 'outputs');
      await fs.mkdir(outputsDir, { recursive: true }).catch(() => {});
      const err = await shell.openPath(outputsDir);
      if (!err) return { ok: true, path: outputsDir };
    }
    return { ok: false, error: '无法打开输出目录' };
  }

  loadSettingsSync();

  return {
    getStatus,
    start,
    stop,
    restart,
    shutdown,
    pickDir,
    saveSettings,
    saveTranscriptDialog,
    saveKaggleNotebookDialog,
    copyText,
    openStandalone,
    openOutputsFolder,
    isValidWhisperProjectDir,
    autoDetectProjectDir: () => autoDetectProjectDir(shell),
    autoDetectPythonExe,
  };
}

module.exports = { createWhisperManager };
