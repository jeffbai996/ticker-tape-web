import { useEffect, useRef, useState } from 'preact/hooks'
import { fmtChange, fmtPct, fmtPrice } from '../../src/lib/format.js'
import { rowView, sparkPath } from '../lib/view.js'

export const BOARD_ROWS = 11

const SORT_LABEL = { list: 'List order', gainers: 'Top gainers', losers: 'Top losers' }

/** Brief colour flash when a price prints, so movement reads across a room. */
function useTickFlash(price) {
  const prev = useRef(price)
  const [flash, setFlash] = useState({ dir: null, n: 0 })
  useEffect(() => {
    if (prev.current != null && price != null && price !== prev.current) {
      setFlash((f) => ({ dir: price > prev.current ? 'up' : 'down', n: f.n + 1 }))
    }
    prev.current = price
  }, [price])
  return flash
}

export function Spark({ values, dir, width, height }) {
  const d = sparkPath(values, width, height)
  return (
    <svg class={`tv-spark ${dir}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {d && <path d={d} />}
    </svg>
  )
}

function Row({ symbol, entry, focused }) {
  const v = rowView(entry)
  const flash = useTickFlash(v.price)
  return (
    <div class={`tv-row ${focused ? 'is-focused' : ''}`}>
      <div class="tv-sym">{symbol}</div>
      <div class="tv-name">{v.name || ' '}</div>
      <Spark values={v.spark} dir={v.dir} width={176} height={40} />
      <div class="tv-price-cell">
        <div key={flash.n} class={`tv-price ${flash.dir ? `flash-${flash.dir}` : ''}`}>
          {v.ready ? fmtPrice(v.price) : '—'}
        </div>
        {v.ext && (
          <div class={`tv-ext ${v.ext.dir}`}>
            {v.ext.label} {fmtPrice(v.ext.price)} {fmtPct(v.ext.pct)}
          </div>
        )}
      </div>
      <div class={`tv-chg ${v.dir}`}>{v.ready ? fmtChange(v.change) : ''}</div>
      <div class={`tv-pct ${v.dir}`}>{v.ready ? fmtPct(v.pct) : ''}</div>
    </div>
  )
}

export function Board({ rows, start, total, focused, quotes, sort }) {
  return (
    <section class="tv-board">
      <div class="tv-panel-head">
        <span>Watchlist</span>
        <span class="tv-panel-meta">
          {SORT_LABEL[sort]} · {total ? `${start + 1}–${start + rows.length} of ${total}` : 'Empty'}
        </span>
      </div>
      {total === 0 && (
        <div class="tv-empty">The watchlist is empty. Press the green button to add a symbol.</div>
      )}
      {rows.map((symbol, i) => (
        <Row key={symbol} symbol={symbol} entry={quotes[symbol]} focused={start + i === focused} />
      ))}
    </section>
  )
}
