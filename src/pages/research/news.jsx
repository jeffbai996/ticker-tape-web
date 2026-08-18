import { useState, useEffect } from 'preact/hooks'
import { fetchNews } from '../../lib/history.js'
import { wireUrl } from '../../lib/wire.js'
import { getLocale, tl, t as tt } from '../../lib/i18n.js'
import { SectionCard } from './shared.jsx'

function NewsReadBody({ ev, base }) {
  const [state, setState] = useState({ status: 'loading', paras: [] })
  useEffect(() => {
    let dead = false
    if (!base || !ev.url) { setState({ status: 'empty', paras: [] }); return }
    fetch(`${base.replace(/\/$/, '')}/api/read?id=${ev.id}&fast=1`,
      { signal: AbortSignal.timeout(20_000) })
      .then((r) => r.json())
      .then((out) => {
        if (dead) return
        const text = out.ok ? (out.text || out.summary || '') : ''
        const paras = String(text).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)
        setState({ status: paras.length ? 'ok' : 'empty', paras })
      })
      .catch(() => !dead && setState({ status: 'empty', paras: [] }))
    return () => { dead = true }
  }, [ev.id])
  if (state.status === 'loading') {
    return <p class="text-[10.5px] font-mono text-muted animate-pulse py-1.5">{tl('pulling the story…')}</p>
  }
  if (state.status === 'empty') {
    return (
      <p class="text-[10.5px] font-mono text-muted py-1.5">
        {tl("source wouldn't give up its text —")}{' '}
        <a href={ev.url} target="_blank" rel="noopener"
           class="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          {tl('open the page ↗')}
        </a>
      </p>
    )
  }
  return (
    <div class="flex flex-col gap-1.5 py-2 max-w-[74ch] mx-auto">
      {state.paras.slice(0, 12).map((para, i) => (
        <p key={i} class="text-[11.5px] leading-relaxed text-ink-2 font-anth">{para}</p>
      ))}
      {state.paras.length > 12 && (
        <p class="text-[10px] font-mono text-muted">
          …{' '}
          <a href={ev.url} target="_blank" rel="noopener"
             class="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
            {tl('full text at the source ↗')}
          </a>
        </p>
      )}
    </div>
  )
}

/** Two feeds, two names: FRAGWIRE for the event-intelligence tape (earnings
 *  prints, filings, macro), NEWS FEED for the plain Yahoo headline list —
 *  same distinction the overview rail's News card already used. */
export function SymbolNewsView({ symbol, name }) {
  const [openId, setOpenId] = useState(null)
  const [wireType, setWireType] = useState('all')
  const [yahoo, setYahoo] = useState(null)
  const [wireRows, setWireRows] = useState(null)
  const base = wireUrl()
  useEffect(() => {
    let dead = false
    setYahoo(null)
    fetchNews(symbol).then((n) => !dead && setYahoo(n)).catch(() => !dead && setYahoo([]))
    return () => { dead = true }
  }, [symbol])
  useEffect(() => {
    let dead = false
    setWireRows(null)
    if (!base) { setWireRows([]); return }
    const root = base.replace(/\/$/, '')
    const queries = [
      fetch(`${root}/api/events?symbols=${encodeURIComponent(symbol)}&limit=40&newest=1`,
            { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null),
      fetch(`${root}/api/search?q=${encodeURIComponent(symbol)}`,
            { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null),
    ]
    // untagged stories talk about the company, not the ticker
    const word = (name || '').split(/[\s,]+/)[0]
    if (word && word.toLowerCase() !== symbol.toLowerCase()) {
      queries.push(fetch(`${root}/api/search?q=${encodeURIComponent(word)}`,
                         { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null))
    }
    Promise.all(queries).then((outs) => {
      if (dead) return
      const seen = new Set()
      const rows = []
      for (const out of outs) {
        for (const e of out?.events || []) {
          if (seen.has(e.id)) continue
          seen.add(e.id)
          if (e.type === 'brief' || e.type === 'transcript_chunk') continue
          rows.push(e)
        }
      }
      rows.sort((a, b) => (b.ts_event || 0) - (a.ts_event || 0))
      setWireRows(rows.slice(0, 40))
    })
    return () => { dead = true }
  }, [symbol, base, name])

  const CODE = { earnings_release: 'ERN', filing: 'FIL', headline: 'NWS',
    macro_print: 'ECO', price_move: 'PX', digest: 'DIG' }
  // simple per-type filters ride the card's title row (Jeff 2026-08-06)
  const wireTypes = [...new Set((wireRows || []).map((e) => e.type).filter(Boolean))]
  const shownWire = wireType === 'all' ? wireRows : (wireRows || []).filter((e) => e.type === wireType)
  return (
    <div class="flex flex-col gap-3 max-w-6xl">
      {base && (
        <SectionCard title={`FRAGWIRE · ${symbol}`}
          actions={wireTypes.length > 1 && (
            <>
              {['all', ...wireTypes].map((t) => (
                <button key={t}
                  onClick={() => setWireType(t === wireType ? 'all' : t)}
                  class={t === wireType
                    ? 'font-mono text-[9px] px-1.5 py-px rounded border tracking-wider shrink-0 border-accent-2 text-accent-2 bg-accent-2-soft'
                    : 'font-mono text-[9px] px-1.5 py-px rounded border tracking-wider shrink-0 border-line-2 text-muted hover:text-ink'}>
                  {t === 'all' ? tl('All') : (CODE[t] || t.slice(0, 3).toUpperCase())}
                </button>
              ))}
            </>
          )}>
          {wireRows === null ? (
            <div class="px-3 py-2 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
          ) : !wireRows.length ? (
            <div class="px-3 py-2 font-mono text-[11px] text-muted">{tt('research.nothing_on_wire', { symbol })}</div>
          ) : (
            <div class="font-mono text-[11.5px]">
              {!shownWire.length && (
                <div class="px-3 py-2 text-muted">{tt('research.nothing_on_wire', { symbol })}</div>
              )}
              {shownWire.map((e) => (
                <div key={e.id}
                  class={`border-t border-line first:border-0 cursor-pointer ${openId === e.id ? 'bg-surface-2/60' : 'hover:bg-surface-3'}`}
                  onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                  <div class="grid grid-cols-[86px_36px_1fr_auto] gap-x-2.5 items-baseline px-3 py-[3px]">
                    <span class="text-muted whitespace-nowrap">
                      {new Date(e.ts_event * 1000).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
                      {' '}
                      {new Date(e.ts_event * 1000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
                    </span>
                    <span class={`text-[10px] tracking-wider ${e.type === 'earnings_release' || e.type === 'price_move' ? 'text-accent font-semibold' : 'text-muted'}`}>
                      {CODE[e.type] || (e.type || '').slice(0, 3).toUpperCase()}
                    </span>
                    <span class={`truncate ${openId === e.id ? 'text-ink' : 'text-ink-2'}`}>{e.headline}</span>
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noopener" onClick={(ev2) => ev2.stopPropagation()}
                         class="text-muted hover:text-accent text-[10px] border border-line-2 rounded px-1 leading-[1.5]">↗</a>
                    )}
                  </div>
                  {openId === e.id && (
                    <div class="px-3 pb-1.5">
                      <h3 class="font-anth font-semibold text-[14px] leading-snug text-ink pt-1 pb-0.5 max-w-[74ch] mx-auto">{e.headline}</h3>
                      {e.body
                        ? <p class="text-[11.5px] leading-relaxed text-ink-2 font-anth max-w-[74ch] mx-auto py-2">{e.body}</p>
                        : <NewsReadBody ev={e} base={base} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
      <SectionCard title={`${tl('News feed')} · ${symbol}`}>
        {yahoo === null ? (
          <div class="px-3 py-2 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
        ) : !yahoo.length ? (
          <div class="px-3 py-2 font-mono text-[11px] text-muted">{tl('no headlines')}</div>
        ) : (
          <div class="font-mono text-[11.5px]">
            {yahoo.map((n, i) => (
              <div key={i} class="grid grid-cols-[86px_1fr_auto] gap-x-2.5 items-baseline px-3 py-[3px] border-t border-line first:border-0 hover:bg-surface-3">
                <span class="text-muted whitespace-nowrap">
                  {n.time ? new Date(n.time).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).toLowerCase() : '—'}
                </span>
                <a class="text-ink-2 hover:text-accent truncate" href={n.link} target="_blank" rel="noopener">{n.title}</a>
                <span class="text-[10px] text-muted truncate max-w-[16ch]">{n.publisher}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
