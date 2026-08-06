// Pure reordering over a symbol list. `where` is either a delta (±1 nudges
// from the arrow buttons) or {before: SYM} (a drag landing on another row).

export function moveInList(list, symbol, where) {
  const from = list.indexOf(symbol)
  if (from < 0) return [...list]

  if (typeof where === 'object' && where !== null) {
    const target = list.indexOf(where.before)
    if (target < 0) return [...list]
    const next = list.filter((s) => s !== symbol)
    next.splice(next.indexOf(where.before), 0, symbol)
    return next
  }

  const to = Math.max(0, Math.min(list.length - 1, from + where))
  if (to === from) return [...list]
  const next = [...list]
  next.splice(from, 1)
  next.splice(to, 0, symbol)
  return next
}
