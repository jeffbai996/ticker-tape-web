import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createChart, AreaSeries } from 'lightweight-charts'
import { useQuotes } from '../hooks.js'
import {
  DEMO_POSITIONS, DEMO_CASH, DEMO_BETAS, DEMO_ACCOUNT_ID, DEMO_MARGIN_RATE,
  positionRows, accountSummary, sizeForWeight, carryAt, stressGrid, nlvWalk,
} from '../lib/demo.js'
import { fmtPrice, fmtPct, fmtChange, fmtRatio } from '../lib/format.js'
import { tl, t as tt } from '../lib/i18n.js'
import {
  parseFillsCsv, assembleBacktest, convertFills, convertBars, needsFx, symbolCurrency,
} from '../lib/backtest.js'
import { demoFillsCsv, loadFillsCsv, saveFillsCsv, closesByDateFromChart } from '../lib/backtestData.js'
import { proxyBase } from '../lib/feed.js'
import { createPCache } from '../lib/pcache.js'

const SYMBOLS = DEMO_POSITIONS.map((p) => p.symbol)

function priceMapOf(live) {
  const out = {}
  for (const s of SYMBOLS) {
    const q = live[s]?.quote
    if (q) out[s] = q
  }
  return out
}

function DemoBanner() {
  return (
    <div class="mx-1 mb-2 px-3 py-1.5 bg-accent-soft border border-accent rounded-lg font-mono text-[11px] text-accent font-bold tracking-wider">
      {tt('demo.banner')}
    </div>
  )
}

const money = (v, digits = 0) =>
  v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const dollars = (v) => (v == null ? '—' : `$${money(v)}`)

const signedMoney = (v) =>
  v == null ? '—' : `${v >= 0 ? '+' : '-'}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

const pnlCls = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')

function Positions({ priceMap }) {
  const rows = positionRows(DEMO_POSITIONS, priceMap)
  const tot = (k) => (rows.every((r) => r[k] != null) ? rows.reduce((s, r) => s + r[k], 0) : null)

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto max-w-4xl">
      <table class="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
            <th class="px-3 py-2 text-left">{tl('Sym')}</th>
            <th class="px-2 py-2 text-right">{tl('Shares')}</th>
            <th class="px-2 py-2 text-right">{tl('Avg cost')}</th>
            <th class="px-2 py-2 text-right">{tl('Price')}</th>
            <th class="px-2 py-2 text-right">{tl('Value')}</th>
            <th class="px-2 py-2 text-right">{tl('Weight')}</th>
            <th class="px-2 py-2 text-right">{tl('Day P&L')}</th>
            <th class="px-3 py-2 text-right">{tl('Unreal P&L')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} class="border-t border-line hover:bg-surface-2 cursor-pointer"
              onClick={() => (location.hash = `#/research/${r.symbol.toLowerCase()}`)}>
              <td class="px-3 py-[5px] font-bold text-accent">{r.symbol}</td>
              <td class="px-2 py-[5px] text-right text-ink-2">{r.shares}</td>
              <td class="px-2 py-[5px] text-right text-muted">{fmtPrice(r.avgCost)}</td>
              <td class="px-2 py-[5px] text-right text-ink">{fmtPrice(r.price)}</td>
              <td class="px-2 py-[5px] text-right text-ink">{money(r.mktValue)}</td>
              <td class="px-2 py-[5px] text-right text-ink-2">{r.weight != null ? `${r.weight.toFixed(1)}%` : '—'}</td>
              <td class={`px-2 py-[5px] text-right ${pnlCls(r.dayPnl)}`}>
                {signedMoney(r.dayPnl)} {r.dayPct != null && <span class="text-[10px]">({fmtPct(r.dayPct)})</span>}
              </td>
              <td class={`px-3 py-[5px] text-right ${pnlCls(r.unrealPnl)}`}>
                {signedMoney(r.unrealPnl)} {r.unrealPct != null && <span class="text-[10px]">({fmtPct(r.unrealPct)})</span>}
              </td>
            </tr>
          ))}
          <tr class="border-t border-line-2 bg-surface-2 font-bold">
            <td class="px-3 py-[6px] text-ink" colSpan={4}>{tl('Total')}</td>
            <td class="px-2 py-[6px] text-right text-ink">{money(tot('mktValue'))}</td>
            <td class="px-2 py-[6px] text-right text-ink-2">100%</td>
            <td class={`px-2 py-[6px] text-right ${pnlCls(tot('dayPnl'))}`}>{signedMoney(tot('dayPnl'))}</td>
            <td class={`px-3 py-[6px] text-right ${pnlCls(tot('unrealPnl'))}`}>{signedMoney(tot('unrealPnl'))}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function AccountStat({ label, value, cls = 'text-ink' }) {
  return (
    <div class="bg-surface-1 border border-line rounded-xl px-4 py-3">
      <div class="text-[9px] text-muted uppercase tracking-wider pb-1">{label}</div>
      <div class={`font-mono text-[16px] ${cls}`}>{value}</div>
    </div>
  )
}

function Account({ priceMap }) {
  const s = accountSummary(DEMO_POSITIONS, priceMap)
  return (
    <div class="max-w-4xl">
      <div class="px-1 pb-2 font-mono text-[11px] text-muted">
        {tl('Account')} <span class="text-ink-2">{DEMO_ACCOUNT_ID}</span> · {tt('demo.formulas')}
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AccountStat label="NLV" value={dollars(s.nlv)} />
        <AccountStat label={tl('Cash')} value={dollars(s.cash)} />
        <AccountStat label={tl('Gross exposure')} value={dollars(s.gross)} />
        <AccountStat label={tl('Leverage')} value={s.leverage != null ? `${s.leverage.toFixed(2)}x` : '—'} />
        <AccountStat label={tl('Maintenance')} value={dollars(s.maintenance)} />
        <AccountStat label={tl('Excess liquidity')} value={dollars(s.excessLiq)} />
        <AccountStat label={tl('Cushion')} value={s.cushionPct != null ? `${s.cushionPct.toFixed(1)}%` : '—'}
          cls={s.cushionPct != null && s.cushionPct < 15 ? 'text-down' : 'text-up'} />
        <AccountStat label={tl('Day P&L')} value={signedMoney(s.dayPnl)} cls={pnlCls(s.dayPnl)} />
        <AccountStat label={tl('Unreal P&L')} value={signedMoney(s.unrealPnl)} cls={pnlCls(s.unrealPnl)} />
      </div>
    </div>
  )
}

function Sizing({ priceMap }) {
  const [symbol, setSymbol] = useState('MSFT')
  const [targetPct, setTargetPct] = useState('10')
  const sym = symbol.trim().toUpperCase()
  const live = useQuotes(sym ? [sym] : [])
  const q = live[sym]?.quote
  const s = accountSummary(DEMO_POSITIONS, priceMap)
  const held = DEMO_POSITIONS.find((p) => p.symbol === sym)?.shares || 0
  const r = q && s.nlv
    ? sizeForWeight({ nlv: s.nlv, price: q.price, targetPct: Number(targetPct) || 0, currentShares: held })
    : null

  const field = 'bg-surface-2 border border-line rounded-md px-2 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent'

  return (
    <div class="max-w-xl flex flex-col gap-3">
      <div class="bg-surface-1 border border-line rounded-xl p-3 flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-[9px] text-muted uppercase tracking-wider">{tl('Symbol')}</span>
          <input class={`${field} w-24 uppercase`} value={symbol} onInput={(e) => setSymbol(e.currentTarget.value)} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[9px] text-muted uppercase tracking-wider">{tl('Target weight')} (% NLV)</span>
          <input class={`${field} w-24`} inputMode="decimal" value={targetPct}
            onInput={(e) => setTargetPct(e.currentTarget.value)} />
        </label>
      </div>
      <section class="bg-surface-1 border border-line rounded-xl p-4 font-mono text-[12px] flex flex-col gap-1.5">
        {!(q && r) && <span class="text-muted">{tt('common.loading')}</span>}
        {q && r && (
          <>
            <div class="flex justify-between"><span class="text-muted">{tl('Price')}</span><span class="text-ink">{fmtPrice(q.price)}</span></div>
            <div class="flex justify-between"><span class="text-muted">{tl('Target value')}</span><span class="text-ink">${money(r.targetValue)}</span></div>
            <div class="flex justify-between"><span class="text-muted">{tl('Target shares')}</span><span class="text-ink">{r.targetShares}</span></div>
            <div class="flex justify-between"><span class="text-muted">{tl('Held (demo)')}</span><span class="text-ink-2">{held}</span></div>
            <div class="flex justify-between border-t border-line pt-1.5 mt-1">
              <span class="text-muted">{r.delta >= 0 ? tl('Buy') : tl('Sell')}</span>
              <span class={r.delta >= 0 ? 'text-up' : 'text-down'}>
                {Math.abs(r.delta)} {tl('shares')} (~${money(Math.abs(r.cost))})
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Carry({ priceMap }) {
  const [lev, setLev] = useState(1.5)
  const s = accountSummary(DEMO_POSITIONS, priceMap)
  const c = s.nlv ? carryAt({ nlv: s.nlv, targetLeverage: lev }) : null

  return (
    <div class="max-w-xl flex flex-col gap-3">
      <div class="bg-surface-1 border border-line rounded-xl p-4">
        <div class="flex justify-between font-mono text-[11px] pb-2">
          <span class="text-muted">{tl('Target leverage')}</span>
          <span class="text-accent font-bold">{lev.toFixed(2)}x</span>
        </div>
        <input type="range" min="1" max="2.5" step="0.05" value={lev}
          onInput={(e) => setLev(Number(e.currentTarget.value))}
          class="w-full accent-[#f59e0b]" />
        <div class="pt-2 font-mono text-[10px] text-muted">
          {tt('demo.carry_note', { rate: DEMO_MARGIN_RATE })}
        </div>
      </div>
      <section class="bg-surface-1 border border-line rounded-xl p-4 font-mono text-[12px] flex flex-col gap-1.5">
        {!c && <span class="text-muted">{tt('common.loading')}</span>}
        {c && (
          <>
            <div class="flex justify-between"><span class="text-muted">{tl('Margin loan')}</span><span class="text-ink">${money(c.borrow)}</span></div>
            <div class="flex justify-between"><span class="text-muted">{tl('Per year')}</span><span class="text-ink">${money(c.perYear)}</span></div>
            <div class="flex justify-between"><span class="text-muted">{tl('Per month')}</span><span class="text-ink">${money(c.perMonth)}</span></div>
            <div class="flex justify-between"><span class="text-muted">{tl('Per day')}</span><span class="text-ink">${c.perDay.toFixed(2)}</span></div>
          </>
        )}
      </section>
    </div>
  )
}

function Cockpit({ priceMap }) {
  const rows = positionRows(DEMO_POSITIONS, priceMap)
  const s = accountSummary(DEMO_POSITIONS, priceMap)
  const grid = stressGrid(DEMO_POSITIONS, priceMap)
  const weights = rows.map((r) => r.weight).filter((w) => w != null)
  const top = weights.length ? Math.max(...weights) : null
  const hhi = weights.length ? weights.reduce((a, w) => a + (w / 100) ** 2, 0) : null

  return (
    <div class="max-w-2xl flex flex-col gap-3">
      <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
        <header class="px-3 py-2 border-b border-line-2 bg-surface-2">
          <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Stress test')}</h2>
        </header>
        <table class="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
              <th class="px-3 py-2 text-left">{tl('Market move')}</th>
              <th class="px-2 py-2 text-right">{tl('Book P&L')}</th>
              <th class="px-2 py-2 text-right">NLV</th>
              <th class="px-3 py-2 text-right">{tl('Leverage')}</th>
            </tr>
          </thead>
          <tbody>
            {grid.map(({ move, pnl }) => {
              const nlvAfter = s.nlv != null ? s.nlv + pnl : null
              const grossAfter = s.gross != null ? s.gross + pnl : null
              return (
                <tr key={move} class="border-t border-line">
                  <td class={`px-3 py-[5px] font-bold ${move < 0 ? 'text-down' : 'text-up'}`}>{move > 0 ? '+' : ''}{move}%</td>
                  <td class={`px-2 py-[5px] text-right ${pnlCls(pnl)}`}>{signedMoney(pnl)}</td>
                  <td class="px-2 py-[5px] text-right text-ink">{money(nlvAfter)}</td>
                  <td class="px-3 py-[5px] text-right text-ink-2">
                    {nlvAfter && grossAfter ? `${(grossAfter / nlvAfter).toFixed(2)}x` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div class="px-3 py-1.5 border-t border-line text-[9px] text-muted">{tt('demo.stress_note')}</div>
      </section>

      <div class="grid gap-3 sm:grid-cols-3">
        <AccountStat label={tl('Top position')} value={top != null ? `${top.toFixed(1)}%` : '—'} />
        <AccountStat label={tl('Concentration (HHI)')} value={hhi != null ? hhi.toFixed(3) : '—'} />
        <AccountStat label={tl('Cushion')} value={s.cushionPct != null ? `${s.cushionPct.toFixed(1)}%` : '—'}
          cls={s.cushionPct != null && s.cushionPct < 15 ? 'text-down' : 'text-up'} />
      </div>

      <section class="bg-surface-1 border border-line rounded-xl p-3 font-mono text-[11px]">
        <div class="text-[9px] text-muted uppercase tracking-wider pb-1.5">{tl('Demo betas')}</div>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(DEMO_BETAS).map(([sym, b]) => (
            <span key={sym}><span class="text-ink-2">{sym}</span> <span class="text-ink">{fmtRatio(b)}</span></span>
          ))}
        </div>
      </section>
    </div>
  )
}

function Timeline({ priceMap }) {
  const el = useRef(null)
  const s = accountSummary(DEMO_POSITIONS, priceMap)

  useEffect(() => {
    if (!el.current || s.nlv == null) return
    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#79828d',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.10)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.10)' },
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: '#f59e0b',
      topColor: 'rgba(245, 158, 11, 0.25)',
      bottomColor: 'rgba(245, 158, 11, 0.0)',
      lineWidth: 1.5,
    })
    series.setData(nlvWalk('ttw-demo-nlv', 252, s.nlv))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [s.nlv])

  return (
    <section class="bg-surface-1 border border-line rounded-xl p-2 max-w-4xl min-w-0">
      <div class="px-2 pb-1 font-mono text-[11px] text-muted">
        {tt('demo.timeline_note')}
      </div>
      <div ref={el} class="h-[380px] w-full" />
    </section>
  )
}

// Chart-bars fetch cache — separate from feed.js's live-quote cache since
// this pulls daily closes over an arbitrary user-picked date range.
const barsCache = createPCache('bt_bars_v1', { max: 40 })
const BARS_TTL = 30 * 60_000

async function fetchCloses(symbol, period1, period2) {
  const key = `${symbol}:${period1}:${period2}`
  const hit = barsCache.get(key)
  if (hit && Date.now() - hit.ts < BARS_TTL) return hit.value
  const url = `${proxyBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`backtest ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error(`backtest ${symbol}: empty`)
  const value = closesByDateFromChart(result)
  barsCache.set(key, { value, ts: Date.now() })
  return value
}

function FillsEditor({ csv, isDemo, onSave, onResetDemo }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(csv)

  useEffect(() => setDraft(csv), [csv])

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden max-w-2xl">
      <button
        class="w-full flex items-center justify-between px-3 py-2 bg-surface-2 hover:bg-surface-3"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Fills ledger')}
        </span>
        <span class="font-mono text-[10px] text-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div class="p-3 flex flex-col gap-2">
          <textarea
            class="w-full h-40 bg-surface-2 border border-line rounded-md px-2 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent resize-y"
            placeholder={'date,symbol,side,qty,price[,currency]\n2023-01-10,AAPL,BUY,50,132.50'}
            value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 bg-accent-soft border border-accent rounded-md font-mono text-[11px] text-accent font-bold hover:brightness-110"
              onClick={() => onSave(draft)}
            >
              {tl('Save')}
            </button>
            <button
              class="px-3 py-1.5 bg-surface-2 border border-line rounded-md font-mono text-[11px] text-ink-2 hover:bg-surface-3"
              onClick={() => { onResetDemo(); setDraft(demoFillsCsv()) }}
            >
              {tl('Reset to demo')}
            </button>
            {isDemo && (
              <span class="ml-auto text-[8px] font-mono font-bold px-1 py-px rounded border border-line-2 text-muted">
                {tl('DEMO LEDGER')}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function BacktestChart({ result, reportCcy }) {
  const { dates, book, bench, marks } = result
  if (!dates.length) return null

  const w = 720
  const h = 260
  const padL = 48
  const padR = 12
  const padT = 12
  const padB = 28
  const innerW = w - padL - padR
  const innerH = h - padT - padB

  const allVals = [...book, ...bench.filter((v) => v != null)]
  const lo = Math.min(...allVals)
  const hi = Math.max(...allVals)
  const span = hi - lo || 1

  const x = (i) => padL + (dates.length > 1 ? (i / (dates.length - 1)) * innerW : innerW / 2)
  const y = (v) => padT + innerH - ((v - lo) / span) * innerH

  const linePath = (series) => series
    .map((v, i) => (v == null ? null : `${i === 0 || series[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ')

  const dateIdx = Object.fromEntries(dates.map((d, i) => [d, i]))

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} class="block">
      <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="rgba(255,255,255,0.10)" stroke-width="1" />
      <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="rgba(255,255,255,0.10)" stroke-width="1" />

      <text x={4} y={padT + 8} class="fill-current text-muted" font-size="9" font-family="monospace">
        {hi.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </text>
      <text x={4} y={padT + innerH} class="fill-current text-muted" font-size="9" font-family="monospace">
        {lo.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </text>

      {bench.length > 0 && (
        <path d={linePath(bench)} fill="none" stroke="#79828d" stroke-width="1.5" stroke-dasharray="4 3" />
      )}
      <path d={linePath(book)} fill="none" stroke="#f59e0b" stroke-width="1.75" />

      {marks.map((m, i) => {
        const idx = dateIdx[m.date]
        if (idx == null) return null
        const isBuy = m.side === 'BUY'
        return (
          <text
            key={i}
            x={x(idx)}
            y={padT + innerH + 16}
            text-anchor="middle"
            font-size="9"
            fill={isBuy ? '#3fb950' : '#f85149'}
          >
            {isBuy ? '▲' : '▼'}
          </text>
        )
      })}

      <text x={padL} y={h - 4} class="fill-current text-muted" font-size="9" font-family="monospace">
        {dates[0]}
      </text>
      <text x={padL + innerW} y={h - 4} text-anchor="end" class="fill-current text-muted" font-size="9" font-family="monospace">
        {dates[dates.length - 1]} · {reportCcy}
      </text>
    </svg>
  )
}

function BacktestStats({ result }) {
  const { stats, horizonStart } = result
  if (!stats) return null
  return (
    <div class="flex flex-col gap-2">
      <div class="grid gap-3 sm:grid-cols-4">
        <AccountStat label={tl('Book return')} value={fmtPct(stats.bookReturnPct)} cls={pnlCls(stats.bookReturnPct)} />
        <AccountStat label={tl('Benchmark return')} value={fmtPct(stats.benchmarkReturnPct)} cls={pnlCls(stats.benchmarkReturnPct)} />
        <AccountStat label={tl('Alpha')} value={fmtPct(stats.alphaPct)} cls={pnlCls(stats.alphaPct)} />
        <AccountStat label={tl('Max drawdown')} value={fmtPct(stats.maxDrawdownPct)} cls={pnlCls(stats.maxDrawdownPct)} />
      </div>
      <div class="font-mono text-[10px] text-muted">
        {tt('backtest.replay_start', { date: horizonStart })}
      </div>
    </div>
  )
}

function Backtest() {
  const [savedCsv, setSavedCsv] = useState(() => loadFillsCsv())
  const isDemo = savedCsv == null
  const csv = savedCsv ?? demoFillsCsv()

  const [benchmarkInput, setBenchmarkInput] = useState('QQQ')
  const [reportCcy, setReportCcy] = useState('USD')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const benchmark = benchmarkInput.trim().toUpperCase() || 'QQQ'
  const fills = useMemo(() => parseFillsCsv(csv), [csv])

  useEffect(() => {
    if (!fills.length) {
      setResult(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const run = async () => {
      const symbols = [...new Set(fills.map((f) => f.symbol))]
      const firstDate = fills[0].date
      const period1 = Math.floor(new Date(firstDate).getTime() / 1000) - 7 * 86_400
      const period2 = Math.floor(Date.now() / 1000)

      const barsList = await Promise.all(symbols.map((s) => fetchCloses(s, period1, period2)))
      const bars = Object.fromEntries(symbols.map((s, i) => [s, barsList[i]]))
      const benchBars = await fetchCloses(benchmark, period1, period2)

      const benchCcy = symbolCurrency(benchmark)
      let finalFills = fills
      let finalBars = bars
      let finalBench = benchBars
      if (needsFx(fills, reportCcy, benchCcy)) {
        const usdcad = await fetchCloses('CAD=X', period1, period2)
        // fills carry an explicit currency — trust it over suffix inference
        const ccyBySymbol = Object.fromEntries(fills.map((f) => [f.symbol, f.currency || 'USD']))
        finalFills = convertFills(fills, reportCcy, usdcad)
        finalBars = convertBars(bars, ccyBySymbol, reportCcy, usdcad)
        // the benchmark is just another symbol-keyed series — convertBars
        // carries the last-known rate over FX-calendar gaps, where an
        // exact-day lookup would poison the curve with NaN
        finalBench = convertBars(
          { [benchmark]: benchBars }, { [benchmark]: benchCcy }, reportCcy, usdcad,
        )[benchmark]
      }

      return assembleBacktest(finalFills, finalBars, finalBench)
    }

    run()
      .then((r) => { if (!cancelled) setResult(r) })
      .catch((e) => { if (!cancelled) setError(String(e.message || e)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [fills, benchmark, reportCcy])

  const field = 'bg-surface-2 border border-line rounded-md px-2 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent'

  return (
    <div class="max-w-2xl flex flex-col gap-3">
      <div class="bg-surface-1 border border-line rounded-xl p-3 flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-[9px] text-muted uppercase tracking-wider">{tl('Benchmark')}</span>
          <input class={`${field} w-24 uppercase`} value={benchmarkInput}
            onInput={(e) => setBenchmarkInput(e.currentTarget.value)} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[9px] text-muted uppercase tracking-wider">{tl('Report currency')}</span>
          <select class={`${field} w-24`} value={reportCcy} onInput={(e) => setReportCcy(e.currentTarget.value)}>
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
          </select>
        </label>
      </div>

      <FillsEditor
        csv={csv}
        isDemo={isDemo}
        onSave={(text) => { saveFillsCsv(text); setSavedCsv(text) }}
        onResetDemo={() => { saveFillsCsv(null); setSavedCsv(null) }}
      />

      {!fills.length && (
        <section class="bg-surface-1 border border-line rounded-xl p-4 font-mono text-[11px] text-muted flex flex-col gap-1.5">
          <span>{tl('No fills yet — add rows to the ledger above.')}</span>
          <span>{tl('CSV format')}: date,symbol,side,qty,price[,currency]</span>
          <span class="text-ink-2">2023-01-10,AAPL,BUY,50,132.50</span>
        </section>
      )}

      {fills.length > 0 && loading && !result && (
        <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
      )}

      {error && <div class="px-1 font-mono text-[11px] text-down">{error}</div>}

      {result && result.dates.length > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl p-3 flex flex-col gap-3 min-w-0">
          <BacktestChart result={result} reportCcy={reportCcy} />
          <BacktestStats result={result} />
        </section>
      )}
    </div>
  )
}

export function Portfolio({ route }) {
  const live = useQuotes(SYMBOLS)
  const priceMap = priceMapOf(live)
  const view = route.sub || 'positions'

  const View = {
    positions: Positions,
    account: Account,
    sizing: Sizing,
    carry: Carry,
    cockpit: Cockpit,
    timeline: Timeline,
    backtest: Backtest,
  }[view] || Positions

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <DemoBanner />
      <View priceMap={priceMap} />
    </div>
  )
}
