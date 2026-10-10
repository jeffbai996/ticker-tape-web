import { fmtPct, fmtPriceWide } from '../../src/lib/format.js'
import { RAIL } from '../lib/rail.js'
import { rowView } from '../lib/view.js'

export function Rail({ quotes, focused }) {
  return (
    <section class="tv-rail">
      <div class="tv-panel-head"><span>Markets</span></div>
      {RAIL.map(({ symbol, label }, i) => {
        const v = rowView(quotes[symbol])
        return (
          <div key={symbol} class={`tv-rail-row ${i === focused ? 'is-focused' : ''}`}>
            <span class="tv-rail-label">{label}</span>
            <span class="tv-rail-price">{v.ready ? fmtPriceWide(v.price) : '—'}</span>
            <span class={`tv-rail-pct ${v.dir}`}>{v.ready ? fmtPct(v.pct) : ''}</span>
          </div>
        )
      })}
    </section>
  )
}
