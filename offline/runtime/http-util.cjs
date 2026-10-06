// Small helpers shared by the gateway's built-in services.

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', c => {
      size += c.length
      if (size > limit) { reject(Object.assign(new Error('payload too large'), { status: 413 })); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJson(req, limit) {
  const buf = await readBody(req, limit)
  if (!buf.length) return {}
  try { return JSON.parse(buf.toString('utf8')) } catch { return {} }
}

function sendJson(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
  res.end(data)
}

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : ''
}

module.exports = { readBody, readJson, sendJson, bearer }
