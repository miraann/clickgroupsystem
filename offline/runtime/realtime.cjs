// The slice of Supabase Realtime the app uses, served at /realtime/v1:
//  - postgres_changes: table triggers (schema/20_offline.sql) NOTIFY on
//    `cg_realtime`; we LISTEN and fan each change out to matching bindings.
//  - broadcast: relayed between sockets joined to the same topic (POS → CFD).
// Speaks the Phoenix protocol realtime-js uses (vsn 2.0.0: JSON-array text
// frames, plus binary frames for user broadcast pushes).
const pg = require('pg')
const { WebSocketServer } = require('ws')
const { verify, PUBLIC_ANON_KEY } = require('./jwt.cjs')
const { readJson, sendJson, bearer } = require('./http-util.cjs')

const FILTER_OPS = {
  eq:  (a, b) => a === b,
  neq: (a, b) => a !== b,
  lt:  (a, b) => Number(a) <  Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  gt:  (a, b) => Number(a) >  Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  in:  (a, b) => b.replace(/^\(|\)$/g, '').split(',').map(s => s.trim()).includes(a),
}

function parseFilter(filter) {
  const m = /^([^=]+)=(eq|neq|lt|lte|gt|gte|in)\.(.*)$/.exec(filter || '')
  return m ? { col: m[1], op: m[2], val: m[3] } : null
}

/** Decode realtime-js's binary "user broadcast push" frame (kind 3). */
function decodeBroadcastPush(buf) {
  if (buf[0] !== 3) return null
  const [joinLen, refLen, topicLen, eventLen, metaLen, encoding] = buf.subarray(1, 7)
  let o = 7
  const take = (n) => { const s = buf.subarray(o, o + n); o += n; return s }
  const join_ref = take(joinLen).toString('utf8') || null
  const ref      = take(refLen).toString('utf8') || null
  const topic    = take(topicLen).toString('utf8')
  const event    = take(eventLen).toString('utf8')
  take(metaLen)
  const body     = buf.subarray(o)
  const payload  = encoding === 1 ? JSON.parse(body.toString('utf8') || 'null') : body
  return { join_ref, ref, topic, event: 'broadcast', payload: { type: 'broadcast', event, payload } }
}

function createRealtime({ cfg, pool, log = console.log }) {
  const secret  = cfg.secrets.jwtSecret
  const wss     = new WebSocketServer({ noServer: true })
  const clients = new Set() // { ws, token, topics: Map<topic, { pg: Binding[], self: boolean, ack: boolean }> }
  let nextBindingId = 1
  let listener = null
  let closed = false

  /** 'anon' | 'authenticated' | 'service_role' for a usable token, else null. */
  function roleOf(token) {
    if (!token || token === PUBLIC_ANON_KEY) return 'anon'
    return verify(token, secret)?.role ?? null
  }

  const send = (c, joinRef, ref, topic, event, payload) => {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify([joinRef ?? null, ref ?? null, topic, event, payload]))
  }
  const reply = (c, m, status, response = {}) => send(c, m.join_ref, m.ref, m.topic, 'phx_reply', { status, response })

  function broadcast(topic, payload, from) {
    for (const c of clients) {
      const sub = c.topics.get(topic)
      if (!sub || (c === from && !sub.self)) continue
      send(c, null, null, topic, 'broadcast', payload)
    }
  }

  function onMessage(c, data, isBinary) {
    let m
    try {
      if (isBinary) m = decodeBroadcastPush(Buffer.from(data))
      else {
        const [join_ref, ref, topic, event, payload] = JSON.parse(data.toString('utf8'))
        m = { join_ref, ref, topic, event, payload }
      }
    } catch { return }
    if (!m) return

    switch (m.event) {
      case 'heartbeat':
        return reply(c, m, 'ok')
      case 'phx_join': {
        const token = m.payload?.access_token || c.token
        const role = roleOf(token)
        // Change feeds skip row-level security, so only signed-in staff sessions may join.
        if (role !== 'authenticated' && role !== 'service_role') {
          return reply(c, m, 'error', { reason: 'Unauthorized: sign in to receive live updates' })
        }
        c.token = token
        const cfgIn = m.payload?.config ?? {}
        const bindings = (cfgIn.postgres_changes ?? []).map(b => ({
          id: nextBindingId++, event: b.event, schema: b.schema, table: b.table, filter: b.filter,
          parsed: parseFilter(b.filter),
        }))
        c.topics.set(m.topic, { pg: bindings, self: !!cfgIn.broadcast?.self, ack: !!cfgIn.broadcast?.ack })
        return reply(c, m, 'ok', {
          postgres_changes: bindings.map(({ id, event, schema, table, filter }) =>
            ({ id, event, schema, table, ...(filter ? { filter } : {}) })),
        })
      }
      case 'phx_leave':
        c.topics.delete(m.topic)
        return reply(c, m, 'ok')
      case 'access_token':
        if (m.payload?.access_token) c.token = m.payload.access_token
        return reply(c, m, 'ok')
      case 'broadcast': {
        const sub = c.topics.get(m.topic)
        if (!sub) return reply(c, m, 'error', { reason: 'not joined' })
        broadcast(m.topic, m.payload, c)
        if (sub.ack) reply(c, m, 'ok')
        return
      }
      default:
        return reply(c, m, 'ok') // presence etc. — accepted, not tracked
    }
  }

  async function onChange(ch) {
    if (ch.truncated && ch.record?.id) {
      // NOTIFY payloads cap at 8 kB; big rows arrive as keys only.
      const { rows } = await pool.query(
        `select to_jsonb(t) as r from ${pg.escapeIdentifier(ch.schema)}.${pg.escapeIdentifier(ch.table)} t where id = $1`,
        [ch.record.id],
      )
      if (rows[0]) ch.record = rows[0].r
    }
    const row = ch.type === 'DELETE' ? ch.old_record : ch.record
    const data = {
      schema: ch.schema, table: ch.table, commit_timestamp: ch.commit_timestamp, type: ch.type,
      record: ch.record ?? {}, old_record: ch.old_record ?? {}, columns: [], errors: null,
    }
    for (const c of clients) {
      for (const [topic, sub] of c.topics) {
        const ids = sub.pg.filter(b =>
          (b.schema === '*' || b.schema === ch.schema) &&
          (!b.table || b.table === '*' || b.table === ch.table) &&
          (b.event === '*' || b.event === ch.type) &&
          (!b.parsed || (row && FILTER_OPS[b.parsed.op](String(row[b.parsed.col]), b.parsed.val)))
        ).map(b => b.id)
        if (ids.length) send(c, null, null, topic, 'postgres_changes', { ids, data })
      }
    }
  }

  async function listen() {
    if (closed) return
    const client = new pg.Client(cfg.pg)
    listener = client
    const retry = () => {
      if (listener !== client) return
      listener = null
      client.end().catch(() => {})
      if (!closed) setTimeout(listen, 1000)
    }
    client.on('error', retry)
    client.on('end', retry)
    client.on('notification', n => {
      let ch
      try { ch = JSON.parse(n.payload) } catch { return }
      onChange(ch).catch(e => log(`[realtime] ${e.message}`))
    })
    try {
      await client.connect()
      await client.query('listen cg_realtime')
    } catch (e) {
      log(`[realtime] listen failed: ${e.message}`)
      retry()
    }
  }
  listen()

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://local')
    const c = { ws, token: url.searchParams.get('apikey'), topics: new Map() }
    clients.add(c)
    ws.on('message', (data, isBinary) => onMessage(c, data, isBinary))
    ws.on('close', () => clients.delete(c))
    ws.on('error', () => clients.delete(c))
  })

  return {
    handleUpgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
    },
    /** POST /realtime/v1/api/broadcast — channel.send() before/without joining. */
    async handleHttp(req, res) {
      const role = roleOf(bearer(req) || req.headers.apikey)
      if (role !== 'authenticated' && role !== 'service_role') return sendJson(res, 401, { message: 'Unauthorized' })
      if (req.method !== 'POST' || !req.url.startsWith('/realtime/v1/api/broadcast')) return sendJson(res, 404, { message: 'Not found' })
      const { messages = [] } = await readJson(req)
      for (const msg of messages) {
        broadcast(`realtime:${msg.topic}`, { type: 'broadcast', event: msg.event, payload: msg.payload }, null)
      }
      res.writeHead(202).end()
    },
    async close() {
      closed = true
      for (const c of clients) c.ws.terminate()
      wss.close()
      const l = listener
      listener = null
      await l?.end().catch(() => {})
    },
  }
}

module.exports = { createRealtime }
