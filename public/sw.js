/* ticker-tape service worker — the app shell launches from disk.
 *
 * Three rules, nothing clever:
 *   hashed /assets/*      cache-first   (immutable by name; never stale)
 *   index.html / navigate network-first (a deploy lands on the next load;
 *                                        offline falls back to the last shell)
 *   other same-origin     stale-while-revalidate (icons, fonts, manifest)
 * Cross-origin — the market-data proxy, Google Fonts — is never touched, so
 * no quote is ever served from yesterday. The cache name carries the build
 * id; an activate wipes every other build's cache.
 */
const VERSION = '__BUILD__'
const CACHE = `ttw-${VERSION}`
const SHELL = ['./', './manifest.webmanifest', './favicon.svg', './favicon-64.png', './apple-touch-icon.png', './icon-192.png', './icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // best effort, one by one: a missing icon must not block the shell
    await Promise.all(SHELL.map((u) => cache.add(u).catch(() => {})))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((n) => n.startsWith('ttw-') && n !== CACHE).map((n) => caches.delete(n)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

const isNavigation = (req) => req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return                 // data + fonts: network, untouched
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req))
  } else if (isNavigation(req)) {
    event.respondWith(networkFirst(req))
  } else {
    event.respondWith(staleWhileRevalidate(req))
  }
})

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const resp = await fetch(req)
  if (resp.ok) cache.put(req, resp.clone())
  return resp
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE)
  try {
    const resp = await fetch(req)
    if (resp.ok) cache.put('./', resp.clone())
    return resp
  } catch {
    const hit = (await cache.match(req)) || (await cache.match('./'))
    if (hit) return hit
    throw new Error('offline and no shell cached')
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  const refresh = fetch(req).then((resp) => { if (resp.ok) cache.put(req, resp.clone()); return resp }).catch(() => null)
  return hit || (await refresh) || Response.error()
}
