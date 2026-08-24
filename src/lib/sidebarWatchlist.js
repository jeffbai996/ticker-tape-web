// The rail can follow a different list from the page currently in view. This
// is a local reading preference; watchlist contents remain in their own store.
const KEY = 'sidebar_watchlist_v1'

export function loadSidebarWatchlistId(lists) {
  try {
    const saved = localStorage.getItem(KEY)
    return lists.some((list) => list.id === saved) ? saved : 'main'
  } catch { return 'main' }
}

export function saveSidebarWatchlistId(id) {
  try { localStorage.setItem(KEY, id) } catch { /* best-effort */ }
  return id
}
