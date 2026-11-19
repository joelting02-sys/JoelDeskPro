const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const { startLocalEngine } = require('./localEngine.cjs');

let mainWindow = null;
let localEngine = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
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
    const isLocalApp = url.startsWith('file://') || url.startsWith('http://127.0.0.1:3000') || url.startsWith('http://localhost:3000');
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

app.whenReady().then(() => {
  // Automatically start built-in multi-chunk downloader & Colab/Kaggle compute proxy
  localEngine = startLocalEngine({
    port: 17890,
    onPickFolder: async (defaultPath) => {
      const res = await dialog.showOpenDialog(mainWindow || undefined, {
        title: 'Select Download Folder',
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
      return res.filePaths[0];
    },
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (localEngine) {
    localEngine.close();
    localEngine = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
