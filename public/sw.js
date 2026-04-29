// ClickGroup POS — Service Worker
// Caches Next.js static chunks (content-hashed filenames = safe to cache forever)
// and Supabase storage images. All other requests go straight to network.

const STATIC_CACHE = 'cg-static-v1'
const IMAGE_CACHE  = 'cg-images-v1'
const KNOWN_CACHES = [STATIC_CACHE, IMAGE_CACHE]

self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', e => {
  // Delete any cache from an old version
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !KNOWN_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Next.js static assets — content-hashed, cache forever
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

  // Supabase storage images — cache with network-first update
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

  // Everything else (API routes, Supabase realtime, pages) — network only
})
