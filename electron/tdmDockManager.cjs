const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const DEFAULT_SETTINGS_FILE = path.join(os.homedir(), '.joeldeskpro', 'compute-settings.json');

function autoDetectTdmExe() {
  if (process.platform !== 'win32') return '';
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const exactCandidates = [
    path.join(home, 'Desktop', 'JoelFastDownloader_5.0.1_x64.exe'),
    path.join(home, 'Downloads', 'JoelFastDownloader_5.0.1_x64.exe'),
    path.join(localAppData, 'Programs', 'JoelFast', 'JoelFastDownloader_5.0.1_x64.exe'),
    path.join(localAppData, 'JoelFast', 'JoelFastDownloader_5.0.1_x64.exe'),
    path.join(programFiles, 'JoelFast', 'JoelFastDownloader_5.0.1_x64.exe'),
    path.join(home, 'Desktop', 'TDM Fast.exe'),
    path.join(localAppData, 'Programs', 'TDM Fast', 'TDM Fast.exe'),
    path.join(localAppData, 'TDM Fast', 'TDM Fast.exe'),
    path.join(programFiles, 'TDM Fast', 'TDM Fast.exe'),
  ];

  for (const candidate of exactCandidates) {
    try {
      if (candidate && fsSync.existsSync(candidate) && fsSync.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
  }

  const scanDirs = [
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
    path.join(localAppData, 'Programs'),
    localAppData,
    programFiles,
    programFilesX86,
  ];

  // 匹配自有品牌（JoelFast）与旧版 TDM Fast 可执行文件
  const isDownloaderExe = (name) =>
    /joelfast/i.test(name) || /tdm.*fast/i.test(name);

  for (const dir of scanDirs) {
    try {
      if (!dir || !fsSync.existsSync(dir)) continue;
      const entries = fsSync.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /\.exe$/i.test(entry.name)) {
          if (isDownloaderExe(entry.name) && !/setup|unins|install|update/i.test(entry.name)) {
            return path.join(dir, entry.name);
          }
        }
        if (entry.isDirectory() && /joelfast|tdm/i.test(entry.name)) {
          const subDir = path.join(dir, entry.name);
          try {
            const subEntries = fsSync.readdirSync(subDir, { withFileTypes: true });
            for (const sub of subEntries) {
              if (
                sub.isFile() &&
                /\.exe$/i.test(sub.name) &&
                isDownloaderExe(sub.name) &&
                !/setup|unins|install|update/i.test(sub.name)
              ) {
                return path.join(subDir, sub.name);
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  return '';
}

function createTdmDockManager(options = {}) {
  const mainWindow = options.mainWindow || null;
  const dialog = options.dialog || null;
  const screen = options.screen || null;
  const isPackaged = Boolean(options.isPackaged);
  const settingsFile = options.settingsFile || DEFAULT_SETTINGS_FILE;
  const hostHwndOverride = options.hostHwnd || null;
  const onActivated = typeof options.onActivated === 'function' ? options.onActivated : null;
  const siteCookieManager = options.siteCookieManager || null;

  const isSupported = process.platform === 'win32';

  const settings = {
    tdm_exe_path: '',
    tdm_auto_launch: true,
    tdm_close_on_exit: true,
    tdm_hide_on_drag: false,
    tdm_capture_port: 37651,
  };

  let helperProc = null;
  let helperReadyPromise = null;
  let helperStopping = false;
  let stdoutBuffer = '';
  let rpcSeq = 1;
  const pendingRpc = new Map();

  let state = {
    supported: isSupported,
    running: false,
    attached: false,
    visible: false,
    detached: false,
    starting: false,
    pid: 0,
    hwnd: '',
    exePath: '',
    exeExists: false,
    lastError: '',
  };

  let lastRelBounds = null;
  let dragHideTimer = null;
  let dragHidden = false;
  let boundsInFlight = false;
  let boundsPending = false;
  let settingsLoaded = false;

  function loadSettingsSync() {
    if (settingsLoaded) return;
    settingsLoaded = true;
    try {
      if (fsSync.existsSync(settingsFile)) {
        const parsed = JSON.parse(fsSync.readFileSync(settingsFile, 'utf8'));
        if (typeof parsed.tdm_exe_path === 'string') settings.tdm_exe_path = parsed.tdm_exe_path.trim();
        if (typeof parsed.tdm_auto_launch === 'boolean') settings.tdm_auto_launch = parsed.tdm_auto_launch;
        if (typeof parsed.tdm_close_on_exit === 'boolean') settings.tdm_close_on_exit = parsed.tdm_close_on_exit;
        if (typeof parsed.tdm_hide_on_drag === 'boolean') settings.tdm_hide_on_drag = parsed.tdm_hide_on_drag;
        const port = Number(parsed.tdm_capture_port);
        if (Number.isFinite(port) && port >= 1024 && port <= 65535) {
          settings.tdm_capture_port = port;
        }
      }
    } catch {}

    if (!settings.tdm_exe_path || !fsSync.existsSync(settings.tdm_exe_path)) {
      const detected = autoDetectTdmExe();
      if (detected) {
        settings.tdm_exe_path = detected;
        mergeSettingsFile({ tdm_exe_path: detected }).catch(() => {});
      }
    }
    syncExeFlags();
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

  function syncExeFlags() {
    state.exePath = settings.tdm_exe_path || '';
    state.exeExists = Boolean(state.exePath && fsSync.existsSync(state.exePath));
  }

  function resolvePsScriptPath() {
    if (isPackaged && process.resourcesPath) {
      const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'tdm-host.ps1');
      if (fsSync.existsSync(unpacked)) return unpacked;
    }
    return path.join(__dirname, 'tdm-host.ps1');
  }

  function emitToRenderer(payload) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.webContents.send('tdm:event', payload);
    } catch {}
  }

  function getHostHwndString() {
    if (hostHwndOverride) return String(hostHwndOverride);
    if (!mainWindow || mainWindow.isDestroyed()) return '';
    try {
      const buf = mainWindow.getNativeWindowHandle();
      if (buf && buf.length >= 8) {
        return buf.readBigUInt64LE(0).toString();
      }
      if (buf && buf.length >= 4) {
        return String(buf.readUInt32LE(0));
      }
    } catch {}
    return '';
  }

  function toPhysicalRect(relBounds) {
    if (!relBounds) return null;
    const rawX = Math.round(Number(relBounds.x) || 0);
    const rawY = Math.round(Number(relBounds.y) || 0);
    const rawW = Math.max(120, Math.round(Number(relBounds.width ?? relBounds.w) || 800));
    const rawH = Math.max(120, Math.round(Number(relBounds.height ?? relBounds.h) || 600));

    if (!mainWindow || mainWindow.isDestroyed() || !screen) {
      return { x: rawX, y: rawY, w: rawW, h: rawH };
    }

    const cb = mainWindow.getContentBounds();
    const zoom =
      mainWindow.webContents && typeof mainWindow.webContents.getZoomFactor === 'function'
        ? mainWindow.webContents.getZoomFactor()
        : 1;
    const dipRect = {
      x: Math.round(cb.x + rawX * zoom),
      y: Math.round(cb.y + rawY * zoom),
      width: Math.max(120, Math.round(rawW * zoom)),
      height: Math.max(120, Math.round(rawH * zoom)),
    };

    try {
      const phys = screen.dipToScreenRect(mainWindow, dipRect);
      return {
        x: Math.round(phys.x),
        y: Math.round(phys.y),
        w: Math.max(120, Math.round(phys.width)),
        h: Math.max(120, Math.round(phys.height)),
      };
    } catch {
      return {
        x: dipRect.x,
        y: dipRect.y,
        w: dipRect.width,
        h: dipRect.height,
      };
    }
  }

  function handleHelperMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.id !== undefined && pendingRpc.has(msg.id)) {
      const entry = pendingRpc.get(msg.id);
      pendingRpc.delete(msg.id);
      clearTimeout(entry.timer);
      entry.resolve(msg);
      return;
    }

    if (msg.event === 'tdm-exited') {
      state.running = false;
      state.attached = false;
      state.visible = false;
      state.detached = false;
      state.pid = 0;
      state.hwnd = '';
      emitToRenderer({ event: 'tdm-exited', status: getPublicSnapshot() });
      return;
    }

    if (msg.event === 'tdm-hidden-by-user') {
      state.visible = false;
      emitToRenderer({ event: 'tdm-hidden-by-user', status: getPublicSnapshot() });
      return;
    }

    if (msg.event === 'tdm-activated') {
      if (!state.detached) {
        state.visible = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
        if (onActivated) {
          try {
            onActivated();
          } catch {}
        }
        emitToRenderer({ event: 'tdm-activated', status: getPublicSnapshot() });
      }
    }
  }

  function ensureHelper() {
    if (!isSupported) return Promise.resolve(false);
    if (helperProc && !helperProc.killed && helperReadyPromise) {
      return helperReadyPromise;
    }

    const scriptPath = resolvePsScriptPath();
    helperStopping = false;
    stdoutBuffer = '';

    helperReadyPromise = new Promise((resolveReady) => {
      let settled = false;
      const doneReady = (val) => {
        if (!settled) {
          settled = true;
          clearTimeout(readyTimeout);
          resolveReady(val);
        }
      };

      const readyTimeout = setTimeout(() => doneReady(false), 18000);

      helperProc = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-WindowStyle',
          'Hidden',
          '-File',
          scriptPath,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        }
      );

      helperProc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.event === 'ready') {
              doneReady(true);
            } else {
              handleHelperMessage(msg);
            }
          } catch {}
        }
      });

      helperProc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8').trim();
        if (text) state.lastError = text.slice(-240);
      });

      helperProc.on('exit', () => {
        doneReady(false);
        for (const [id, entry] of pendingRpc) {
          clearTimeout(entry.timer);
          entry.resolve({ ok: false, error: 'Helper exited' });
          pendingRpc.delete(id);
        }
        helperProc = null;
        helperReadyPromise = null;
        if (!helperStopping) {
          state.attached = false;
          state.visible = false;
        }
      });

      helperProc.on('error', (err) => {
        state.lastError = err.message;
        doneReady(false);
      });
    });

    return helperReadyPromise;
  }

  async function hostRpc(cmd, payload = {}, timeoutMs = 15000) {
    if (!isSupported) return { ok: false, error: 'Windows only' };
    const ready = await ensureHelper();
    if (!ready || !helperProc || !helperProc.stdin || helperProc.stdin.destroyed) {
      return { ok: false, error: state.lastError || 'TDM Win32 helper unavailable' };
    }

    const id = rpcSeq++;
    const line = JSON.stringify({ id, cmd, ...payload }) + '\n';

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingRpc.delete(id);
        resolve({ ok: false, error: `Command "${cmd}" timed out` });
      }, timeoutMs);

      pendingRpc.set(id, { resolve, timer });
      try {
        helperProc.stdin.write(line, 'utf8');
      } catch (err) {
        clearTimeout(timer);
        pendingRpc.delete(id);
        resolve({ ok: false, error: err.message });
      }
    });
  }

  function getPublicSnapshot() {
    loadSettingsSync();
    syncExeFlags();
    return {
      ...state,
      settings: { ...settings },
    };
  }

  async function getStatus() {
    loadSettingsSync();
    syncExeFlags();
    if (!isSupported) return getPublicSnapshot();
    const res = await hostRpc('status', { exePath: settings.tdm_exe_path }, 8000);
    if (res && res.ok) {
      state.running = Boolean(res.running);
      state.attached = Boolean(res.attached);
      state.visible = Boolean(res.visible);
      state.pid = Number(res.pid || 0);
      state.hwnd = res.hwnd || '';
      state.exeExists = Boolean(res.exeExists);
    }
    return getPublicSnapshot();
  }

  async function pickExe() {
    loadSettingsSync();
    if (!dialog) return { ok: false, canceled: true, status: getPublicSnapshot() };
    const defaultPath = settings.tdm_exe_path || path.join(os.homedir(), 'Desktop');
    const res = await dialog.showOpenDialog(mainWindow || undefined, {
      title: '选择 JoelFast 可执行程序 (.exe)',
      defaultPath,
      filters: [{ name: 'Executable (*.exe)', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) {
      return { ok: false, canceled: true, status: getPublicSnapshot() };
    }
    const chosen = res.filePaths[0];
    settings.tdm_exe_path = chosen;
    state.lastError = '';
    syncExeFlags();
    await mergeSettingsFile({ tdm_exe_path: chosen });
    return { ok: true, exePath: chosen, status: await getStatus() };
  }

  async function saveSettings(patch = {}) {
    loadSettingsSync();
    const diskPatch = {};
    if (typeof patch.tdm_exe_path === 'string') {
      settings.tdm_exe_path = patch.tdm_exe_path.trim();
      diskPatch.tdm_exe_path = settings.tdm_exe_path;
    }
    if (typeof patch.tdm_auto_launch === 'boolean') {
      settings.tdm_auto_launch = patch.tdm_auto_launch;
      diskPatch.tdm_auto_launch = settings.tdm_auto_launch;
    }
    if (typeof patch.tdm_close_on_exit === 'boolean') {
      settings.tdm_close_on_exit = patch.tdm_close_on_exit;
      diskPatch.tdm_close_on_exit = settings.tdm_close_on_exit;
    }
    if (typeof patch.tdm_hide_on_drag === 'boolean') {
      settings.tdm_hide_on_drag = patch.tdm_hide_on_drag;
      diskPatch.tdm_hide_on_drag = settings.tdm_hide_on_drag;
    }
    const port = Number(patch.tdm_capture_port);
    if (Number.isFinite(port) && port >= 1024 && port <= 65535) {
      settings.tdm_capture_port = port;
      diskPatch.tdm_capture_port = port;
    }
    syncExeFlags();
    await mergeSettingsFile(diskPatch);
    if (helperProc && !helperProc.killed) {
      await hostRpc('config', { closeOnExit: settings.tdm_close_on_exit });
    }
    return { ok: true, status: await getStatus() };
  }

  async function attach(relBounds, attachOpts = {}) {
    loadSettingsSync();
    syncExeFlags();
    if (!isSupported) return { ok: false, error: 'Unsupported platform', status: getPublicSnapshot() };
    if (relBounds) lastRelBounds = relBounds;
    if (!state.exeExists) {
      state.lastError = 'JoelFast executable path not configured or missing';
      return { ok: false, error: state.lastError, status: getPublicSnapshot() };
    }

    state.starting = true;
    state.detached = false;
    state.lastError = '';
    const visible = attachOpts.visible !== undefined ? Boolean(attachOpts.visible) : true;
    const autoLaunch =
      attachOpts.autoLaunch !== undefined ? Boolean(attachOpts.autoLaunch) : settings.tdm_auto_launch;
    const phys = toPhysicalRect(lastRelBounds || { x: 240, y: 60, width: 900, height: 640 });

    const res = await hostRpc(
      'attach',
      {
        hostHwnd: getHostHwndString(),
        exePath: settings.tdm_exe_path,
        autoLaunch,
        visible,
        x: phys.x,
        y: phys.y,
        w: phys.w,
        h: phys.h,
        closeOnExit: settings.tdm_close_on_exit,
      },
      18000
    );

    state.starting = false;
    if (res && res.ok) {
      state.running = Boolean(res.running);
      state.attached = Boolean(res.attached);
      state.visible = visible && Boolean(res.visible !== false);
      state.pid = Number(res.pid || 0);
      state.hwnd = res.hwnd || '';
      state.lastError = '';
      return { ok: true, status: getPublicSnapshot(), phys };
    }
    state.lastError = (res && res.error) || 'Failed to attach JoelFast';
    return { ok: false, error: state.lastError, status: getPublicSnapshot() };
  }

  async function updateBounds(relBounds) {
    if (relBounds) lastRelBounds = relBounds;
    if (!isSupported || !state.attached || state.detached || !state.visible) return { ok: true };
    if (boundsInFlight) {
      boundsPending = true;
      return { ok: true };
    }
    boundsInFlight = true;
    let lastPhys = null;
    try {
      do {
        boundsPending = false;
        const phys = toPhysicalRect(lastRelBounds);
        if (!phys) return { ok: false };
        lastPhys = phys;
        await hostRpc('bounds', { x: phys.x, y: phys.y, w: phys.w, h: phys.h, show: true });
      } while (boundsPending && state.attached && !state.detached && state.visible);
    } finally {
      boundsInFlight = false;
    }
    return { ok: true, phys: lastPhys };
  }

  async function setVisible(visible, relBounds) {
    loadSettingsSync();
    if (relBounds) lastRelBounds = relBounds;
    if (!isSupported) return { ok: true, status: getPublicSnapshot() };
    if (state.detached) {
      return { ok: true, status: getPublicSnapshot() };
    }
    if (!visible) {
      state.visible = false;
      if (state.attached) {
        await hostRpc('hide');
      }
      return { ok: true, status: getPublicSnapshot() };
    }

    if (!state.attached) {
      return attach(lastRelBounds, { autoLaunch: settings.tdm_auto_launch, visible: true });
    }
    state.visible = true;
    const phys = toPhysicalRect(lastRelBounds || { x: 240, y: 60, width: 900, height: 640 });
    await hostRpc('show', { x: phys.x, y: phys.y, w: phys.w, h: phys.h, activate: false });
    return { ok: true, status: getPublicSnapshot() };
  }

  async function detach() {
    if (!isSupported) return { ok: true, status: getPublicSnapshot() };
    state.detached = true;
    state.visible = false;
    if (state.attached) {
      await hostRpc('detach');
      state.attached = false;
    }
    return { ok: true, status: getPublicSnapshot() };
  }

  async function relaunch(relBounds) {
    loadSettingsSync();
    syncExeFlags();
    if (relBounds) lastRelBounds = relBounds;
    state.detached = false;
    return attach(lastRelBounds, { autoLaunch: true, visible: true });
  }

  async function sendUrl(payload = {}) {
    loadSettingsSync();
    syncExeFlags();
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (!url) return { ok: false, error: 'Missing URL' };

    const status = await getStatus();
    if (!status.running) {
      if (!status.exeExists) {
        return { ok: false, needsExe: true, error: 'JoelFast executable not configured' };
      }
      await attach(lastRelBounds, { autoLaunch: true, visible: Boolean(lastRelBounds) });
    }

    const endpoint = `http://127.0.0.1:${settings.tdm_capture_port}/capture`;
    let cookieMatch = { cookies: [], referer: '' };
    if (siteCookieManager && typeof siteCookieManager.getCookiesForUrl === 'function') {
      try {
        const resMatch = await siteCookieManager.getCookiesForUrl(url);
        if (resMatch && Array.isArray(resMatch.cookies)) {
          cookieMatch = resMatch;
        }
      } catch {}
    }

    const effectiveReferer = payload.referer || cookieMatch.referer || undefined;
    const bodyObj = {
      url,
      filename: payload.filename || payload.fileName || undefined,
      referer: effectiveReferer,
      headers: effectiveReferer ? { Referer: effectiveReferer } : undefined,
    };
    if (cookieMatch.cookies.length > 0) {
      bodyObj.cookies = cookieMatch.cookies;
    }
    const bodyJson = JSON.stringify(bodyObj);

    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyJson,
        });
        if (res.ok) {
          return { ok: true, cookiesAttached: cookieMatch.cookies.length };
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }

    return { ok: false, error: `JoelFast capture endpoint unavailable on port ${settings.tdm_capture_port}` };
  }

  function hookWindowEvents() {
    if (!mainWindow || !isSupported) return;

    const syncNow = () => {
      if (state.attached && !state.detached && state.visible && lastRelBounds && !dragHidden) {
        updateBounds(lastRelBounds).catch(() => {});
      }
    };

    const handleDragStart = () => {
      if (!settings.tdm_hide_on_drag) return;
      if (state.attached && !state.detached && state.visible && !dragHidden) {
        dragHidden = true;
        hostRpc('hide').catch(() => {});
      }
    };

    const scheduleDragRestore = () => {
      if (settings.tdm_hide_on_drag && dragHidden) {
        if (dragHideTimer) clearTimeout(dragHideTimer);
        dragHideTimer = setTimeout(() => {
          dragHidden = false;
          if (state.attached && !state.detached && state.visible && lastRelBounds) {
            const phys = toPhysicalRect(lastRelBounds);
            hostRpc('show', { x: phys.x, y: phys.y, w: phys.w, h: phys.h, activate: false }).catch(() => {});
          }
        }, 140);
        return;
      }
      syncNow();
    };

    mainWindow.on('will-move', handleDragStart);
    mainWindow.on('will-resize', handleDragStart);
    mainWindow.on('move', scheduleDragRestore);
    mainWindow.on('resize', scheduleDragRestore);
    mainWindow.on('maximize', () => setTimeout(syncNow, 40));
    mainWindow.on('unmaximize', () => setTimeout(syncNow, 40));
    mainWindow.on('enter-full-screen', () => setTimeout(syncNow, 60));
    mainWindow.on('leave-full-screen', () => setTimeout(syncNow, 60));

    mainWindow.on('minimize', () => {
      if (state.attached && !state.detached && state.visible) {
        hostRpc('hide').catch(() => {});
      }
    });

    const handleRestore = () => {
      if (state.attached && !state.detached && state.visible && lastRelBounds) {
        setTimeout(() => {
          if (state.attached && !state.detached && state.visible && lastRelBounds) {
            const phys = toPhysicalRect(lastRelBounds);
            hostRpc('show', { x: phys.x, y: phys.y, w: phys.w, h: phys.h, activate: false }).catch(() => {});
          }
        }, 90);
      }
    };

    mainWindow.on('restore', handleRestore);
    mainWindow.on('show', handleRestore);
  }

  async function shutdown() {
    helperStopping = true;
    if (dragHideTimer) clearTimeout(dragHideTimer);
    if (!isSupported || !helperProc || helperProc.killed) return;
    try {
      await hostRpc('shutdown', { closeTdm: settings.tdm_close_on_exit }, 1800);
    } catch {}
    try {
      if (helperProc && !helperProc.killed) {
        helperProc.kill();
      }
    } catch {}
  }

  loadSettingsSync();
  if (isSupported && !options.lazyHelper) {
    ensureHelper().catch(() => {});
  }
  hookWindowEvents();

  return {
    getStatus,
    pickExe,
    saveSettings,
    attach,
    updateBounds,
    setVisible,
    detach,
    relaunch,
    sendUrl,
    shutdown,
    toPhysicalRect,
    getPublicSnapshot,
  };
}

module.exports = { createTdmDockManager, autoDetectTdmExe };
