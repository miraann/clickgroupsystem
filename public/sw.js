// ClickGroup POS — Service Worker v2
// Caches: Next.js static chunks, Supabase storage images, app shell pages (offline mode)

const STATIC_CACHE = 'cg-static-v1'
const IMAGE_CACHE  = 'cg-images-v1'
const SHELL_CACHE  = 'cg-shell-v1'
const KNOWN_CACHES = [STATIC_CACHE, IMAGE_CACHE, SHELL_CACHE]

// ── Install ──────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting())
})

// ── Activate ─────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !KNOWN_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Messages from page ────────────────────────────────────────────
self.addEventListener('message', e => {
  // Clear shell cache (called from "Clear Cache" button)
  if (e.data?.type === 'CLEAR_SHELL_CACHE') {
    caches.delete(SHELL_CACHE).then(() => {
      e.ports[0]?.postMessage({ ok: true })
    })
  }

  // Pre-cache a list of URLs into the shell cache
  if (e.data?.type === 'PRECACHE_URLS') {
    const urls = e.data.urls ?? []
    caches.open(SHELL_CACHE).then(async cache => {
      for (const url of urls) {
        try {
          const res = await fetch(url, { credentials: 'include' })
          if (res.ok) await cache.put(url, res)
        } catch { /* skip unreachable */ }
      }
      e.ports[0]?.postMessage({ ok: true, cached: urls.length })
    })
  }
})

// ── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // 1. Next.js static assets — content-hashed, cache forever
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(e.request).then(hit => hit ||
          fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone())
            return res
          })
        )
      )
    )
    return
  }

  // 2. Supabase storage images — network first, cache fallback
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    e.respondWith(
      caches.open(IMAGE_CACHE).then(cache =>
        fetch(e.request)
          .then(res => {
            if (res.ok) cache.put(e.request, res.clone())
            return res
          })
          .catch(() => cache.match(e.request).then(hit => hit || Response.error()))
      )
    )
    return
  }

  // 3. Navigation requests (HTML pages) — network first, shell cache fallback
  //    Pages are added to shell cache as they're visited so they work offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            caches.open(SHELL_CACHE).then(cache => cache.put(e.request, res.clone()))
          }
          return res
        })
        .catch(() =>
          caches.open(SHELL_CACHE).then(cache =>
            cache.match(e.request).then(hit =>
              hit || cache.match('/dashboard').then(fb => fb || Response.error())
            )
          )
        )
    )
    return
  }

  // 4. Everything else (Supabase API, realtime) — network only
})
