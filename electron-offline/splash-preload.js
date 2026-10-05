// Only the start-up / error screen gets these three buttons' worth of access.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  retry: () => ipcRenderer.invoke('splash:retry'),
  logs:  () => ipcRenderer.invoke('splash:logs'),
  quit:  () => ipcRenderer.invoke('splash:quit'),
})
