// The one port browsers talk to — on the POS PC and on waiter tablets over the
// LAN. It stands in for the Supabase API gateway and fronts the Next.js app on
// the same origin, so a tablet only needs http://<pc-ip>:<port>.
//
//   /rest/v1/*      → PostgREST
//   /auth/v1/*      → auth.cjs
//   /storage/v1/*   → storage.cjs
//   /realtime/v1/*  → realtime.cjs (WebSocket + broadcast API)
//   everything else → Next.js
const http = require('node:http')
const net  = require('node:net')
const { PUBLIC_ANON_KEY } = require('./jwt.cjs')
const { bearer, sendJson } = require('./http-util.cjs')

// Parts of the app that only make sense online: the marketing home page, the
// seller panel, the public online menu and table-QR guest ordering (guests
// can't reach the PC), push messages and face-scan selfies. The Android apps
// page too: those apps work with the online system, not with this PC.
const ONLINE_ONLY_PAGE = /^\/(seller(-login)?|order|guest|r|dashboard\/settings\/apps)(\/|\?|$)/
const ONLINE_ONLY_API  = /^\/api\/(seller|push|upload\/selfie)(\/|\?|$)/
const { createAuth } = require('./auth.cjs')
const { createStorage } = require('./storage.cjs')
const { createRealtime } = require('./realtime.cjs')
const { createControl } = require('./control.cjs')

function forwardHeaders(req, extra = {}) {
  const h = { ...req.headers, ...extra }
  h['x-forwarded-for']   = req.socket.remoteAddress || ''
  h['x-forwarded-host']  = req.headers.host || ''
  h['x-forwarded-proto'] = 'http'
  return h
}

function proxy(req, res, port, path, headers) {
  const up = http.request({ host: '127.0.0.1', port, method: req.method, path, headers }, upRes => {
    res.writeHead(upRes.statusCode, upRes.headers)
    upRes.pipe(res)
  })
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '2' })
    res.end('ClickGroup POS is starting — try again in a moment.')
  })
  req.pipe(up)
}

function proxyUpgrade(req, socket, head, port) {
  const up = net.connect(port, '127.0.0.1', () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`
    for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`
    up.write(raw + '\r\n')
    if (head?.length) up.write(head)
    up.pipe(socket)
    socket.pipe(up)
  })
  up.on('error', () => socket.destroy())
  socket.on('error', () => up.destroy())
}

function createGateway({ cfg, pool, log = console.log, autoLicense = null }) {
  const control  = createControl({ cfg, pool, log, autoLicense })
  const auth     = createAuth({ pool, cfg })
  const storage  = createStorage({ cfg })
  const realtime = createRealtime({ cfg, pool, log })

  function rest(req, res) {
    // The build-time placeholder key (or no key) becomes this install's anon key;
    // any other token goes through untouched for PostgREST to verify.
    const token = bearer(req)
    const auth  = !token || token === PUBLIC_ANON_KEY ? `Bearer ${cfg.anonKey}` : req.headers.authorization
    const { apikey, ...rest } = req.headers // eslint-disable-line no-unused-vars
    proxy(req, res, cfg.ports.postgrest, req.url.slice('/rest/v1'.length) || '/',
      forwardHeaders({ ...req, headers: rest }, { authorization: auth }))
  }

  async function route(req, res) {
    const u = req.url
    if (u.startsWith('/offline/v1/')) return control.handle(req, res)
    if (u === '/' || ONLINE_ONLY_PAGE.test(u)) {
      res.writeHead(302, { Location: '/dashboard', 'Cache-Control': 'no-store' })
      return res.end()
    }
    if (ONLINE_ONLY_API.test(u)) return sendJson(res, 404, { error: 'Not available in the offline edition' })
    // Before activation, or once the licence has ended, only the setup /
    // licence screens are reachable.
    const blocked = await control.gate(req)
    if (blocked?.redirect) {
      res.writeHead(302, { Location: blocked.redirect, 'Cache-Control': 'no-store' })
      return res.end()
    }
    if (blocked) return sendJson(res, blocked.status, { error: blocked.error })
    if (u === '/rest/v1' || u.startsWith('/rest/v1/') || u.startsWith('/rest/v1?')) return rest(req, res)
    if (u.startsWith('/auth/v1/'))         return auth(req, res)
    if (u.startsWith('/storage/v1/'))      return storage(req, res)
    if (u.startsWith('/realtime/v1/api/')) return realtime.handleHttp(req, res)
    proxy(req, res, cfg.ports.next, u, forwardHeaders(req))
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch(e => {
      log(`[gateway] ${e.message}`)
      if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong on this PC.' })
      else res.end()
    })
  })

  server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/realtime/v1/')) return realtime.handleUpgrade(req, socket, head)
    proxyUpgrade(req, socket, head, cfg.ports.next) // Next.js dev HMR
  })

  return {
    control,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        // 0.0.0.0 so waiter tablets on the restaurant Wi-Fi can reach the POS PC.
        server.listen(cfg.ports.gateway, '0.0.0.0', () => {
          log(`[gateway] listening on http://0.0.0.0:${cfg.ports.gateway}`)
          resolve()
        })
      })
    },
    async close() {
      await realtime.close()
      server.closeAllConnections?.()
      await new Promise(r => server.close(() => r()))
    },
  }
}

module.exports = { createGateway }
