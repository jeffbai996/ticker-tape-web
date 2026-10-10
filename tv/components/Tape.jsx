import { fmtPct, fmtPrice } from '../../src/lib/format.js'
import { rowView } from '../lib/view.js'

const SECONDS_PER_ITEM = 3.5

/** Endless marquee: the run is rendered twice and slid by exactly one copy,
 *  so the seam is invisible. Transform-only motion stays on the compositor. */
export function Tape({ symbols, quotes }) {
  if (!symbols.length) return <div class="tv-tape" />
  // Called once per copy: a vnode tree cannot be mounted in two places.
  const run = () => symbols.map((s) => {
    const v = rowView(quotes[s])
    return (
      <span key={s} class="tv-tape-item">
        <b>{s}</b>
        <span>{v.ready ? fmtPrice(v.price) : '—'}</span>
        <span class={v.dir}>{v.ready ? fmtPct(v.pct) : ''}</span>
      </span>
    )
  })
  const style = { animationDuration: `${Math.max(20, symbols.length * SECONDS_PER_ITEM)}s` }
  return (
    <div class="tv-tape">
      <div class="tv-tape-track" style={style}>
        <div class="tv-tape-run">{run()}</div>
        <div class="tv-tape-run" aria-hidden="true">{run()}</div>
      </div>
    </div>
  )
}
