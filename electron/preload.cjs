const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('joelDesktop', {
  isDesktop: true,
  platform: process.platform,
  whisper: {
    getStatus: () => ipcRenderer.invoke('whisper:status'),
    start: () => ipcRenderer.invoke('whisper:start'),
    stop: () => ipcRenderer.invoke('whisper:stop'),
    restart: () => ipcRenderer.invoke('whisper:restart'),
    pickDir: () => ipcRenderer.invoke('whisper:pick-dir'),
    saveSettings: (patch) => ipcRenderer.invoke('whisper:save-settings', patch),
    saveTranscript: (itemId, fmt) => ipcRenderer.invoke('whisper:save-transcript', itemId, fmt),
    saveKaggleNotebook: () => ipcRenderer.invoke('whisper:save-kaggle-nb'),
    copyText: (text) => ipcRenderer.invoke('whisper:copy-text', text),
    openStandalone: () => ipcRenderer.invoke('whisper:open-standalone'),
    openOutputs: () => ipcRenderer.invoke('whisper:open-outputs'),
    onEvent: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const handler = (_event, payload) => {
        try {
          listener(payload);
        } catch {}
      };
      ipcRenderer.on('whisper:event', handler);
      return () => ipcRenderer.removeListener('whisper:event', handler);
    },
  },
});
