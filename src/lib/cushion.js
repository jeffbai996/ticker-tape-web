// Margin-cushion display classes (A31 F4). The book-summary widget is the one
// surface that says how far the book is from a margin call, so an UNKNOWN
// cushion must read as unknown — never in the safe (up) color and never in
// the danger (down) color. Sibling sites already guard first
// (portfolio.jsx AccountStats: `x != null && x < 15 ? down : up`); this is the
// same rule for the runway bar, which is gated on maintenance+equity rather
// than on the cushion itself — a partial margin payload may carry one without
// the other (docs/portfolio-currency-contract.md).

/** Below this percent the book is inside its danger zone. */
export const CUSHION_LOW = 8

/** Text class for a cushion figure: muted when unknown, never a safe color. */
export function cushionCls(cushion) {
  if (cushion == null || Number.isNaN(cushion)) return 'text-muted'
  return cushion < CUSHION_LOW ? 'text-danger' : 'text-success'
}

/** Fill class for the runway bar: neutral gray when unknown — the bar still
 *  shows where maintenance sits, but claims neither safe nor danger. */
export function cushionBarCls(cushion) {
  if (cushion == null || Number.isNaN(cushion)) return 'bg-ink-2/40'
  return cushion < CUSHION_LOW ? 'bg-danger' : 'bg-success/70'
}
