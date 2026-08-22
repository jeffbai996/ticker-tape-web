/** Which analytics cards a book shows (Jeff 2026-08-21: "if we add a ton then
 *  add a way for user to hide em").
 *
 *  The HIDDEN set is what persists, not the shown set. That is the whole
 *  design decision here: store "shown" and every card written after this
 *  release arrives switched off for everyone who ever touched the control,
 *  and nobody finds it. Store "hidden" and a new card ships visible, which is
 *  the behaviour someone who hid two cards a year ago actually expects.
 *
 *  Labels are English keys — `tl()` translates them at render, the same way
 *  bucket names do.
 */

const KEY = 'my_portfolio_cards_v1'

export const BOOK_CARDS = [
  { id: 'movers', label: 'Day movers' },
  { id: 'indices', label: 'vs indices' },
  { id: 'fx', label: 'FX impact' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'contribution', label: 'Day contribution' },
  { id: 'breadth', label: 'Breadth' },
  { id: 'weights', label: 'Weights' },
  { id: 'concentration', label: 'Concentration' },
  { id: 'unrealized', label: 'Open P&L' },
  { id: 'sectors', label: 'Sectors' },
  { id: 'venues', label: 'Markets' },
  { id: 'currency', label: 'Currency mix' },
  { id: 'cash', label: 'Cash & deployment' },
  { id: 'trend', label: 'Trend' },
  { id: 'pnlmap', label: 'P&L map' },
]

const KNOWN = new Set(BOOK_CARDS.map((c) => c.id))
const listeners = new Set()

export function onCardsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Hidden ids, in registry order, with anything that is no longer a card
 *  dropped — a retired id must not keep a slot in storage forever. */
export function hiddenCards() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (!Array.isArray(raw)) return []
    return BOOK_CARDS.map((c) => c.id).filter((id) => raw.includes(id))
  } catch { return [] }
}

/** Unknown ids read as shown: a card the stored set has never heard of is a
 *  card added after that set was written. */
export function isCardShown(id) {
  return !KNOWN.has(id) || !hiddenCards().includes(id)
}

function persist(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* best-effort */ }
  for (const fn of [...listeners]) fn(next)
  return next
}

export function toggleCard(id) {
  if (!KNOWN.has(id)) return hiddenCards()
  const cur = hiddenCards()
  return persist(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
}

export function resetCards() {
  return persist([])
}
