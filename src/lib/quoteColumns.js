/** Board-wide quote column widths, measured from what is actually printed.
 *
 *  Fixed column reservations (a 4.4rem price box for a possible 1834.59) kept
 *  rows aligned but left dead air on every 3-digit board — the gap sat right
 *  between the company name and the price (Jeff 2026-08-18: "still leaving
 *  too much gap here, could be filled by more company full name"). Content-
 *  sized columns filled the gap but let each row's price drift by its own
 *  digit count. So: measure the natural width of each column across the rows
 *  on the board, take the max, and hand it back as CSS vars the cells use as
 *  a min-width. Alignment of a fixed grid, slack of a content grid.
 *
 *  Pure parts (columnWidths) are unit-tested; the DOM parts read offsetWidth
 *  (layout width, so a flash transform can't jitter it) and write vars on the
 *  board root only — no state, no re-render, no feedback loop.
 */
export const QUOTE_COLS = ['price', 'change', 'ext']

/** cells: [{col, width}] → {col: maxWidth}. Zero/NaN widths are ignored so
 *  a hidden or unmounted cell can never shrink a column. */
export function columnWidths(cells) {
  const out = {}
  for (const { col, width } of cells) {
    if (!QUOTE_COLS.includes(col) || !(width > 0)) continue
    out[col] = Math.max(out[col] || 0, width)
  }
  return out
}

export function measureQuoteColumns(root) {
  const cells = []
  root.querySelectorAll('[data-col]').forEach((el) => {
    cells.push({ col: el.dataset.col, width: el.offsetWidth })
  })
  return columnWidths(cells)
}

export function applyQuoteColumns(root, widths) {
  for (const col of QUOTE_COLS) {
    const w = widths[col]
    if (w) root.style.setProperty(`--col-${col}`, `${Math.ceil(w)}px`)
    else root.style.removeProperty(`--col-${col}`)
  }
}

/** One measure+apply per frame, coalesced: calling this on every render
 *  (the board re-renders on each quote tick, flash, and clock) must never
 *  cancel a pending frame — a cancel-and-reschedule cleanup starved the
 *  measurement whenever renders outpaced frames and the vars never landed.
 *  A rAF is raced against a short timer: background/throttled tabs (and
 *  headless probes) can hold rAF indefinitely, and the vars are layout, not
 *  animation — they must land regardless. Returns a pending() probe. */
const PENDING = new WeakMap()
const FALLBACK_MS = 60
export function scheduleQuoteColumns(root, { doc = globalThis.document } = {}) {
  // Hidden tab: rAF never fires, so the timer fallback below would win every
  // time and run a full querySelectorAll + offsetWidth pass (a forced layout)
  // on every render for a screen nobody can see. The columns are re-measured
  // on the first visible render anyway.
  if (!root || doc?.hidden) return () => false
  if (!PENDING.has(root)) {
    const run = () => {
      const p = PENDING.get(root)
      PENDING.delete(root)
      if (p) { if (typeof cancelAnimationFrame === 'function' && p.raf != null) cancelAnimationFrame(p.raf); clearTimeout(p.timer) }
      applyQuoteColumns(root, measureQuoteColumns(root))
    }
    PENDING.set(root, {
      raf: typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : null,
      timer: setTimeout(run, FALLBACK_MS),
    })
  }
  return () => PENDING.has(root)
}
