// Persistent Map-backed cache: hydrates from localStorage at construction,
// throttles writes, and prunes the oldest entries (by their `ts` millisecond
// stamp) past `max` so quote/bar caches can't creep toward the storage quota.
// This is what makes a page refresh paint instantly instead of re-fetching
// every symbol from scratch.

export function pruneOldest(obj, max) {
  const keys = Object.keys(obj)
  if (keys.length <= max) return obj
  const kept = keys
    .sort((a, b) => (obj[b].ts || 0) - (obj[a].ts || 0))
    .slice(0, max)
  return Object.fromEntries(kept.map((k) => [k, obj[k]]))
}

export function createPCache(storageKey, { max = 100, throttleMs = 1500 } = {}) {
  const map = new Map()
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '{}')
    for (const [k, v] of Object.entries(raw)) map.set(k, v)
  } catch {
    // corrupt cache: start empty
  }

  let timer = null
  function persist() {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      try {
        localStorage.setItem(storageKey, JSON.stringify(pruneOldest(Object.fromEntries(map), max)))
      } catch {
        // quota exceeded / private mode: keep working in-memory
      }
    }, throttleMs)
  }

  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => {
      map.set(k, v)
      persist()
    },
  }
}
