const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('joelDesktop', {
  isDesktop: true,
  platform: process.platform,
  tdm: {
    getStatus: () => ipcRenderer.invoke('tdm:status'),
    pickExe: () => ipcRenderer.invoke('tdm:pick-exe'),
    downloadInstaller: () => ipcRenderer.invoke('tdm:download-installer'),
    saveSettings: (patch) => ipcRenderer.invoke('tdm:save-settings', patch),
    attach: (bounds, options) => ipcRenderer.invoke('tdm:attach', bounds, options),
    updateBounds: (bounds) => ipcRenderer.invoke('tdm:bounds', bounds),
    setVisible: (visible, bounds) => ipcRenderer.invoke('tdm:set-visible', visible, bounds),
    detach: () => ipcRenderer.invoke('tdm:detach'),
    relaunch: (bounds) => ipcRenderer.invoke('tdm:relaunch', bounds),
    sendUrl: (payload) => ipcRenderer.invoke('tdm:send-url', payload),
    onEvent: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const handler = (_event, payload) => {
        try {
          listener(payload);
        } catch {}
      };
      ipcRenderer.on('tdm:event', handler);
      return () => ipcRenderer.removeListener('tdm:event', handler);
    },
  },
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
  magpie: {
    getStatus: (forceRefresh = true) => ipcRenderer.invoke('magpie:status', forceRefresh),
    saveSettings: (patch) => ipcRenderer.invoke('magpie:save-settings', patch),
    send: (payload) => ipcRenderer.invoke('magpie:send', payload),
    stop: (runId) => ipcRenderer.invoke('magpie:stop', runId),
    onEvent: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const handler = (_event, payload) => {
        try {
          listener(payload);
        } catch {}
      };
      ipcRenderer.on('magpie:event', handler);
      return () => ipcRenderer.removeListener('magpie:event', handler);
    },
  },
});
