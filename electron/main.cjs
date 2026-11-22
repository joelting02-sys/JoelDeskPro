const { app, BrowserWindow, clipboard, dialog, ipcMain, screen, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const crypto = require('node:crypto');
const https = require('node:https');
const { startLocalEngine } = require('./localEngine.cjs');
const { createTdmDockManager } = require('./tdmDockManager.cjs');
const { createWhisperManager } = require('./whisperManager.cjs');
const { createMagpieChannel } = require('./magpieChannel.cjs');

let mainWindow = null;
let localEngine = null;
let tdmDockManager = null;
let whisperManager = null;
let magpieChannel = null;
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

// JoelFast 5.0.1 — 自有品牌重命名版（发布在用户自己的 GitHub 仓库 joelting02-sys/JoelFast）
const TDM_INSTALLER = {
  owner: 'joelting02-sys',
  repo: 'JoelFast',
  tag: 'v5.0.1-joel',
  asset: 'JoelFastDownloader_5.0.1_x64.exe',
  sha256: '6033D73B379ED1905CDC568B731D208567B07D9B84B2E99FBF2166B9F47D67D8',
  size: 6430720,
};

function downloadHttps(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const request = https.get(url, { headers: { 'User-Agent': 'JoelDeskPro' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        if (!nextUrl.startsWith('https://')) return reject(new Error('Insecure redirect blocked'));
        return resolve(downloadHttps(nextUrl, destination, redirects + 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Download failed (HTTP ${response.statusCode})`));
      }
      const output = require('node:fs').createWriteStream(destination, { flags: 'wx' });
      response.pipe(output);
      output.on('finish', () => output.close(resolve));
      output.on('error', reject);
    });
    request.setTimeout(30000, () => request.destroy(new Error('Download timed out')));
    request.on('error', reject);
  });
}

async function sha256OfFile(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = await fs.readFile(filePath);
  hash.update(buffer);
  return hash.digest('hex').toUpperCase();
}

async function downloadTdmInstaller() {
  const apiUrl = `https://api.github.com/repos/${TDM_INSTALLER.owner}/${TDM_INSTALLER.repo}/releases/tags/${TDM_INSTALLER.tag}`;
  const response = await fetch(apiUrl, { headers: { 'User-Agent': 'JoelDeskPro', Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub release lookup failed (HTTP ${response.status})`);
  const release = await response.json();
  const asset = Array.isArray(release.assets) ? release.assets.find((item) => item.name === TDM_INSTALLER.asset) : null;
  if (!asset || !Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error('JoelFast package not found on GitHub');

  const destinationDir = path.join(os.homedir(), 'Downloads');
  await fs.mkdir(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, TDM_INSTALLER.asset);
  const partial = `${destination}.${crypto.randomUUID()}.download`;
  try {
    await downloadHttps(asset.browser_download_url, partial);
    const stat = await fs.stat(partial);
    if (TDM_INSTALLER.size && stat.size !== TDM_INSTALLER.size) {
      throw new Error(`Package size mismatch (${stat.size}/${TDM_INSTALLER.size})`);
    }
    const digest = await sha256OfFile(partial);
    if (TDM_INSTALLER.sha256 && digest !== TDM_INSTALLER.sha256.toUpperCase()) {
      throw new Error(`Checksum mismatch (${digest})`);
    }
    await fs.rm(destination, { force: true }).catch(() => {});
    await fs.rename(partial, destination);
    return { ok: true, path: destination, sha256: digest };
  } catch (error) {
    await fs.rm(partial, { force: true }).catch(() => {});
    throw error;
  }
}

function registerTdmIpcHandlers() {
  ipcMain.handle('tdm:status', () => (tdmDockManager ? tdmDockManager.getStatus() : { supported: false }));
  ipcMain.handle('tdm:download-installer', async () => {
    try {
      const result = await downloadTdmInstaller();
      if (result.ok && result.path && tdmDockManager) {
        const saved = await tdmDockManager.saveSettings({ tdm_exe_path: result.path });
        return { ...result, status: saved?.status };
      }
      return result;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
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

function registerMagpieIpcHandlers() {
  ipcMain.handle('magpie:status', (_e, forceRefresh = true) =>
    magpieChannel ? magpieChannel.getStatus(Boolean(forceRefresh)) : { supported: false }
  );
  ipcMain.handle('magpie:save-settings', (_e, patch) =>
    magpieChannel ? magpieChannel.saveSettings(patch) : { ok: false }
  );
  ipcMain.handle('magpie:send', (_e, payload) =>
    magpieChannel ? magpieChannel.sendChat(payload) : { ok: false }
  );
  ipcMain.handle('magpie:stop', (_e, runId) =>
    magpieChannel ? magpieChannel.stopRun(runId) : { ok: false }
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
  registerMagpieIpcHandlers();

  magpieChannel = createMagpieChannel({
    mainWindow,
  });

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

  if (magpieChannel) {
    try {
      await magpieChannel.shutdown();
    } catch {}
    magpieChannel = null;
  }
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
