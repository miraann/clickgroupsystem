const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron')
const net  = require('net')
const os   = require('os')
const path = require('path')
const { exec } = require('child_process')

const APP_URL      = 'https://clickgroupsystem.vercel.app/dashboard'
const PRINTER_PORTS = [9100, 631, 515]
const SCAN_TIMEOUT  = 300  // ms per port probe
const BATCH_SIZE    = 40   // concurrent host probes

let mainWindow = null
let tray       = null

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth:  900,
    minHeight: 600,
    title: 'ClickGroup POS',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload:         path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  mainWindow.loadURL(APP_URL)
  mainWindow.setMenuBarVisibility(false)

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── System tray ───────────────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'))
  tray = new Tray(icon)
  tray.setToolTip('ClickGroup POS')

  const menu = Menu.buildFromTemplate([
    { label: 'Open ClickGroup POS', click: () => { mainWindow.show(); mainWindow.focus() } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } },
  ])

  tray.setContextMenu(menu)
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus() })
}

// ── Network scan ─────────────────────────────────────────────────────────────
function getLocalSubnets() {
  const subnets = new Set()
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of (iface || [])) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const [a, b, c] = addr.address.split('.')
        subnets.add(`${a}.${b}.${c}`)
      }
    }
  }
  return Array.from(subnets)
}

function probePort(ip, port) {
  return new Promise(resolve => {
    const sock = new net.Socket()
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(SCAN_TIMEOUT)
    sock.on('connect', () => finish(true))
    sock.on('error',   () => finish(false))
    sock.on('timeout', () => finish(false))
    sock.connect(port, ip)
  })
}

async function scanNetwork() {
  const subnets = getLocalSubnets()
  if (!subnets.length) return []

  const found = []

  for (const subnet of subnets) {
    const hosts = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`)

    for (let i = 0; i < hosts.length; i += BATCH_SIZE) {
      const batch = hosts.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async ip => {
          const checks   = await Promise.all(PRINTER_PORTS.map(p => probePort(ip, p)))
          const openPort = PRINTER_PORTS.find((_, j) => checks[j])
          return openPort ? { ip, port: openPort } : null
        })
      )
      for (const r of results) {
        if (r) found.push(r)
      }
    }
  }

  return found.map(({ ip, port }) => ({
    id:              `net-${ip.replace(/\./g, '-')}-${port}`,
    name:            `Network Printer (${ip})`,
    ip,
    port,
    connection_type: 'network',
    status:          'online',
  }))
}

// ── USB / system printer scan (Windows WMI) ───────────────────────────────────
function scanSystemPrinters() {
  return new Promise(resolve => {
    const ps = `powershell -NoProfile -NonInteractive -Command "` +
      `Get-WmiObject Win32_Printer | ` +
      `Select-Object Name,PortName,PrinterStatus,Shared | ` +
      `ConvertTo-Json -Compress"`
    exec(ps, { timeout: 10000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout.trim()) { resolve([]); return }
      try {
        let list = JSON.parse(stdout.trim())
        if (!Array.isArray(list)) list = [list]
        const devices = list.map(p => {
          const port    = (p.PortName || '').toUpperCase()
          const isUsb   = port.startsWith('USB')
          const isNet   = port.startsWith('IP_') || port.includes('.')
          const ready   = p.PrinterStatus === 3  // 3 = Idle/Ready
          return {
            id:              `sys-${(p.Name || '').replace(/[^a-z0-9]/gi, '-')}`,
            name:            p.Name || 'Unknown Printer',
            connection_type: isUsb ? 'usb' : isNet ? 'network' : 'usb',
            port_name:       p.PortName || '',
            status:          ready ? 'online' : 'offline',
          }
        })
        resolve(devices)
      } catch { resolve([]) }
    })
  })
}

// ── Windows raw USB/printer print ────────────────────────────────────────────
// Sends raw ESC/POS bytes to a Windows-installed printer by name.
// Works for USB thermal printers that accept raw mode (no dialog shown).
function printWindowsPrinter(base64Bytes, printerName) {
  return new Promise((resolve, reject) => {
    const bytes   = Buffer.from(base64Bytes, 'base64')
    const tmpFile = path.join(os.tmpdir(), `pos-ticket-${Date.now()}.bin`)
    require('fs').writeFile(tmpFile, bytes, err => {
      if (err) { reject(err); return }
      // PowerShell raw print via .NET RawPrint helper — most reliable for USB thermal printers
      const ps = [
        `$bytes = [System.IO.File]::ReadAllBytes('${tmpFile.replace(/'/g, "''")}')`,
        `$prn = New-Object System.IO.StreamWriter("\\\\\\\\localhost\\\\${printerName.replace(/'/g, "''")}",`,
        `  $false, [System.Text.Encoding]::Default)`,
        `$prn.BaseStream.Write($bytes, 0, $bytes.Length)`,
        `$prn.Flush(); $prn.Close()`,
      ].join('; ')

      // Simpler: use copy /b which works for most raw-mode printers
      const copyCmd = `cmd /c copy /b "${tmpFile}" "\\\\\\\\localhost\\\\${printerName}"`
      exec(copyCmd, { timeout: 10000, windowsHide: true }, (err2, _stdout, stderr) => {
        require('fs').unlink(tmpFile, () => {})
        if (err2) {
          reject(new Error(stderr?.trim() || err2.message))
        } else {
          resolve({ ok: true })
        }
      })
    })
  })
}

// ── TCP print ─────────────────────────────────────────────────────────────────
function printBytes(base64Bytes, ip, port) {
  return new Promise((resolve, reject) => {
    const bytes = Buffer.from(base64Bytes, 'base64')
    const sock  = new net.Socket()

    sock.setTimeout(8000)
    sock.connect(port, ip, () => {
      sock.write(bytes, () => {
        sock.end()
        resolve({ ok: true })
      })
    })
    sock.on('error',   (e) => reject(new Error(`TCP error: ${e.message}`)))
    sock.on('timeout', ()  => { sock.destroy(); reject(new Error('Connection timed out')) })
  })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Register IPC handlers inside whenReady to ensure main process context
  ipcMain.handle('scan-network', async () => {
    try {
      return { devices: await scanNetwork() }
    } catch (e) {
      return { devices: [], error: e.message }
    }
  })

  ipcMain.handle('print-bytes', async (_, { base64Bytes, ip, port }) => {
    try {
      return await printBytes(base64Bytes, ip, port)
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('scan-usb', async () => {
    try {
      return { devices: await scanSystemPrinters() }
    } catch (e) {
      return { devices: [], error: e.message }
    }
  })

  ipcMain.handle('print-windows-printer', async (_, { base64Bytes, printerName }) => {
    try {
      return await printWindowsPrinter(base64Bytes, printerName)
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('test-connection', async (_, { ip, port }) => {
    return new Promise(resolve => {
      const sock = new net.Socket()
      let done = false
      const finish = (ok, err) => {
        if (done) return
        done = true
        sock.destroy()
        resolve(ok ? { ok: true } : { ok: false, error: err })
      }
      sock.setTimeout(5000)
      sock.on('connect', () => finish(true))
      sock.on('error',   (e) => finish(false, e.message))
      sock.on('timeout', ()  => finish(false, `Connection timed out (${ip}:${port})`))
      sock.connect(port, ip)
    })
  })

  createWindow()
  createTray()
})

app.on('window-all-closed', (e) => {
  e.preventDefault() // Keep app running in tray
})

app.on('activate', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus() }
})
