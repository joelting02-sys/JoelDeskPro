const { app, BrowserWindow, clipboard, dialog, ipcMain, screen, shell, Menu } = require('electron');
const path = require('node:path');
const { startLocalEngine } = require('./localEngine.cjs');
const { createTdmDockManager } = require('./tdmDockManager.cjs');
const { createWhisperManager } = require('./whisperManager.cjs');

let mainWindow = null;
let localEngine = null;
let tdmDockManager = null;
let whisperManager = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Joel Desk Pro',
    backgroundColor: '#F8F9FA',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);

  // Open external links (Colab, Kaggle, GitHub Releases, local OAuth redirects) in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocalApp =
      url.startsWith('file://') ||
      url.startsWith('http://127.0.0.1:3000') ||
      url.startsWith('http://localhost:3000');
    if (!isLocalApp && /^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerTdmIpcHandlers() {
  ipcMain.handle('tdm:status', () => (tdmDockManager ? tdmDockManager.getStatus() : { supported: false }));
  ipcMain.handle('tdm:pick-exe', () =>
    tdmDockManager ? tdmDockManager.pickExe() : { ok: false, canceled: true }
  );
  ipcMain.handle('tdm:save-settings', (_e, patch) =>
    tdmDockManager ? tdmDockManager.saveSettings(patch) : { ok: false }
  );
  ipcMain.handle('tdm:attach', (_e, bounds, options) =>
    tdmDockManager ? tdmDockManager.attach(bounds, options) : { ok: false }
  );
  ipcMain.handle('tdm:bounds', (_e, bounds) =>
    tdmDockManager ? tdmDockManager.updateBounds(bounds) : { ok: false }
  );
  ipcMain.handle('tdm:set-visible', (_e, visible, bounds) =>
    tdmDockManager ? tdmDockManager.setVisible(visible, bounds) : { ok: false }
  );
  ipcMain.handle('tdm:detach', () => (tdmDockManager ? tdmDockManager.detach() : { ok: false }));
  ipcMain.handle('tdm:relaunch', (_e, bounds) =>
    tdmDockManager ? tdmDockManager.relaunch(bounds) : { ok: false }
  );
  ipcMain.handle('tdm:send-url', (_e, payload) =>
    tdmDockManager ? tdmDockManager.sendUrl(payload) : { ok: false }
  );
}

function registerWhisperIpcHandlers() {
  ipcMain.handle('whisper:status', () =>
    whisperManager ? whisperManager.getStatus() : { supported: false }
  );
  ipcMain.handle('whisper:start', () =>
    whisperManager ? whisperManager.start() : { ok: false }
  );
  ipcMain.handle('whisper:stop', () =>
    whisperManager ? whisperManager.stop() : { ok: false }
  );
  ipcMain.handle('whisper:restart', () =>
    whisperManager ? whisperManager.restart() : { ok: false }
  );
  ipcMain.handle('whisper:pick-dir', () =>
    whisperManager ? whisperManager.pickDir() : { ok: false, canceled: true }
  );
  ipcMain.handle('whisper:save-settings', (_e, patch) =>
    whisperManager ? whisperManager.saveSettings(patch) : { ok: false }
  );
  ipcMain.handle('whisper:save-transcript', (_e, itemId, fmt) =>
    whisperManager ? whisperManager.saveTranscriptDialog(itemId, fmt) : { ok: false }
  );
  ipcMain.handle('whisper:save-kaggle-nb', () =>
    whisperManager ? whisperManager.saveKaggleNotebookDialog() : { ok: false }
  );
  ipcMain.handle('whisper:copy-text', (_e, text) =>
    whisperManager ? whisperManager.copyText(text) : { ok: false }
  );
  ipcMain.handle('whisper:open-standalone', () =>
    whisperManager ? whisperManager.openStandalone() : { ok: false }
  );
  ipcMain.handle('whisper:open-outputs', () =>
    whisperManager ? whisperManager.openOutputsFolder() : { ok: false }
  );
}

app.whenReady().then(() => {
  // Start local health & GitHub self-updater backend (127.0.0.1:17890)
  localEngine = startLocalEngine({
    port: 17890,
    isPackaged: app.isPackaged,
    onLaunchInstaller: async (installerPath, isPortable) => {
      if (isPortable) {
        shell.showItemInFolder(installerPath);
      } else {
        const openErr = await shell.openPath(installerPath);
        if (openErr) {
          shell.showItemInFolder(installerPath);
        }
      }
    },
  });

  createWindow();
  registerTdmIpcHandlers();
  registerWhisperIpcHandlers();

  tdmDockManager = createTdmDockManager({
    mainWindow,
    dialog,
    screen,
    isPackaged: app.isPackaged,
  });

  whisperManager = createWhisperManager({
    mainWindow,
    dialog,
    shell,
    clipboard,
    isPackaged: app.isPackaged,
  });

  whisperManager
    .getStatus()
    .then((st) => {
      if (st?.settings?.whisper_auto_start && st.projectExists && !st.running) {
        whisperManager.start().catch(() => {});
      }
    })
    .catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async (event) => {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();

  if (whisperManager) {
    try {
      await whisperManager.shutdown();
    } catch {}
    whisperManager = null;
  }
  if (tdmDockManager) {
    try {
      await tdmDockManager.shutdown();
    } catch {}
    tdmDockManager = null;
  }
  if (localEngine) {
    try {
      localEngine.close();
    } catch {}
    localEngine = null;
  }
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
