// Build-freshness watchdog. The tailnet churns through builds fast, and an
// already-open tab keeps running its old bundle forever — every deploy then
// reads as a "regression" on whichever device didn't reload (Jeff 2026-08-06,
// twice today). The page compares its own bundle hash against the one
// index.html currently points at and reloads itself when it's stale — at
// tab-return, when nobody is mid-anything.

function currentBundle() {
  const el = document.querySelector('script[src*="index-"]')
  const m = el && el.src.match(/index-[A-Za-z0-9_-]+\.js/)
  return m ? m[0] : null
}

async function servedBundle() {
  const resp = await fetch(`${import.meta.env.BASE_URL || './'}?fresh=${Date.now()}`,
    { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!resp.ok) return null
  const html = await resp.text()
  const m = html.match(/index-[A-Za-z0-9_-]+\.js/)
  return m ? m[0] : null
}

export function startFreshnessWatch() {
  const mine = currentBundle()
  if (!mine || typeof document === 'undefined') return
  let stale = false
  const check = async () => {
    try {
      const served = await servedBundle()
      if (served && served !== mine) stale = true
    } catch { /* offline — nothing to do */ }
    // reload only when the user just came back to the tab: never yanks the
    // page out from under an active session
    if (stale && document.visibilityState === 'visible' && !document.hasFocus()) return
    if (stale && document.visibilityState === 'visible') location.reload()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  setInterval(check, 5 * 60_000)
}
