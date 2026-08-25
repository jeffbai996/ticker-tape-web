// Until 2026-08-25 the public GitHub Pages deploy WAS the family build, so
// every device that ever opened it still has the family's real portfolio book
// in localStorage for that origin — and the public build reads the same keys,
// so it renders real names and real positions on a public page.
//
// The book itself is safe: it lives in the store and on the family host. What
// sits on the public origin is an orphaned copy that can only leak, so the
// public build clears it.
//
// Clearing runs ONCE, not on every load. A visitor to the public site can
// build their own book there, and a purge that fired every time would delete
// their work on every visit. The marker is what makes this a one-time
// cleanup of old residue rather than a standing "public users may not keep a
// portfolio" rule.

export const FAMILY_KEYS = [
  'my_portfolios_v1',
  'my_portfolios_trash_v1',
  'my_portfolios_sync_meta_v1',
  'ttw-my-portfolios',
]

export const PURGE_MARKER = 'ttw_family_residue_purged_v1'

/** Which of the family keys this store actually holds. Pure: reads only. */
export function residueKeys(store, keys = FAMILY_KEYS) {
  if (!store) return []
  return keys.filter((k) => {
    try { return store.getItem(k) != null } catch { return false }
  })
}

/** True when the one-time purge has already run against this store. */
export function alreadyPurged(store, marker = PURGE_MARKER) {
  if (!store) return true
  try { return store.getItem(marker) != null } catch { return true }
}

/** Remove the orphaned family book, once. Returns the keys actually cleared.
 *  Marks the store either way, so a visitor's own later book is never touched. */
export function purgeFamilyResidue(store, { keys = FAMILY_KEYS, marker = PURGE_MARKER } = {}) {
  if (!store || alreadyPurged(store, marker)) return []
  const found = residueKeys(store, keys)
  for (const k of found) {
    try { store.removeItem(k) } catch { /* a full or blocked store is not fatal */ }
  }
  try { store.setItem(marker, '1') } catch { /* best effort; retries next load */ }
  return found
}
