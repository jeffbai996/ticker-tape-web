/** Board code → the symbol the data feed actually knows.
 *
 *  Jeff 2026-08-21: his stepdad entered his Hong Kong and mainland book the
 *  way a Chinese broker screen shows it — "02628", "600489" — and every row
 *  sat priceless and silently filed as USD. No venue Yahoo carries lists a
 *  bare number (`symbolExists` refuses digits-only for exactly this reason),
 *  so a digits-only holding is ALWAYS broken: rewriting it can only improve
 *  the book, never damage a working one.
 *
 *  Only the digit-count/prefix rules that are unambiguous are encoded here.
 *  Anything else is handed back untouched — a dash beats a wrong venue.
 */

// Mainland first digit → exchange. 6 (Shanghai main + 688 STAR), 5 (Shanghai
// funds/ETFs) and 9 (Shanghai B) go to Shanghai; 0 (main board), 3 (ChiNext),
// 1 and 2 (Shenzhen funds and B shares) go to Shenzhen.
const CN_EXCHANGE = { 6: 'SS', 5: 'SS', 9: 'SS', 0: 'SZ', 1: 'SZ', 2: 'SZ', 3: 'SZ' }

/** Normalize one symbol as typed. Non-numeric input is only upcased. */
export function normalizeVenueCode(raw) {
  const s = String(raw || '').trim().toUpperCase()
  if (!/^\d+$/.test(s)) return s

  // Hong Kong quotes board codes zero-padded to four digits; brokers show
  // five ("00700"), and the newer derivative lines genuinely are five.
  if (s.length <= 5) {
    const bare = s.replace(/^0+/, '') || '0'
    return `${bare.padStart(4, '0')}.HK`
  }
  if (s.length === 6) {
    const exch = CN_EXCHANGE[s[0]]
    return exch ? `${s}.${exch}` : s
  }
  return s
}

/** What to ask the symbol search when someone types a board code.
 *
 *  A gate that refuses "02628" is only fair if the dropdown can still get him
 *  there — and the provider returns nothing at all for a bare code. So a
 *  digits-only entry is looked up BOTH as typed and as the venue symbol it
 *  most likely means, and the listing shows up to be picked.
 */
export function codeSearchQueries(raw) {
  const q = String(raw || '').trim()
  if (!q) return []
  const guess = normalizeVenueCode(q)
  return guess !== q.toUpperCase() ? [q, guess] : [q]
}
