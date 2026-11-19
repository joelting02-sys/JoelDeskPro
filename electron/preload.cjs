const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('joelDesktop', {
  isDesktop: true,
  platform: process.platform,
  tdm: {
    getStatus: () => ipcRenderer.invoke('tdm:status'),
    pickExe: () => ipcRenderer.invoke('tdm:pick-exe'),
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
});
