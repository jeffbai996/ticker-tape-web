/** One bit, persisted: "the person just deleted something". The worker
 *  refuses a shrinking portfolio push unless this bit rides along, so a
 *  client bug that empties the book cannot push the emptiness. Set only by
 *  the two destructive actions in myPortfolios.js; consumed by the next push.
 *  Lives in localStorage so a reload between the tap and the push does not
 *  strand a real delete behind the guard. Its own module: the sync engine
 *  imports the store, the store must not import the engine. */

const KEY = 'my_portfolios_intent_v1'

export function declareDeleteIntent() {
  try { localStorage.setItem(KEY, String(Date.now())) } catch { /* best-effort */ }
}

export function hasDeleteIntent() {
  try { return localStorage.getItem(KEY) != null } catch { return false }
}

export function takeDeleteIntent() {
  const had = hasDeleteIntent()
  try { localStorage.removeItem(KEY) } catch { /* best-effort */ }
  return had
}
