// The two states every panel eventually needs, in one place. Before this each
// surface hand-rolled its own — some pulsed, some didn't, some spun, and the
// heights collapsed to nothing so the real content shoved the page around when
// it landed (2026-08-10).
//
// Both take ALREADY-TRANSLATED labels: callers keep their own tl()/tt() calls,
// because the string is theirs and the i18n coverage tests read it there.

import { BrandSpinner } from './BrandSpinner.jsx'

/** `minH` reserves the loaded panel's height so nothing jumps on arrival —
 *  pass it wherever the answer's size is knowable, skip it inline. */
export function Loading({ label, minH }) {
  return (
    <div class="flex items-center justify-center gap-2 px-3 py-3 font-mono text-[11px] text-muted"
      style={minH ? { minHeight: `${minH}px` } : undefined}>
      <BrandSpinner size={14} />
      <span class="animate-pulse">{label}</span>
    </div>
  )
}

/** Nothing to show, and that's the answer — no spinner, no pulse. `body` is a
 *  second quieter line for the surfaces that explain what to do about it. */
export function Empty({ label, body }) {
  return (
    <div class="px-3 py-8 text-center font-anth text-[11px] text-muted">
      <div>{label}</div>
      {body && <div class="pt-1 text-[10px]">{body}</div>}
    </div>
  )
}
