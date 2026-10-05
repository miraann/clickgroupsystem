// Real-browser walk-through of the offline edition, clicking the actual
// screens: a "PC" browser on 127.0.0.1 and a "tablet" browser on this PC's
// LAN IP, each with its own cookies. Needs `npm run dev`, the fake printer and
// a freshly reset demo restaurant (`npm run seed:demo -- --reset`).
//
//   cd offline && npm run ui-test            (screenshots → offline/.data/ui-test/)
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const data = path.resolve(here, '..', '.data')
const EXE = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p))
const lanIp = process.env.LAN_IP || Object.values(os.networkInterfaces()).flat()
  .find(a => a && a.family === 'IPv4' && !a.internal && /^(192\.168|10|172)\./.test(a.address))?.address
if (!EXE || !lanIp) { console.error('Needs Chrome or Edge and a LAN IPv4 address (or set LAN_IP).'); process.exit(1) }
const PC  = 'http://127.0.0.1:4100'
const TAB = `http://${lanIp}:4100`
const OUT = path.join(data, 'ui-test'); fs.mkdirSync(OUT, { recursive: true })
const PRINTS = path.join(data, 'fake-printer')
const printCount = () => (fs.existsSync(PRINTS) ? fs.readdirSync(PRINTS).length : 0)
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failed = 0
const check = (c, m, d) => { console.log(`  ${c ? '✓' : '✗'} ${m}${!c && d ? ` — ${d}` : ''}`); if (!c) failed++ }

const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-first-run', '--window-size=1366,900'] })

async function makePage(name) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: 1366, height: 900 })
  const problems = []
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`) })
  page.on('pageerror', e => problems.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on('requestfailed', r => { if (!/_next\/webpack-hmr|\.map$/.test(r.url())) problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`) })
  page.on('response', r => { if (r.status() >= 400 && !/favicon|\.map$/.test(r.url())) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`) })
  const cdp = await page.createCDPSession()
  await cdp.send('Network.enable')
  const ws = { opened: [], frames: 0 }
  cdp.on('Network.webSocketCreated', e => ws.opened.push(e.url))
  cdp.on('Network.webSocketFrameReceived', () => ws.frames++)
  return { page, problems, ws, name }
}
const shot = (p, n) => p.page.screenshot({ path: path.join(OUT, `${p.name}-${n}.png`) })
async function typePin(p, pin) {
  await p.page.waitForFunction(() => document.querySelectorAll('button').length > 9, { timeout: 30000 })
  await sleep(500)
  for (const d of pin) { await p.page.keyboard.press(d); await sleep(80) }
}
const tableCounts = (p) => p.page.evaluate(() =>
  [...document.querySelectorAll('header .grid.grid-cols-4 button')].map(b => Number(b.querySelector('span')?.textContent)))

// ── PC: restaurant login → owner PIN → dashboard ──────────────────────────
console.log('PC browser (127.0.0.1)')
const pc = await makePage('pc')
await pc.page.goto(`${PC}/restaurant-login`, { waitUntil: 'networkidle2' })
await pc.page.type('input[type=email]', 'demo@clickgroup.local')
await pc.page.type('input[type=password]', 'demo12345')
await Promise.all([pc.page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), pc.page.click('button[type=submit]')])
check(pc.page.url().includes('/pos/demo/login'), 'email + password → PIN screen', pc.page.url())
await typePin(pc, '123456')
await pc.page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 30000 }).catch(() => {})
check(new URL(pc.page.url()).pathname === '/dashboard', 'owner PIN → dashboard', pc.page.url())
await pc.page.waitForFunction(() => document.querySelectorAll('header .grid.grid-cols-4 button').length === 4, { timeout: 30000 }).catch(() => {})
await sleep(2500)
const before = await tableCounts(pc)
check(before[0] === 8, `dashboard lists the 8 demo tables (available ${before[0]})`, JSON.stringify(before))
const cookiesPc = await pc.page.browserContext().cookies(PC)
check(cookiesPc.some(c => c.name.startsWith('sb-offline-auth-token')), 'browser holds the fixed-name Supabase cookie')
check(pc.ws.opened.some(u => u.includes('/realtime/v1/websocket')), 'realtime websocket opened to the PC', JSON.stringify(pc.ws.opened))
await shot(pc, '1-dashboard')

// ── Tablet: staff PIN → order screen → add item → send → pay ──────────────
console.log(`Tablet browser (${TAB})`)
const tab = await makePage('tablet')
await tab.page.goto(`${TAB}/pos/demo/login`, { waitUntil: 'networkidle2' })
await typePin(tab, '111111')
await tab.page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 30000 }).catch(() => {})
check(!tab.page.url().includes('/login'), `staff PIN → ${new URL(tab.page.url()).pathname}`, tab.page.url())
const cookiesTab = await tab.page.browserContext().cookies(TAB)
check(cookiesTab.some(c => c.name.startsWith('sb-offline-auth-token')), 'tablet holds its Supabase session cookie')

await tab.page.goto(`${TAB}/dashboard/order/3?guests=2`, { waitUntil: 'networkidle2' })
const itemBtn = await tab.page.waitForSelector('::-p-xpath(//button[.//p[normalize-space()="Burger"]])', { timeout: 30000 }).catch(() => null)
check(!!itemBtn, 'order screen shows the menu (Burger)')
await itemBtn?.click(); await sleep(400)
const tea = await tab.page.$('::-p-xpath(//button[.//p[normalize-space()="چا"]])')
await tea?.click(); await sleep(400)
await shot(tab, '2-draft')
const printsBefore = printCount()
const sendBtn = await tab.page.$('::-p-xpath(//button[.//*[contains(@class,"lucide-send")]])')
check(!!sendBtn, 'Send button present')
await sendBtn?.click()
await tab.page.waitForSelector('::-p-xpath(//button[.//*[contains(@class,"lucide-credit-card")]])', { timeout: 20000 }).catch(() => {})
await shot(tab, '3-sent')
for (let i = 0; i < 40 && printCount() <= printsBefore; i++) await sleep(250)
check(printCount() > printsBefore, 'kitchen ticket printed from the tablet (via the PC)')

// PC dashboard should flip table 3 to occupied without a reload.
for (let i = 0; i < 40; i++) { const c = await tableCounts(pc); if (c[1] >= 1) break; await sleep(250) }
const mid = await tableCounts(pc)
check(mid[1] >= 1,`PC dashboard shows the table occupied live (occupied ${mid[1]})`, JSON.stringify(mid))
await shot(pc, '2-live-occupied')

// Pay on the tablet.
const payBtn = await tab.page.$('::-p-xpath(//button[.//*[contains(@class,"lucide-credit-card")]])')
await payBtn?.click()
const bigPay = await tab.page.waitForSelector('button.flex-\\[2\\].font-extrabold', { timeout: 20000 }).catch(() => null)
check(!!bigPay, 'payment screen opens')
await sleep(800)
await shot(tab, '4-payment')
const receiptsBefore = printCount()
await bigPay?.click()
const confirm = await tab.page.waitForSelector('div.z-\\[60\\] button.flex-\\[2\\]', { timeout: 10000 }).catch(() => null)
await confirm?.click()
await tab.page.waitForFunction(() => /✓|Paid|پارە دراو|تم الدفع/.test(document.body.innerText) || location.pathname === '/dashboard', { timeout: 20000 }).catch(() => {})
await sleep(1500)
await shot(tab, '5-paid')
for (let i = 0; i < 40 && printCount() <= receiptsBefore; i++) await sleep(250)
check(printCount() > receiptsBefore, 'receipt printed after payment')

for (let i = 0; i < 40; i++) { const c = await tableCounts(pc); if (c[3] >= 1 && c[1] === 0) break; await sleep(250) }
const after = await tableCounts(pc)
check(after[1] === 0 && after[3] >= 1, `PC dashboard shows the table paid → dirty live (dirty ${after[3]})`, JSON.stringify(after))
await shot(pc, '3-live-dirty')

for (const p of [pc, tab]) {
  const issues = [...new Set(p.problems)]
  console.log(`${p.name}: ${issues.length} browser problem(s), ${p.ws.frames} realtime frames`)
  for (const i of issues.slice(0, 15)) console.log(`   · ${i}`)
}
await browser.close()
console.log(failed ? `${failed} check(s) FAILED` : 'All browser checks passed')
process.exit(failed ? 1 : 0)
