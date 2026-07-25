const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Scan local network for printers on ports 9100, 631, 515
  scanNetwork: () => ipcRenderer.invoke('scan-network'),

  // Send raw ESC/POS bytes to a network printer (TCP)
  printBytes: (base64Bytes, ip, port) =>
    ipcRenderer.invoke('print-bytes', { base64Bytes, ip, port }),

  // Test TCP connectivity to a printer IP:port
  testConnection: (ip, port) =>
    ipcRenderer.invoke('test-connection', { ip, port }),
})
