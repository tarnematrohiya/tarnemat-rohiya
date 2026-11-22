const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bp', {
  isApp: true,
  lite: !!(ipcRenderer.sendSync('edition') || {}).lite,
  platform: process.platform,
  slide: s => ipcRenderer.send('slide', s),
  style: s => ipcRenderer.send('style', s),
  openOutput: () => ipcRenderer.send('open-output'),
  toggleOutputFullscreen: () => ipcRenderer.send('output-fullscreen'),
  key: k => ipcRenderer.send('key', k),
  status: () => ipcRenderer.invoke('status'),
  asrLoad: () => ipcRenderer.send('asr-load'),
  asrAudio: audio => ipcRenderer.send('asr-audio', { audio }),
  asrReset: () => ipcRenderer.send('asr-reset'),
  log: m => ipcRenderer.send('log', String(m)),
  updateNow: () => ipcRenderer.send('update-now'),
  version: () => ipcRenderer.invoke('app-version'),
  meetLoad: () => ipcRenderer.invoke('meet-load'),
  meetSave: d => ipcRenderer.send('meet-save', d),
  whisper: (audio, id) => ipcRenderer.send('whisper-audio', { audio, id }),
  on: (ch, cb) => { if (['slide', 'style', 'status', 'key', 'asr', 'update'].includes(ch)) ipcRenderer.on(ch, (e, d) => cb(d)); }
});
