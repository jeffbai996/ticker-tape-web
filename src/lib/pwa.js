/** Register the service worker on a built, served page — never in dev
 *  (vite's module graph and a cache do not mix) and never under test. The
 *  freshness watch still owns reloading: a new worker claims the page, the
 *  next tab-return sees the new bundle hash and reloads. */
export function registerServiceWorker({ nav = globalThis.navigator, base = import.meta.env.BASE_URL || '/', dev = import.meta.env.DEV } = {}) {
  if (dev || !nav || !('serviceWorker' in nav)) return null
  const url = `${base.endsWith('/') ? base : `${base}/`}sw.js`
  const p = nav.serviceWorker.register(url, { scope: base })
    .then((reg) => {
      // look for a new build while the tab stays open
      setInterval(() => reg.update().catch(() => {}), 30 * 60_000)
      return reg
    })
    .catch(() => null)
  return p
}
