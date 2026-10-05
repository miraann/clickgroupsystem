// The slice of Supabase Storage the app uses, served at /storage/v1 and kept
// as plain files under <dataDir>/storage/<bucket>/<path>.
const fs     = require('node:fs')
const path   = require('node:path')
const crypto = require('node:crypto')
const { sign, verify } = require('./jwt.cjs')
const { readBody, readJson, sendJson, bearer } = require('./http-util.cjs')

// Everything else is served publicly, like the cloud's public buckets.
const PRIVATE_BUCKETS = new Set(['customer-selfies', 'receipts'])

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.pdf': 'application/pdf',
}

function createStorage({ cfg }) {
  const root   = cfg.storageDir
  const secret = cfg.secrets.jwtSecret
  fs.mkdirSync(root, { recursive: true })

  /** Absolute file path for bucket/key, or null if it would escape the root. */
  function fileFor(bucket, key) {
    const p = path.resolve(root, bucket, key)
    return p.startsWith(path.resolve(root) + path.sep) ? p : null
  }

  function serveFile(res, file) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return sendJson(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'public, max-age=3600',
      })
      fs.createReadStream(file).pipe(res)
    })
  }

  const isSignedIn = (req) => {
    const c = verify(bearer(req), secret)
    return c && (c.role === 'authenticated' || c.role === 'service_role')
  }

  async function upload(req, res, bucket, key) {
    const file = fileFor(bucket, key)
    if (!file) return sendJson(res, 400, { error: 'invalid_key', message: 'Invalid key' })
    if (req.method === 'POST' && req.headers['x-upsert'] !== 'true' && fs.existsSync(file)) {
      return sendJson(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' })
    }
    let data = await readBody(req)
    // Browsers send a Blob as multipart/form-data; let undici parse it.
    if (String(req.headers['content-type'] || '').startsWith('multipart/form-data')) {
      const form = await new Response(data, { headers: { 'content-type': req.headers['content-type'] } }).formData()
      const part = [...form.values()].find(v => typeof v === 'object')
      data = part ? Buffer.from(await part.arrayBuffer()) : Buffer.alloc(0)
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, data)
    sendJson(res, 200, { Key: `${bucket}/${key}`, Id: crypto.randomUUID() })
  }

  return async function handle(req, res) {
    const url   = new URL(req.url, 'http://local')
    const parts = url.pathname.replace(/^\/storage\/v1\/?/, '').split('/').map(decodeURIComponent)
    try {
      if (parts[0] !== 'object') return sendJson(res, 404, { error: 'not_found', message: 'Not available offline' })
      const [, a, b, ...rest] = parts

      // GET /object/public/<bucket>/<key>
      if (req.method === 'GET' && a === 'public') {
        if (PRIVATE_BUCKETS.has(b)) return sendJson(res, 400, { error: 'not_found', message: 'Bucket not found' })
        const file = fileFor(b, rest.join('/'))
        return file ? serveFile(res, file) : sendJson(res, 400, { error: 'invalid_key' })
      }
      // POST /object/sign/<bucket>/<key>  → { signedURL }
      if (req.method === 'POST' && a === 'sign') {
        if (!isSignedIn(req)) return sendJson(res, 403, { error: 'Unauthorized', message: 'Unauthorized' })
        const key = rest.join('/')
        const { expiresIn = 3600 } = await readJson(req)
        const now = Math.floor(Date.now() / 1000)
        const token = sign({ url: `${b}/${key}`, iat: now, exp: now + Number(expiresIn) }, secret)
        return sendJson(res, 200, { signedURL: `/object/sign/${encodeURIComponent(b)}/${key.split('/').map(encodeURIComponent).join('/')}?token=${token}` })
      }
      // GET /object/sign/<bucket>/<key>?token=
      if (req.method === 'GET' && a === 'sign') {
        const claims = verify(url.searchParams.get('token'), secret)
        const key = rest.join('/')
        if (!claims || claims.url !== `${b}/${key}`) return sendJson(res, 400, { error: 'InvalidJWT', message: 'invalid signature' })
        return serveFile(res, fileFor(b, key))
      }
      // GET /object/(authenticated/)<bucket>/<key>
      if (req.method === 'GET') {
        if (!isSignedIn(req)) return sendJson(res, 403, { error: 'Unauthorized', message: 'Unauthorized' })
        const [bucket, ...k] = a === 'authenticated' ? [b, ...rest] : [a, b, ...rest]
        return serveFile(res, fileFor(bucket, k.join('/')))
      }
      // POST|PUT /object/<bucket>/<key>
      if (req.method === 'POST' || req.method === 'PUT') {
        if (!isSignedIn(req)) return sendJson(res, 403, { error: 'Unauthorized', message: 'Unauthorized' })
        return await upload(req, res, a, [b, ...rest].join('/'))
      }
      // DELETE /object/<bucket>  { prefixes: [...] }
      if (req.method === 'DELETE') {
        if (!isSignedIn(req)) return sendJson(res, 403, { error: 'Unauthorized', message: 'Unauthorized' })
        const { prefixes = [] } = await readJson(req)
        const removed = []
        for (const key of prefixes) {
          const file = fileFor(a, key)
          if (file && fs.existsSync(file)) { fs.rmSync(file); removed.push({ name: key, bucket_id: a }) }
        }
        return sendJson(res, 200, removed)
      }
      sendJson(res, 404, { error: 'not_found', message: 'Not available offline' })
    } catch (e) {
      console.error('[storage]', e)
      sendJson(res, e.status || 500, { error: 'internal', message: e.message })
    }
  }
}

module.exports = { createStorage }
