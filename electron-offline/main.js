// ClickGroup POS — offline edition desktop app.
//
// Runs the whole system on this PC: the backend (PostgreSQL, PostgREST and the
// gateway, offline/runtime/serve.cjs) and the Next.js server, each as a child
// process on Electron's own Node (ELECTRON_RUN_AS_NODE), and shows the app in a
// window. Waiter tablets use the same server over the restaurant Wi-Fi at
// http://<this-pc>:4100. Closing the window keeps the server running for them;
// "Quit" in the tray icon stops everything, PostgreSQL included.
//
// This is a separate app from electron-app/ (the online desktop app).
const { app, BrowserWindow, Tray, Menu, dialog, shell, nativeImage, clipboard, ipcMain } = require('electron')
const { fork } = require('node:child_process')
const fs   = require('node:fs')
const path = require('node:path')
const http = require('node:http')

// The window only ever loads this PC. Windows' proxy auto-detection can stall
// right after start-up and leave the first page loading forever, so skip it.
app.commandLine.appendSwitch('no-proxy-server')

// Packaged: resources/{web,backend}. From source: electron-offline/stage (npm run assemble).
// (Not "app": Electron would load a resources/app folder as itself.)
const RES     = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'stage')
const BACKEND = path.join(RES, 'backend')
const APP_DIR = path.join(RES, 'web')
const { loadConfig, nextEnv } = require(path.join(BACKEND, 'runtime', 'index.cjs'))
const { lanAddresses }        = require(path.join(BACKEND, 'runtime', 'net.cjs'))

const ICON = path.join(__dirname, 'build', 'icon.png')

// ── Data folder ─────────────────────────────────────────────────────────────
// Shared by every Windows user of the PC (the installer lets all users write
// to it), so a cashier logging in as a different user sees the same data.
function pickDataDir() {
  if (process.env.CG_DATA_DIR) return process.env.CG_DATA_DIR
  const shared = path.join(process.env.ProgramData || 'C:\\ProgramData', 'ClickGroup POS Offline')
  try {
    fs.mkdirSync(shared, { recursive: true })
    const probe = path.join(shared, '.write-test')
    fs.writeFileSync(probe, '')
    fs.rmSync(probe)
    return shared
  } catch {
    return path.join(app.getPath('userData'), 'data')
  }
}

const dataDir = pickDataDir()
const cfg = loadConfig({ dataDir, vendorDir: path.join(BACKEND, 'vendor') }) // creates secrets.json on first run
const prefsFile = path.join(dataDir, 'desktop.json')
const prefs = (() => { try { return JSON.parse(fs.readFileSync(prefsFile, 'utf8')) } catch { return {} } })()
const savePrefs = () => fs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2))

const logFile = fs.createWriteStream(path.join(cfg.logDir, 'desktop.log'), { flags: 'a' })
const log = (m) => logFile.write(`${new Date().toISOString()} ${m}\n`)

const HOME_URL = `http://127.0.0.1:${cfg.ports.gateway}/`

// ── Child processes ─────────────────────────────────────────────────────────
let backend = null
let nextServer = null
let quitting = false
let backendReady = false
const pending = new Map()
let nextId = 1

function startBackendProcess() {
  return new Promise((resolve, reject) => {
    backend = fork(path.join(BACKEND, 'runtime', 'serve.cjs'), [], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        CG_DATA_DIR:   dataDir,
        CG_VENDOR_DIR: path.join(BACKEND, 'vendor'),
        ...(prefs.backupDir ? { CG_BACKUP_DIR: prefs.backupDir } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    })
    const out = fs.createWriteStream(path.join(cfg.logDir, 'backend.log'), { flags: 'a' })
    backend.stdout.pipe(out)
    backend.stderr.pipe(out)
    backend.on('message', (m) => {
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
      if (m.type === 'ready') { backendReady = true; resolve() }
      if (m.type === 'fatal') reject(new Error(m.message))
      if (m.type === 'log' && /\[backup\] failed/.test(m.message)) notify('Backup failed', m.message)
    })
    backend.on('exit', (code) => {
      log(`backend exited (${code})`)
      backend = null
      for (const [, done] of pending) done({ ok: false, error: 'The server stopped.' })
      pending.clear()
      reject(new Error('The server stopped while starting — see backend.log'))
      // A failed start already showed its own reason.
      if (!quitting && backendReady) showProblem('The ClickGroup server stopped unexpectedly — see the logs, then Retry.')
      backendReady = false
    })
  })
}

/** Ask the backend process for something; resolves with its { ok, result | error } reply. */
function askBackend(type, extra = {}, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    if (!backend?.connected) return resolve({ ok: false, error: 'The server is not running.' })
    const id = nextId++
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: 'No answer from the server.' }) }, timeoutMs)
    pending.set(id, (m) => { clearTimeout(timer); resolve(m) })
    backend.send({ id, type, ...extra })
  })
}

let nextRestarts = 0
function startNextProcess() {
  nextServer = fork(path.join(APP_DIR, 'server.js'), [], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      ...nextEnv(cfg),
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT:     String(cfg.ports.next),
      HOSTNAME: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  const out = fs.createWriteStream(path.join(cfg.logDir, 'next.log'), { flags: 'a' })
  nextServer.stdout.pipe(out)
  nextServer.stderr.pipe(out)
  nextServer.on('exit', (code) => {
    log(`next exited (${code})`)
    nextServer = null
    // A crash shouldn't take the tablets down: start it again a few times.
    if (!quitting && nextRestarts++ < 5) setTimeout(startNextProcess, 1000)
  })
}

function waitForHttp(url, ms) {
  const until = Date.now() + ms
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, { timeout: 2000 }, (res) => { res.resume(); resolve() })
      req.on('error', retry)
      req.on('timeout', () => { req.destroy(); retry() })
    }
    const retry = () => Date.now() > until ? reject(new Error(`${url} did not answer`)) : setTimeout(tryOnce, 300)
    tryOnce()
  })
}

async function stopAll() {
  if (nextServer) {
    const n = nextServer
    await new Promise((r) => { n.once('exit', r); n.kill(); setTimeout(r, 5000) })
  }
  if (backend) {
    const b = backend
    const exited = new Promise((r) => b.once('exit', r))
    await askBackend('stop', {}, 30000)
    await Promise.race([exited, new Promise((r) => setTimeout(r, 30000))])
    if (b.exitCode === null) b.kill()
  }
}

// ── Windows ─────────────────────────────────────────────────────────────────
let splash = null
let win = null
let tray = null

function showSplash() {
  splash = new BrowserWindow({
    width: 520, height: 360, frame: false, resizable: false, show: false, icon: ICON,
    backgroundColor: '#022658',
    webPreferences: { preload: path.join(__dirname, 'splash-preload.js') },
  })
  splash.loadFile(path.join(__dirname, 'splash.html'))
  splash.once('ready-to-show', () => splash.show())
}

function setSplash(state, text) {
  if (!splash || splash.isDestroyed()) return
  splash.webContents.executeJavaScript(`window.setState(${JSON.stringify(state)}, ${JSON.stringify(text)})`).catch(() => {})
}

function showProblem(text) {
  if (!splash || splash.isDestroyed()) showSplash()
  splash.webContents.once('did-finish-load', () => setSplash('error', text))
  setSplash('error', text)
  win?.hide()
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 860, show: false, icon: ICON, title: 'ClickGroup POS',
    backgroundColor: '#022658', autoHideMenuBar: true,
    // No preload and no Node access: the PC shows the app exactly like a tablet's browser does.
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.removeMenu()
  win.loadURL(HOME_URL)
  win.once('ready-to-show', () => { win.maximize(); win.show(); splash?.destroy(); splash = null })
  // Closing hides the window; the server keeps running for the tablets.
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
    if (!prefs.closeHintShown) {
      notify('Still running', 'ClickGroup POS keeps serving the tablets. Use the tray icon → Quit to stop it.')
      prefs.closeHintShown = true
      savePrefs()
    }
  })
  // Links that leave the app open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(HOME_URL.slice(0, -1))) return { action: 'allow' } // CFD and receipt pop-ups
    shell.openExternal(url)
    return { action: 'deny' }
  })
  // Right after Windows starts, a first load can half fail (a script that
  // didn't arrive leaves an empty page); reload until the app shows.
  let blankReloads = 0
  win.webContents.on('did-finish-load', () => setTimeout(async () => {
    if (!win || win.isDestroyed()) return
    const empty = await win.webContents.executeJavaScript('!document.body || document.body.innerText.trim() === ""').catch(() => true)
    if (!empty) blankReloads = 0
    else if (blankReloads++ < 5) { log('window was empty, reloading'); win.webContents.reload() }
  }, 8000))
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) setTimeout(() => win?.webContents.reload(), 2000) // -3: load replaced by another
  })
  win.webContents.on('render-process-gone', () => win?.webContents.reload())
  // A first page that never finishes (seen once after a Windows restart): start it again.
  const stuckCheck = setInterval(() => {
    if (!win || win.isDestroyed()) return clearInterval(stuckCheck)
    if (!win.webContents.isLoading()) return clearInterval(stuckCheck)
    log('window still loading after 20 s, retrying')
    win.webContents.stop()
    win.loadURL(HOME_URL)
  }, 20000)
  // The window has no menu, so F5 / Ctrl+R are wired by hand, as in a browser.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r'))) {
      e.preventDefault()
      win.webContents.reload()
    }
  })
}

function showWindow() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function notify(title, body) {
  tray?.displayBalloon?.({ title, content: body, iconType: 'info' })
}

// ── Tray ────────────────────────────────────────────────────────────────────
function buildTrayMenu() {
  const lan = lanAddresses().map((ip) => `http://${ip}:${cfg.ports.gateway}`)
  return Menu.buildFromTemplate([
    { label: 'Open ClickGroup POS', click: showWindow },
    { label: 'Reload the window', click: () => { showWindow(); win?.webContents.reload() } },
    { type: 'separator' },
    ...(lan.length
      ? lan.map((u) => ({ label: `Tablets: ${u}  (click to copy)`, click: () => clipboard.writeText(u) }))
      : [{ label: 'Tablets: no network connection', enabled: false }]),
    { type: 'separator' },
    { label: 'Back up now', click: backupNow },
    { label: 'Restore from a backup…', click: restoreFromBackup },
    { label: 'Open backups folder', click: openBackups },
    { label: 'Choose backups folder…', click: chooseBackupDir },
    { type: 'separator' },
    {
      label: 'Start with Windows', type: 'checkbox', checked: prefs.openAtLogin !== false,
      click: (item) => { prefs.openAtLogin = item.checked; savePrefs(); applyLoginItem() },
    },
    { label: 'Open logs folder', click: () => shell.openPath(cfg.logDir) },
    { type: 'separator' },
    { label: 'Quit (stops the server for tablets too)', click: () => app.quit() },
  ])
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }))
  tray.setToolTip('ClickGroup POS Offline')
  tray.on('click', showWindow)
  // Built on each open so the tablet address follows network changes.
  tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()))
}

function applyLoginItem() {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin !== false })
}

// ── Backups ─────────────────────────────────────────────────────────────────
async function backupNow() {
  const r = await askBackend('backup')
  if (r.ok) notify('Backup saved', path.basename(r.result.file))
  else dialog.showErrorBox('Backup failed', r.error)
}

async function openBackups() {
  const r = await askBackend('list-backups')
  const dir = r.ok ? r.result.dir : path.join(dataDir, 'backups')
  fs.mkdirSync(dir, { recursive: true })
  shell.openPath(dir)
}

async function chooseBackupDir() {
  const res = await dialog.showOpenDialog({
    title: 'Where should backups be saved? (a USB stick or another drive is safest)',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (res.canceled || !res.filePaths[0]) return
  prefs.backupDir = res.filePaths[0]
  savePrefs()
  const ok = await dialog.showMessageBox({
    type: 'info', buttons: ['Restart now', 'Later'],
    message: 'Backups will be saved there after ClickGroup POS restarts.',
  })
  if (ok.response === 0) { app.relaunch(); app.quit() }
}

async function restoreFromBackup() {
  const list = await askBackend('list-backups')
  const res = await dialog.showOpenDialog({
    title: 'Choose a ClickGroup POS backup',
    defaultPath: list.ok ? list.result.dir : undefined,
    filters: [{ name: 'ClickGroup POS backup', extensions: ['dump'] }],
    properties: ['openFile'],
  })
  if (res.canceled || !res.filePaths[0]) return
  const confirm = await dialog.showMessageBox({
    type: 'warning', buttons: ['Restore', 'Cancel'], defaultId: 1, cancelId: 1,
    message: `Replace ALL current data with the backup "${path.basename(res.filePaths[0])}"?`,
    detail: 'Everything entered after that backup will be gone. A copy of the current data is saved first, so this can be undone. Tablets will disconnect for a moment.',
  })
  if (confirm.response !== 0) return
  setSplash('busy', 'Restoring backup…')
  const r = await askBackend('restore', { file: res.filePaths[0] })
  if (!r.ok) return dialog.showErrorBox('Restore failed — nothing was changed', r.error)
  win?.webContents.reload()
  dialog.showMessageBox({ type: 'info', message: 'Backup restored.', detail: `The data from before the restore was saved as:\n${r.result.safety}` })
}

// ── Start / quit ────────────────────────────────────────────────────────────
async function boot() {
  showSplash()
  setSplash('busy', 'Starting the database…')
  try {
    await startBackendProcess()
    setSplash('busy', 'Starting ClickGroup POS…')
    startNextProcess()
    await waitForHttp(`http://127.0.0.1:${cfg.ports.next}/`, 90 * 1000)
    createWindow()
  } catch (e) {
    log(`start failed: ${e.message}`)
    const busyPort = /EADDRINUSE|address already in use/i.test(e.message)
    showProblem(busyPort
      ? `Port ${cfg.ports.gateway} is already used by another program — is ClickGroup POS already open, or a development server running?`
      : `ClickGroup POS could not start: ${e.message}`)
  }
}

ipcMain.handle('splash:retry', async () => { quitting = true; await stopAll(); app.relaunch(); app.exit(0) })
ipcMain.handle('splash:logs',  () => shell.openPath(cfg.logDir))
ipcMain.handle('splash:quit',  () => app.quit())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.whenReady().then(() => {
    log(`starting (data: ${dataDir})`)
    createTray()
    applyLoginItem()
    boot()
  })
  // Keep running in the tray when the window is hidden.
  app.on('window-all-closed', () => {})
  app.on('before-quit', (e) => {
    if (quitting) return
    e.preventDefault()
    quitting = true
    setSplash('busy', 'Stopping…')
    stopAll().finally(() => { log('stopped'); app.exit(0) })
  })
}
