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

  // Enumerate OS-installed printers (USB + network) via WMI — Windows only
  scanUsb: () => ipcRenderer.invoke('scan-usb'),

  // Print raw ESC/POS bytes to a Windows-installed USB printer by name (no dialog)
  printWindowsPrinter: (base64Bytes, printerName) =>
    ipcRenderer.invoke('print-windows-printer', { base64Bytes, printerName }),

  // In-app updates (electron-updater) — driven by Settings → Advanced
  updates: {
    getVersion: () => ipcRenderer.invoke('updates:getVersion'),
    check:      () => ipcRenderer.invoke('updates:check'),
    download:   () => ipcRenderer.invoke('updates:download'),
    install:    () => ipcRenderer.invoke('updates:install'),
    // Returns a disposer so the renderer can detach on unmount.
    onEvent: (cb) => {
      const handler = (_e, data) => cb(data)
      ipcRenderer.on('updates:event', handler)
      return () => ipcRenderer.removeListener('updates:event', handler)
    },
  },
})
