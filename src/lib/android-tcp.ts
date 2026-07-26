// Native Capacitor TcpPlugin bridge — Android only.
// On web/Electron the plugin is undefined and callers fall through to other paths.

export interface AndroidTcpPlugin {
  printBytes:          (o: { host: string; port: number; data: string }) => Promise<{ ok: boolean }>
  printBluetooth:      (o: { address: string; data: string }) => Promise<{ ok: boolean }>
  getBluetoothDevices: () => Promise<{ devices: { name: string; address: string }[]; permissionDenied?: boolean }>
  getSubnet:           () => Promise<{ ip: string; subnet: string }>
  scanNetwork:         (o: { subnet: string; port?: number; timeout?: number }) => Promise<{ devices: { ip: string; port: number; name: string }[] }>
}

export function getAndroidTcp(): AndroidTcpPlugin | null {
  if (typeof window === 'undefined') return null
  return (window as any).Capacitor?.Plugins?.TcpPlugin ?? null
}

export function isAndroidNative(): boolean {
  if (typeof window === 'undefined') return false
  return (window as any).Capacitor?.isNativePlatform() === true
}
