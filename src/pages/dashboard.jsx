import { useEffect, useState } from 'preact/hooks'
import { useQuotes, useWatchlist } from '../hooks.js'
import { BUCKETS } from '../lib/symbols.js'
import { pulseStats } from '../lib/pulse.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { fmtPrice, fmtPct, fmtChange, fmtVol } from '../lib/format.js'
import { Histo } from '../components/Histo.jsx'
import { tl } from '../lib/i18n.js'

const DAY = 86_400_000
const ETF_SKIP = new Set(['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'])

/** Days until each symbol's next earnings — feeds the `27d` badge + panel. */
function useEarningsDays(symbols) {
  const [rows, setRows] = useState({})
  useEffect(() => {
    let alive = true
    const timers = []
    // Staggered: 30 simultaneous v10 calls on a cold cache stampede the
    // worker's crumb auth. Cached symbols resolve instantly regardless.
    symbols.filter((s) => !ETF_SKIP.has(s)).forEach((sym, i) => {
      timers.push(setTimeout(() => {
        if (!alive) return
        fetchEarningsDate(sym)
          .then((v) => alive && setRows((r) => ({ ...r, [sym]: v })))
          .catch(() => {})
      }, i * 120))
    })
    return () => { alive = false; timers.forEach(clearTimeout) }
  }, [symbols.join(',')])

  const days = {}
  const now = Date.now()
  for (const [sym, v] of Object.entries(rows)) {
    if (v?.date && v.date >= now - DAY) days[sym] = Math.max(0, Math.round((v.date - now) / DAY))
  }
  return days
}

// ── Badge row (TUI line 2): R60 27d >50 >200 1.1xv -2%H +3%R ──

function Badges({ tech, earnDays }) {
  if (!tech) return <span class="text-muted text-[10px]">…</span>
  const r = tech.rsi
  const rsiCls = r == null ? 'text-muted' : r >= 70 || r <= 30 ? 'text-accent' : 'text-ink-2'
  const smaBadge = (above, n) =>
    above == null ? null : (
      <span class={above ? 'text-up' : 'text-down'}>{above ? '>' : '<'}{n}</span>
    )
  return (
    <div class="flex items-baseline gap-2.5 font-mono text-[10px] whitespace-nowrap">
      <span class={rsiCls}>{r != null ? `R${Math.round(r)}` : ''}</span>
      {earnDays != null && <span class="text-accent">{earnDays}d</span>}
      {smaBadge(tech.above50, 50)}
      {smaBadge(tech.above200, 200)}
      {tech.volRatio != null && (
        <span class={tech.volRatio >= 1.5 ? 'text-accent' : 'text-muted'}>
          {tech.volRatio.toFixed(1)}xv
        </span>
      )}
      {tech.offHigh != null && (
        <span class={tech.offHigh <= -15 ? 'text-down' : 'text-ink-2'}>
          {Math.round(tech.offHigh)}%H
        </span>
      )}
      {tech.rs != null && (
        <span class={tech.rs >= 0 ? 'text-up' : 'text-down'}>
          {tech.rs >= 0 ? '+' : ''}{Math.round(tech.rs)}%R
        </span>
      )}
    </div>
  )
}

function TuiRow({ symbol, data, earnDays }) {
  const q = data?.quote
  const up = (q?.pct ?? 0) >= 0
  const extUp = (q?.extPct ?? 0) >= 0
  return (
    <a
      href={`#/research/${symbol.toLowerCase()}`}
      class="block px-3 py-[5px] border-b border-line last:border-0 hover:bg-surface-2 hover:no-underline"
    >
      <div class="flex items-baseline gap-3 font-mono text-[12px] flex-wrap">
        <span class="text-ink font-bold w-16">{symbol}</span>
        <span class="text-ink w-20 text-right">{q ? fmtPrice(q.price) : '—'}</span>
        {q && (
          <span class={`${up ? 'text-up' : 'text-down'} whitespace-nowrap`}>
            {up ? '▲' : '▼'} {fmtChange(Math.abs(q.change)).replace('+', '')} ({fmtPct(q.pct)})
          </span>
        )}
        {q?.extLabel && q.extPrice != null && (
          <span class="whitespace-nowrap text-[11px]">
            <span class="text-[#c084fc]">{q.extLabel}</span>{' '}
            <span class="text-ink-2">{fmtPrice(q.extPrice)}</span>{' '}
            <span class={extUp ? 'text-up' : 'text-down'}>
              {extUp ? '▲' : '▼'}{Math.abs(q.extPct ?? 0).toFixed(1)}%
            </span>
          </span>
        )}
        {q?.volume != null && (
          <span class="text-muted text-[10px] ml-auto hidden sm:inline">{fmtVol(q.volume)}</span>
        )}
      </div>
      <div class="flex items-center gap-3 pt-[2px] pl-16 max-sm:pl-0">
        <Histo bars={data?.histo} />
        <Badges tech={data?.tech} earnDays={earnDays} />
      </div>
    </a>
  )
}

// ── Right rail: Pulse + Earnings, mirroring the TUI's left column ──

function PulseRow({ label, value, cls = 'text-ink' }) {
  return (
    <div class="flex justify-between px-3 py-[2px] font-mono text-[11px]">
      <span class="text-muted">{label}</span>
      <span class={cls}>{value}</span>
    </div>
  )
}

function PulsePanel({ quotes }) {
  const s = pulseStats(quotes)
  if (!s) return null
  const tone = (v) => (v >= 0 ? 'text-up' : 'text-down')
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Pulse')}</h2>
      </header>
      <div class="py-1">
        <PulseRow label="A/D" value={`${s.adv} / ${s.dec}`} cls={s.adv >= s.dec ? 'text-up' : 'text-down'} />
        <PulseRow label={tl('Avg')} value={fmtPct(s.avg)} cls={tone(s.avg)} />
        <PulseRow label={tl('Hi')} value={`${s.hi.symbol} ${fmtPct(s.hi.pct)}`} cls="text-up" />
        <PulseRow label={tl('Lo')} value={`${s.lo.symbol} ${fmtPct(s.lo.pct)}`} cls="text-down" />
        <PulseRow label={tl('Spd')} value={`${s.spread.toFixed(1)}pp`} />
        <PulseRow label={`⚠ ${tl('down')} >3%`} value={String(s.stress)} cls={s.stress ? 'text-down' : 'text-ink-2'} />
        {(s.extAdv > 0 || s.extDec > 0) && (
          <PulseRow label="ExtHr" value={`${s.extAdv} / ${s.extDec}`} cls={s.extAdv >= s.extDec ? 'text-up' : 'text-down'} />
        )}
        <PulseRow label={tl('Median')} value={fmtPct(s.median)} cls={tone(s.median)} />
        <PulseRow label={tl('Green')} value={`${Math.round(s.greenPct)}%`} cls={tone(s.greenPct - 50)} />
        <PulseRow label="σ" value={s.sigma.toFixed(2)} />
        <PulseRow label="Mov >2%" value={`${s.movers}/${s.total}`} />
        <PulseRow label="Flt <1%" value={String(s.flat)} />
      </div>
    </section>
  )
}

function EarningsPanel({ symbols, days }) {
  const upcoming = symbols
    .filter((s) => days[s] != null)
    .map((s) => ({ symbol: s, d: days[s] }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 9)
  if (!upcoming.length) return null
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Earnings')}</h2>
      </header>
      <div class="py-1">
        {upcoming.map(({ symbol, d }) => (
          <a key={symbol} href={`#/research/${symbol.toLowerCase()}/earnings`}
            class="flex justify-between px-3 py-[2px] font-mono text-[11px] hover:bg-surface-2 hover:no-underline">
            <span class="text-ink font-bold">{symbol}</span>
            <span class={d <= 7 ? 'text-down' : d <= 21 ? 'text-accent' : 'text-ink-2'}>{d}d</span>
          </a>
        ))}
      </div>
    </section>
  )
}

export function Dashboard() {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)
  const earnDays = useEarningsDays(watchlist)

  const all = watchlist.map((s) => quotes[s]?.quote).filter((q) => q?.pct != null)
  const bucketAvg = (symbols) => {
    const pcts = symbols.map((s) => quotes[s]?.quote?.pct).filter((p) => p != null)
    return pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
  }

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      {/* Thesis strip: bucket averages at a glance */}
      <div class="flex items-baseline gap-x-4 gap-y-1 px-1 pb-2 font-mono text-[10px] flex-wrap">
        {BUCKETS.map((b) => {
          const inList = b.symbols.filter((s) => watchlist.includes(s))
          const avg = bucketAvg(inList)
          if (avg == null) return null
          return (
            <span key={b.name} class="whitespace-nowrap">
              <span class="text-muted uppercase tracking-wider">{tl(b.name)}</span>{' '}
              <span class={avg >= 0 ? 'text-up' : 'text-down'}>{fmtPct(avg)}</span>
            </span>
          )
        })}
      </div>

      <div class="grid gap-3 xl:grid-cols-[1fr_230px] min-w-0">
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
          {watchlist.map((s) => (
            <TuiRow key={s} symbol={s} data={quotes[s]} earnDays={earnDays[s]} />
          ))}
        </section>
        <div class="flex flex-col gap-3 min-w-0">
          <PulsePanel quotes={all} />
          <EarningsPanel symbols={watchlist} days={earnDays} />
        </div>
      </div>
    </div>
  )
}
