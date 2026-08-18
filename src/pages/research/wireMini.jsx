import { useState, useEffect } from 'preact/hooks'
import { getLocale, tl } from '../../lib/i18n.js'
import { fetchSymbolWire, peekSymbolWire, wireServiceUrl } from '../../lib/wire.js'

// Dense symbol tape under the DES band — the overview's dead zone becomes
// the last 10 things fragwire caught on this name. Hidden when no wire.
export function WireMini({ symbol }) {
  const [rows, setRows] = useState(() => peekSymbolWire(symbol) ?? null)
  // Symbol-scoped reads are a Fragwire feature: the public mirror ships no
  // symbol index and answers ?symbols= with an empty list, so asking it can
  // only cost a request and then read as "wire unavailable".
  const base = wireServiceUrl()
  useEffect(() => {
    let dead = false
    setRows(peekSymbolWire(symbol) ?? null)
    if (!base || !symbol) return undefined
    fetchSymbolWire(base, symbol)
      .then((events) => { if (!dead) setRows(events) })
      .catch(() => { if (!dead) setRows([]) })
    return () => { dead = true }
  }, [symbol, base])
  if (!base || !rows?.length) return null
  const CODE = {
    earnings_release: 'ERN', filing: 'FIL', headline: 'NWS', macro_print: 'ECO',
    price_move: 'PX', digest: 'DIG', transcript_chunk: 'LIV', brief: 'BRF',
  }
  return (
    <div class="border-t border-line">
      <div class="flex items-baseline gap-2 px-3 pt-1.5 pb-0.5">
        <span class="font-mono font-bold text-[10px] tracking-wider text-accent uppercase">FRAGWIRE</span>
        <a href={`#/research/${symbol.toLowerCase()}/wire`} class="font-mono text-[9.5px] text-muted hover:text-ink">0) {tl('all')} →</a>
      </div>
      <div class="font-mono text-[11px] pb-1">
        {rows.map((e, i) => (
          // the row is the story's front door (#/wire/<id>); the ↗ still goes
          // to the publisher, so both destinations stay one click away
          <a key={e.id} href={`#/wire/${e.id}`}
            class="grid grid-cols-[18px_78px_30px_1fr] gap-x-2 items-baseline px-3 py-[2px] hover:bg-surface-3">
            <span class="text-muted text-[10px] text-right">{i + 1})</span>
            <span class="text-muted text-[10.5px] whitespace-nowrap">
              {new Date(e.ts_event * 1000).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
              {' '}
              {new Date(e.ts_event * 1000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
            </span>
            <span class={`text-[9.5px] tracking-wider ${e.type === 'earnings_release' || e.type === 'price_move' ? 'text-accent font-semibold' : 'text-muted'}`}>
              {CODE[e.type] || (e.type || '').slice(0, 3).toUpperCase()}
            </span>
            <span class="text-ink-2 truncate min-w-0" title={e.headline}>
              {e.headline}
              {e.url && (
                <a href={e.url} target="_blank" rel="noopener"
                  onClick={(ev) => ev.stopPropagation()}
                  title={e.url}
                  class="ml-1 text-muted hover:text-accent">↗</a>
              )}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
