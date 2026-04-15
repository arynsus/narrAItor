const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Runtime info
  platform: process.platform,

  // Config
  configGet: (key) => ipcRenderer.invoke('config-get', key),
  configSet: (key, value) => ipcRenderer.invoke('config-set', key, value),

  // Paths
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  getServerReady: () => ipcRenderer.invoke('get-server-ready'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Dialogs
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),

  // Python server management
  restartPython: (pythonPath) => ipcRenderer.invoke('restart-python', pythonPath),
  testPython: (pythonPath) => ipcRenderer.invoke('test-python', pythonPath),

  // Python status events
  onPythonStatus: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on('python-status', handler);
    return () => ipcRenderer.removeListener('python-status', handler);
  },
  onPythonLog: (callback) => {
    const handler = (_, log) => callback(log);
    ipcRenderer.on('python-log', handler);
    return () => ipcRenderer.removeListener('python-log', handler);
  },
});
