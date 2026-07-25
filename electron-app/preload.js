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
})
