const CACHE_STATIC = 'betarena-static-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((c) => c.addAll(['/offline.html'])).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
})

const isAsset = (url) => {
  return url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.ico') || url.pathname.includes('/assets/')
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req))
    return
  }
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE_STATIC)
        const offline = await cache.match('/offline.html')
        return offline || Response.error()
      })
    )
    return
  }
  if (url.origin === self.location.origin && isAsset(url)) {
    event.respondWith(
      caches.open(CACHE_STATIC).then(async (cache) => {
        const cached = await cache.match(req)
        const network = fetch(req).then((res) => { if (res && res.status === 200) cache.put(req, res.clone()); return res })
        return cached || network
      })
    )
    return
  }
  event.respondWith(fetch(req))
})

self.addEventListener('message', (event) => {
  const d = event.data
  if (d && d.type === 'SKIP_WAITING') self.skipWaiting()
})
