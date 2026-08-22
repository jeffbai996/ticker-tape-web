import { useEffect, useState } from 'preact/hooks'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { fetchEarningsImpact } from '../lib/earnings.js'
import { fetchOptions } from '../lib/options.js'
import { getCached, whenFirstBatch } from '../lib/feed.js'
import { wireServiceUrl } from '../lib/wire.js'
import { fmtPct, fmtPctPlain, fmtPrice } from '../lib/format.js'
import { expiryForEvent, moveEdge, typicalMovePct } from '../lib/expmove.js'
import { expectedMove } from '../lib/optionsIntel.js'
import { tl } from '../lib/i18n.js'
import { Loading } from './Loading.jsx'

// Earnings day mode: everything about a print on one screen — when it lands,
// what the options are charging for it, what this name has actually done on
// past prints, and whether that gap is rich or cheap. The docket on the left
// picks the name; the panel on the right is the event.

const DAY_MS = 86_400_000

/** Report time in ET decides BMO vs AMC — the market's own convention. */
function session(dateMs) {
  if (!dateMs) return null
  const h = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false,
  }).format(new Date(dateMs)))
  if (h < 9) return 'BMO'
  if (h >= 16) return 'AMC'
  return null
}

function countdown(dateMs) {
  const ms = dateMs - Date.now()
  if (ms <= 0) return 'reporting now'
  const d = Math.floor(ms / DAY_MS)
  const h = Math.floor((ms % DAY_MS) / 3_600_000)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

function Stat({ label, value, tone = 'text-ink', hint }) {
  return (
    <div class="flex flex-col gap-0.5 px-3 py-2 min-w-0">
      <span class="text-[8.5px] text-muted uppercase tracking-wider truncate">{label}</span>
      <span class={`font-mono text-[13px] font-semibold truncate ${tone}`}>{value ?? '—'}</span>
      {hint && <span class="text-[9px] text-muted truncate">{hint}</span>}
    </div>
  )
}

/** The event panel for one name. */
function EventPanel({ symbol, date, epsEstimate }) {
  const [impact, setImpact] = useState(null)
  const [implied, setImplied] = useState(undefined)   // undefined = loading
  const [wire, setWire] = useState([])

  useEffect(() => {
    let dead = false
    setImpact(null); setImplied(undefined); setWire([])
    fetchEarningsImpact(symbol).then((r) => { if (!dead) setImpact(r) }).catch(() => {
      if (!dead) setImpact({ events: [], summary: null })
    })

    // Price the expiry that actually spans the print, not the front month.
    fetchOptions(symbol)
      .then(async (front) => {
        const want = expiryForEvent(front.expirations, date)
        const chain = want && want !== front.expiration
          ? await fetchOptions(symbol, want).catch(() => front)
          : front
        // one straddle implementation, shared with the options panel and
        // the chart's expected-move bands
        return expectedMove(chain)?.pct ?? null
      })
      .then((v) => { if (!dead) setImplied(v) })
      .catch(() => { if (!dead) setImplied(null) })

  // Symbol-scoped reads are a Fragwire feature: the public mirror ships no
  // symbol index and answers ?symbols= with an empty list, so asking it can
  // only cost a request and then read as "wire unavailable".
    const base = wireServiceUrl()
    if (base) {
      fetch(`${base.replace(/\/$/, '')}/api/events?symbols=${encodeURIComponent(symbol)}&limit=8&newest=1`,
            { signal: AbortSignal.timeout(8000) })
        .then((r) => r.json())
        .then((out) => { if (!dead) setWire(out.events || []) })
        .catch(() => {})
    }
    return () => { dead = true }
  }, [symbol, date])

  const q = getCached(symbol)?.quote
  const events = impact?.events || []
  const typical = typicalMovePct(events)
  const edge = moveEdge(implied, typical)
  const sum = impact?.summary
  const sess = session(date)
  const recent = events.filter((e) => e.priceMove != null).slice(0, 8)
  const edgeTone = edge?.verdict === 'rich' ? 'text-down'
    : edge?.verdict === 'cheap' ? 'text-up' : 'text-ink'

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
      <header class="flex items-baseline gap-3 px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <a href={`#/research/${symbol.toLowerCase()}`}
           class="font-mono font-bold text-[13px] text-accent hover:no-underline hover:text-ink">{symbol}</a>
        {q && (
          <span class={`font-mono text-[12px] ${(q.pct ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
            {fmtPrice(q.price)} {fmtPct(q.pct)}
          </span>
        )}
        <span class="ml-auto font-mono text-[11px] text-ink">
          {countdown(date)}
          {sess && <span class="text-muted"> · {sess}</span>}
        </span>
      </header>

      <div class="grid grid-cols-2 sm:grid-cols-4 divide-x divide-line border-b border-line">
        <Stat label={tl('Reports')}
          value={new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toLowerCase()} />
        <Stat label={tl('EPS est')} value={epsEstimate != null ? epsEstimate.toFixed(2) : null} />
        <Stat label={tl('Implied move')}
          value={implied === undefined ? '…' : implied != null ? `±${fmtPctPlain(implied)}` : null}
          hint={tl('atm straddle')} />
        <Stat label={tl('Typical move')}
          value={typical != null ? `±${fmtPctPlain(typical)}` : null}
          hint={typical != null ? `${recent.length} ${tl('prints')}` : null} />
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 divide-x divide-line border-b border-line">
        <Stat label={tl('Event priced')}
          value={edge ? `${edge.verdict} ${edge.ratio.toFixed(2)}x` : null}
          tone={edgeTone}
          hint={tl('implied vs realized')} />
        <Stat label={tl('Beat rate')}
          value={sum?.beatRate != null ? `${Math.round(sum.beatRate * 100)}%` : null}
          hint={sum?.total ? `${sum.beats}/${sum.total}` : null} />
        <Stat label={tl('Beat streak')} value={sum?.beatStreak ? `${sum.beatStreak}q` : null} />
        <Stat label={tl('Avg surprise')}
          value={sum?.avgSurprise != null ? fmtPct(sum.avgSurprise * 100) : null}
          tone={(sum?.avgSurprise ?? 0) >= 0 ? 'text-up' : 'text-down'} />
      </div>

      <div class="px-3 pt-1.5 pb-0.5 font-mono text-[10px] tracking-wider text-accent uppercase">
        {tl('Reaction history')}
      </div>
      {recent.length === 0 ? (
        <div class="px-3 pb-2 font-mono text-[11px] text-muted">{tl('no dated prints yet')}</div>
      ) : (
        <div class="px-3 pb-2 flex flex-wrap gap-1.5">
          {recent.map((e) => (
            <span key={e.report || e.quarter}
                  class={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${
                    e.priceMove >= 0 ? 'border-up/40 text-up' : 'border-down/40 text-down'}`}
                  title={e.report ? new Date(e.report).toDateString() : ''}>
              {fmtPct(e.priceMove, 1)}
            </span>
          ))}
        </div>
      )}

      {wire.length > 0 && (
        <>
          <div class="px-3 pt-1 pb-0.5 font-mono text-[10px] tracking-wider text-accent uppercase border-t border-line">
            {tl('On the wire')}
          </div>
          <div class="font-mono text-[11px] pb-1.5">
            {wire.map((e) => (
              <div key={e.id} class="grid grid-cols-[74px_1fr] gap-x-2 px-3 py-[2px] items-baseline hover:bg-surface-3">
                <span class="text-muted text-[10px]">
                  {new Date(e.ts_event * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
                </span>
                <span class="text-ink-2 truncate" title={e.headline}>{e.headline}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

/**
 * props: symbols — the universe to scan for upcoming prints.
 */
export function EarningsDay({ symbols }) {
  const [dates, setDates] = useState({})
  const [pick, setPick] = useState(null)

  useEffect(() => {
    let dead = false
    const timers = []
    // paced and deferred behind the first price paint; the in-flight map in
    // fetchEarningsDate means the board's badge lookups and these share one
    // request per symbol (2026-08-22)
    whenFirstBatch().then(() => {
      if (dead) return
      symbols.forEach((s, i) => {
        timers.push(setTimeout(() => {
          if (dead) return
          fetchEarningsDate(s)
            .then((d) => {
              if (dead || !d?.date) return
              setDates((cur) => ({ ...cur, [s]: d }))
            })
            .catch(() => {})
        }, 600 + i * 200))
      })
    })
    return () => { dead = true; timers.forEach(clearTimeout) }
  }, [symbols.join(',')])

  const docket = Object.entries(dates)
    .map(([sym, d]) => ({ sym, ...d, days: Math.ceil((d.date - Date.now()) / DAY_MS) }))
    .filter((e) => e.days >= -1 && e.days <= 90)
    .sort((a, b) => a.date - b.date)

  const active = docket.find((e) => e.sym === pick) || docket[0] || null

  // week buckets give the eye structure the bare list lacked (Jeff
  // 2026-08-21: "too sparse, too much black space")
  const bucketOf = (days) => days <= 0 ? 'today' : days <= 7 ? 'this week'
    : days <= 14 ? 'next week' : 'later'
  let lastBucket = null

  return (
    <div class="grid gap-2 lg:grid-cols-[240px_1fr] min-w-0">
      <section class="bg-surface-1 border border-line rounded-xl overflow-hidden self-start">
        <header class="flex items-baseline px-3 py-1.5 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
            {tl('Docket')}
          </h2>
          {docket.length > 0 && (
            <span class="ml-auto font-mono text-[9px] text-muted">{docket.length} · 90d</span>
          )}
        </header>
        {docket.length === 0 && (
          <Loading label={tl('loading earnings dates…')} minH={120} />
        )}
        <div class="max-h-[70vh] overflow-y-auto">
          {docket.map((e) => {
            const on = active?.sym === e.sym
            const urgent = e.days <= 0 ? 'text-imminent font-bold'
              : e.days <= 1 ? 'text-down' : e.days <= 7 ? 'text-accent' : 'text-muted'
            const bucket = bucketOf(e.days)
            const divider = bucket !== lastBucket
            lastBucket = bucket
            const d = new Date(e.date)
            return (
              <>
                {divider && (
                  <div key={`b-${bucket}`} class="px-3 pt-1.5 pb-0.5 font-anth text-[8.5px] font-bold uppercase tracking-[0.16em] text-muted border-t border-line-2 first:border-0 bg-surface-2/40">
                    {tl(bucket)}
                  </div>
                )}
                <button key={e.sym} onClick={() => setPick(e.sym)}
                  class={`w-full flex items-baseline gap-2 px-3 py-1 font-mono text-[11px] border-b border-line/50 last:border-0 ${
                    on ? 'bg-accent-2-soft text-ink' : 'hover:bg-surface-3'}`}>
                  <span class={`font-bold ${on ? 'text-accent-2' : 'text-ink'}`}>{e.sym}</span>
                  {e.epsEstimate != null && (
                    <span class="text-[9px] text-muted">est {e.epsEstimate.toFixed(2)}</span>
                  )}
                  <span class="ml-auto text-ink-2">
                    {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toLowerCase()}
                  </span>
                  <span class={`w-8 text-right ${urgent}`}>
                    {e.days <= 0 ? tl('today') : `${e.days}d`}
                  </span>
                </button>
              </>
            )
          })}
        </div>
      </section>
      {active
        ? <EventPanel symbol={active.sym} date={active.date} epsEstimate={active.epsEstimate} />
        : <div class="font-mono text-[11px] text-muted px-1">{tl('nothing on the docket')}</div>}
    </div>
  )
}
