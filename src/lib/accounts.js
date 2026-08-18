// Account-label presentation for the private portfolio views. Labels come
// from the server (the broker bridge names its accounts); the UI only
// decides how they read in tight columns.

const TWO_OWNERS = /^\s*[^+&]+?\s*[+&]\s*[^+&]+?\s*$/

/** A two-owner joint label ("A + B", "A & B") collapses to "Both" — the
 *  combined view's account column wrapped it to three lines on phone. One
 *  owner, or three-plus, is left as-is. */
export function shortAccountLabel(label) {
  const s = (label ?? '').toString().trim()
  if (!s) return ''
  return TWO_OWNERS.test(s) ? 'Both' : s
}
