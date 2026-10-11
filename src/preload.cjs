const { contextBridge, ipcRenderer } = require('electron');
const allowed = new Set(['snapshot', 'add-downloads', 'add-schedule', 'save-settings', 'probe', 'probe-settings', 'stop', 'retry', 'remove', 'choose-directory', 'choose-executable', 'open-output', 'open-default-output', 'open-official']);
contextBridge.exposeInMainWorld('studio', {
  invoke: async (name, value) => {
    if (!allowed.has(name)) throw new Error('未知操作。');
    const result = await ipcRenderer.invoke(name, value);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
  subscribe: callback => { const handler = (_, state) => callback(state); ipcRenderer.on('state', handler); return () => ipcRenderer.removeListener('state', handler); },
  warnings: callback => ipcRenderer.on('warning', (_, message) => callback(message)),
});
