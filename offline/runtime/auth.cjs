// The slice of Supabase Auth (GoTrue) the app uses, served at /auth/v1:
// password sign-in, refresh, get user, sign out, and the admin user calls the
// provisioning code makes. Users live in auth.users with bcrypt passwords, so
// rows copied from the cloud keep working.
const crypto = require('node:crypto')
const { sign, verify } = require('./jwt.cjs')
const { readJson, sendJson, bearer } = require('./http-util.cjs')

const ACCESS_TTL      = 3600 // seconds, GoTrue's default
const REFRESH_REUSE_S = 10   // a just-rotated refresh token still works this long (parallel tabs)

const USER_COLS = `id, email, raw_app_meta_data, raw_user_meta_data, email_confirmed_at,
                   last_sign_in_at, created_at, updated_at`

function toUser(row) {
  return {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    phone: '',
    email_confirmed_at: row.email_confirmed_at,
    confirmed_at: row.email_confirmed_at,
    last_sign_in_at: row.last_sign_in_at,
    app_metadata: row.raw_app_meta_data ?? {},
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_anonymous: false,
  }
}

const authError = (res, status, code, msg) => sendJson(res, status, { code: status, error_code: code, msg })

function createAuth({ pool, cfg }) {
  const secret = cfg.secrets.jwtSecret

  async function issueSession(row, sessionId) {
    const now = Math.floor(Date.now() / 1000)
    const user = toUser(row)
    const access_token = sign({
      aud: 'authenticated', iss: 'clickgroup-offline', iat: now, exp: now + ACCESS_TTL,
      sub: row.id, email: row.email, phone: '',
      app_metadata: user.app_metadata, user_metadata: user.user_metadata,
      role: 'authenticated', aal: 'aal1', amr: [{ method: 'password', timestamp: now }],
      session_id: sessionId, is_anonymous: false,
    }, secret)
    const refresh_token = crypto.randomBytes(24).toString('base64url')
    await pool.query(
      'insert into auth.refresh_tokens (token, user_id, session_id) values ($1, $2, $3)',
      [refresh_token, row.id, sessionId],
    )
    return { access_token, token_type: 'bearer', expires_in: ACCESS_TTL, expires_at: now + ACCESS_TTL, refresh_token, user }
  }

  async function passwordGrant(req, res) {
    const { email, password } = await readJson(req)
    if (!email || !password) return authError(res, 400, 'validation_failed', 'Email and password are required')
    const { rows } = await pool.query(
      `update auth.users set last_sign_in_at = now()
         where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)
       returning ${USER_COLS}`,
      [String(email).trim(), String(password)],
    )
    if (!rows[0]) return authError(res, 400, 'invalid_credentials', 'Invalid login credentials')
    sendJson(res, 200, await issueSession(rows[0], crypto.randomUUID()))
  }

  async function refreshGrant(req, res) {
    const { refresh_token } = await readJson(req)
    const { rows } = await pool.query(
      `update auth.refresh_tokens set revoked_at = coalesce(revoked_at, now())
         where token = $1 and (revoked_at is null or revoked_at > now() - make_interval(secs => $2))
       returning user_id, session_id`,
      [String(refresh_token || ''), REFRESH_REUSE_S],
    )
    if (!rows[0]) return authError(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found')
    const u = await pool.query(`select ${USER_COLS} from auth.users where id = $1`, [rows[0].user_id])
    if (!u.rows[0]) return authError(res, 400, 'user_not_found', 'User not found')
    sendJson(res, 200, await issueSession(u.rows[0], rows[0].session_id))
  }

  async function getUser(req, res) {
    const claims = verify(bearer(req), secret)
    if (!claims?.sub) return authError(res, 401, 'bad_jwt', 'invalid JWT')
    const { rows } = await pool.query(`select ${USER_COLS} from auth.users where id = $1`, [claims.sub])
    if (!rows[0]) return authError(res, 403, 'user_not_found', 'User from sub claim in JWT does not exist')
    sendJson(res, 200, toUser(rows[0]))
  }

  async function logout(req, res, url) {
    const claims = verify(bearer(req), secret)
    if (claims?.sub) {
      const global = url.searchParams.get('scope') === 'global'
      await pool.query(
        global
          ? 'update auth.refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null'
          : 'update auth.refresh_tokens set revoked_at = now() where session_id = $1 and revoked_at is null',
        [global ? claims.sub : claims.session_id],
      )
    }
    res.writeHead(204).end()
  }

  // ── admin (service_role only) ───────────────────────────────────────────
  async function admin(req, res, rest, url) {
    const claims = verify(bearer(req), secret)
    if (claims?.role !== 'service_role') return authError(res, 403, 'not_admin', 'User not allowed')
    const [, id] = rest.split('/') // 'users' | 'users/<id>'

    if (req.method === 'GET' && !id) {
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      const per  = Math.min(1000, Math.max(1, Number(url.searchParams.get('per_page')) || 50))
      const { rows } = await pool.query(
        `select ${USER_COLS} from auth.users order by created_at limit $1 offset $2`, [per, (page - 1) * per])
      return sendJson(res, 200, { users: rows.map(toUser), aud: 'authenticated' })
    }
    if (req.method === 'GET' && id) {
      const { rows } = await pool.query(`select ${USER_COLS} from auth.users where id = $1`, [id])
      return rows[0] ? sendJson(res, 200, toUser(rows[0])) : authError(res, 404, 'user_not_found', 'User not found')
    }
    if (req.method === 'POST' && !id) {
      const b = await readJson(req)
      try {
        const { rows } = await pool.query(
          `insert into auth.users (email, encrypted_password, raw_user_meta_data, raw_app_meta_data)
           values (lower($1), case when $2::text is null then null else extensions.crypt($2, extensions.gen_salt('bf', 10)) end,
                   coalesce($3::jsonb, '{}'), coalesce($4::jsonb, '{"provider":"email","providers":["email"]}'))
           returning ${USER_COLS}`,
          [b.email, b.password ?? null, b.user_metadata ? JSON.stringify(b.user_metadata) : null,
           b.app_metadata ? JSON.stringify(b.app_metadata) : null],
        )
        return sendJson(res, 200, toUser(rows[0]))
      } catch (e) {
        if (e.code === '23505') return authError(res, 422, 'email_exists', 'A user with this email address has already been registered')
        throw e
      }
    }
    if (req.method === 'PUT' && id) {
      const b = await readJson(req)
      const { rows } = await pool.query(
        `update auth.users set
           email = coalesce(lower($2), email),
           encrypted_password = case when $3::text is null then encrypted_password
                                     else extensions.crypt($3, extensions.gen_salt('bf', 10)) end,
           raw_user_meta_data = coalesce($4::jsonb, raw_user_meta_data),
           updated_at = now()
         where id = $1 returning ${USER_COLS}`,
        [id, b.email ?? null, b.password ?? null, b.user_metadata ? JSON.stringify(b.user_metadata) : null],
      )
      return rows[0] ? sendJson(res, 200, toUser(rows[0])) : authError(res, 404, 'user_not_found', 'User not found')
    }
    if (req.method === 'DELETE' && id) {
      await pool.query('delete from auth.users where id = $1', [id])
      return sendJson(res, 200, {})
    }
    authError(res, 404, 'not_found', 'Not found')
  }

  /** Handle a request whose path starts with /auth/v1/. */
  return async function handle(req, res) {
    const url  = new URL(req.url, 'http://local')
    const rest = url.pathname.replace(/^\/auth\/v1\/?/, '')
    try {
      if (rest === 'token' && req.method === 'POST') {
        const grant = url.searchParams.get('grant_type')
        if (grant === 'password')      return await passwordGrant(req, res)
        if (grant === 'refresh_token') return await refreshGrant(req, res)
        return authError(res, 400, 'unsupported_grant_type', 'Unsupported grant type')
      }
      if (rest === 'user' && req.method === 'GET') return await getUser(req, res)
      if (rest === 'logout' && req.method === 'POST') return await logout(req, res, url)
      if (rest.startsWith('admin/users')) return await admin(req, res, rest.slice('admin/'.length), url)
      if (rest === 'health')   return sendJson(res, 200, { name: 'clickgroup-offline-auth', description: 'ok' })
      if (rest === 'settings') return sendJson(res, 200, { external: { email: true }, disable_signup: true, mailer_autoconfirm: true })
      authError(res, 404, 'not_found', 'This auth endpoint is not available in the offline edition')
    } catch (e) {
      console.error('[auth]', e)
      authError(res, 500, 'unexpected_failure', 'Unexpected failure')
    }
  }
}

module.exports = { createAuth }
