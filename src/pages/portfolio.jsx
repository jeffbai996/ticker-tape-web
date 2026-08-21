import { useEffect, useMemo, useState } from 'preact/hooks'
import { shortAccountLabel } from '../lib/accounts.js'
import { boundedTimeScale } from '../lib/chartview.js'
import { useEscape, useQuotes } from '../hooks.js'
import {
  DEMO_POSITIONS, DEMO_CASH, DEMO_BETAS, DEMO_ACCOUNT_ID, DEMO_MARGIN_RATE,
  positionRows, accountSummary, mergeLegs, sizeForWeight, carryAt, stressGrid, nlvWalk,
} from '../lib/demo.js'
import { fmtPrice, fmtPct, fmtPctPlain, fmtChange, fmtRatio } from '../lib/format.js'
import { getLocale, tl, thesisTerm, t as tt } from '../lib/i18n.js'
import { FlashPrice } from '../components/Fig.jsx'
import { Empty, Loading } from '../components/Loading.jsx'
import { ChartMount } from '../components/LazyChart.jsx'
import {
  parseFillsCsv, assembleBacktest, convertFills, convertBars, needsFx, symbolCurrency,
  serverFillsToLedger,
} from '../lib/backtest.js'
import { demoFillsCsv, loadFillsCsv, saveFillsCsv, closesByDateFromChart } from '../lib/backtestData.js'
import { proxyBase } from '../lib/feed.js'
import { wireServiceUrl } from '../lib/wire.js'
import { AiReport, MdLite } from '../components/AiReport.jsx'
import { fetchHistory, prefetchSymbol } from '../lib/history.js'
import { createPCache } from '../lib/pcache.js'
import {
  thesisAnalysisPrompt, thesisHealth, thesisSignals, verdictState, groupBySeverity,
  watcherFreshness, evidenceRows, catalystRows, rotationLedger, candidateRows, toMs,
} from '../lib/thesis.js'
import { StatusPill } from '../components/StatusPill.jsx'
import { countAdvancers } from '../lib/pulse.js'
import { MyPortfolios } from './portfolioMine.jsx'
import { loadPortfolios, onPortfoliosChange } from '../lib/myPortfolios.js'
import { IS_FAMILY_BUILD } from '../lib/nav.js'

const SYMBOLS = DEMO_POSITIONS.map((p) => p.symbol)
const BOTH_ACCOUNTS = 'all'

function priceMapOf(live) {
  const out = {}
  for (const s of SYMBOLS) {
    const q = live[s]?.quote
    if (q) out[s] = q
  }
  return out
}

const money = (v, digits = 0) =>
  v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const dollars = (v) => (v == null ? '—' : `$${money(v)}`)

const signedMoney = (v) =>
  v == null ? '—' : `${v >= 0 ? '+' : '-'}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

const pnlCls = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')

function BookSummary({ rows, margin, fallbackNlv }) {
  const sum = (key) => rows.every((row) => row[key] != null)
    ? rows.reduce((total, row) => total + row[key], 0) : null
  // leverage the way the broker states it: gross position value over NLV.
  // The broker's own GPV wins when present; the row-sum (already in base
  // currency) is the fallback for the demo book.
  const gross = margin?.gross_position_value ?? sum('mktValue')
  const equity = margin?.nlv ?? margin?.equity ?? fallbackNlv ?? null
  const leverage = gross != null && equity ? gross / equity : null
  const dayPnl = sum('dayPnl')
  const unreal = sum('unrealPnl')
  const cushion = margin?.cushion_pct
  // risk runway: maintenance → equity on one bar. The filled span IS the
  // cushion — the one picture that says how far the book is from trouble.
  const maint = margin?.maintenance
  const runway = maint != null && equity ? Math.max(0, Math.min(1, (equity - maint) / equity)) : null
  // day % against yesterday's NLV (equity minus today's move); unreal %
  // against cost basis (gross minus the open gain) — the standard bases
  const dayBase = equity != null && dayPnl != null ? equity - dayPnl : null
  const dayPct = dayBase ? (dayPnl / dayBase) * 100 : null
  const costBase = gross != null && unreal != null ? gross - unreal : null
  const unrealPct = costBase ? (unreal / costBase) * 100 : null
  const pctSpan = (pct, cls) => pct == null ? null : (
    <span class={cls}>{' '}({fmtPct(pct)})</span>
  )
  const chip = (v, pct) =>
    v == null ? null : (
      <span class={`font-anth text-[12px] font-semibold px-2 py-0.5 rounded-md border ${
        v >= 0 ? 'text-up border-up/30 bg-up/10' : 'text-down border-down/30 bg-down/10'}`}>
        {signedMoney(v)}{pctSpan(pct, 'text-[10px] font-normal')}
      </span>
    )
  return (
    <section class="border border-line rounded-xl overflow-hidden bg-surface-1">
      <div class="flex flex-wrap items-stretch">
        <div class="px-4 py-3 flex-1 min-w-[240px]">
          <div class="font-anth text-[9px] uppercase tracking-[.14em] text-muted">NLV</div>
          <div class="font-anth text-[30px] leading-tight font-semibold tracking-tight text-ink">{dollars(equity ?? gross)}</div>
          <div class="flex items-center gap-2 pt-1.5">
            {chip(dayPnl, dayPct)}
            {unreal != null && (
              <span class="font-anth text-[10.5px] text-muted">{tl('unreal')}{' '}
                <span class={`font-semibold ${pnlCls(unreal)}`}>{signedMoney(unreal)}{pctSpan(unrealPct, 'text-[9.5px] font-normal')}</span></span>
            )}
          </div>
        </div>
        <div class="px-4 py-3 flex-[1.4] min-w-[300px] border-l border-line max-sm:border-l-0 max-sm:border-t flex flex-col justify-center gap-2">
          <div class="grid grid-cols-3 gap-3">
            {[
              [tl('Gross exposure'), dollars(gross)],
              [tl('Leverage'), leverage == null ? '—' : `${leverage.toFixed(2)}x`],
              [tl('Excess liquidity'), dollars(margin?.above_maintenance)],
            ].map(([label, value]) => (
              <div key={label}>
                <div class="font-anth text-[8.5px] uppercase tracking-wider text-muted pb-0.5">{label}</div>
                <div class="font-anth text-[15px] font-semibold text-ink">{value}</div>
              </div>
            ))}
          </div>
          {runway != null && (
            <div>
              <div class="flex justify-between font-anth text-[8.5px] uppercase tracking-wider text-muted pb-1">
                <span>{tl('Maintenance')}</span>
                <span class={cushion < 8 ? 'text-down' : 'text-up'}>{tl('Cushion')} {fmtPctPlain(cushion)}</span>
              </div>
              <div class="relative h-2 rounded-full bg-down/25 overflow-hidden">
                <div class={`absolute inset-y-0 right-0 rounded-full ${cushion < 8 ? 'bg-down' : 'bg-up/70'}`}
                  style={{ width: `${(runway * 100).toFixed(1)}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** Every symbol printed on this page is a route into research — the tables
 *  already navigate on row click, the loose stats used to be dead text. */
function SymLink({ sym, class: cls = '' }) {
  if (!sym) return null
  return (
    <a href={`#/research/${String(sym).toLowerCase()}`}
       onMouseEnter={() => prefetchSymbol(sym)}
       class={`hover:no-underline ${cls}`}>
      {sym}
    </a>
  )
}

function BookPulse({ rows }) {
  const priced = rows.filter((row) => row.dayPnl != null)
  const ranked = [...priced].sort((a, b) => b.dayPnl - a.dayPnl)
  const contributor = ranked.find((row) => row.dayPnl >= 0)
  const detractor = [...ranked].reverse().find((row) => row.dayPnl < 0)
  const adv = countAdvancers(priced.map((row) => row.dayPnl))
  const biggest = [...rows].filter((row) => row.weight != null).sort((a, b) => b.weight - a.weight)[0]
  const line = (label, row, cls) => (
    <div class="flex items-baseline gap-2 px-2.5 py-[2px] font-mono text-[10.5px]">
      <span class="text-muted">{label}</span>
      <span class="ml-auto text-ink-2">{row?.symbol ? <SymLink sym={row.symbol} /> : '—'}</span>
      <span class={`w-16 text-right ${cls}`}>{row ? signedMoney(row.dayPnl) : '—'}</span>
    </div>
  )
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('Book pulse')}</h2>
      </header>
      <div class="py-1">
        <div class="flex justify-between px-2.5 py-[2px] font-mono text-[10.5px]"><span class="text-muted">{tl('A/D')}</span><span><span class="text-up">{adv}</span><span class="text-muted"> / </span><span class="text-down">{priced.length - adv}</span></span></div>
        {line(tl('Top contributor'), contributor, 'text-up')}
        {line(tl('Top detractor'), detractor, 'text-down')}
        <div class="flex justify-between px-2.5 py-[2px] font-mono text-[10.5px]"><span class="text-muted">{tl('Largest line')}</span><span class="text-ink-2">{biggest ? <><SymLink sym={biggest.symbol} /> {fmtPctPlain(biggest.weight)}</> : '—'}</span></div>
      </div>
    </section>
  )
}

function Positions({ priceMap, positions, margin, accountId }) {
  const combined = accountId === BOTH_ACCOUNTS
  // Both = the broker's consolidated card: same contract across accounts is
  // ONE line at blended avg cost, so P&L% matches the ibkr readout
  const legs = combined ? mergeLegs(positions) : positions
  const rows = positionRows(legs, priceMap)
  const fallback = accountSummary(legs, priceMap)
  const tot = (k) => (rows.every((r) => r[k] != null) ? rows.reduce((s, r) => s + r[k], 0) : null)
  // aggregate by symbol for the weight ladder — CDR + US lines merge
  const bySym = new Map()
  for (const r of rows) {
    if (r.weight == null) continue
    bySym.set(r.symbol, (bySym.get(r.symbol) || 0) + r.weight)
  }
  const ladder = [...bySym.entries()].sort((a, b) => b[1] - a[1])
  const maxW = ladder.length ? ladder[0][1] : 1

  return (
    <div class="flex flex-col gap-2">
    <BookSummary rows={rows} margin={margin} fallbackNlv={fallback.nlv} />
    <div class="flex flex-col gap-2">
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto">
      <table class="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
            <th class="px-3 py-2 text-left">{tl('Sym')}</th>
            {combined && <th class="px-2 py-2 text-left">{tl('Account')}</th>}
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
            <tr key={`${r.account || ''}-${r.symbol}-${r.currency || ''}`} class="border-t border-line hover:bg-surface-3 cursor-pointer"
              onClick={() => (location.hash = `#/research/${r.symbol.toLowerCase()}`)}>
              <td class="px-3 py-[3px] font-bold text-accent">{r.symbol}</td>
              {combined && <td class="px-2 py-[3px] font-anth text-[10px] text-muted whitespace-nowrap">{tl(shortAccountLabel(r.accountLabel || r.account_label)) || '—'}</td>}
              <td class="px-2 py-[3px] text-right text-muted text-[10.5px]">{r.shares}</td>
              <td class="px-2 py-[3px] text-right text-muted text-[10.5px]">{fmtPrice(r.avgCost)}</td>
              <td class="px-2 py-[3px] text-right text-ink-2 font-medium"><FlashPrice price={r.price} fmt={fmtPrice} /></td>
              <td class="px-2 py-[3px] text-right text-ink font-semibold text-[12px]">{money(r.mktValue)}</td>
              <td class="px-2 py-[3px] text-right text-ink-2 font-medium">{fmtPctPlain(r.weight)}</td>
              <td class={`px-2 py-[3px] text-right font-semibold ${pnlCls(r.dayPnl)}`}>
                {signedMoney(r.dayPnl)} {r.dayPct != null && <span class="text-[10px] font-normal">({fmtPct(r.dayPct)})</span>}
              </td>
              <td class={`px-3 py-[3px] text-right font-semibold text-[12px] ${pnlCls(r.unrealPnl)}`}>
                {signedMoney(r.unrealPnl)} {r.unrealPct != null && <span class="text-[10.5px] font-normal">({fmtPct(r.unrealPct)})</span>}
              </td>
            </tr>
          ))}
          <tr class="border-t border-line-2 bg-surface-2 font-bold">
            <td class="px-3 py-[6px] text-ink" colSpan={combined ? 5 : 4}>{tl('Total')}</td>
            <td class="px-2 py-[6px] text-right text-ink text-[12.5px]">{money(tot('mktValue'))}</td>
            <td class="px-2 py-[6px] text-right text-ink-2">100%</td>
            <td class={`px-2 py-[6px] text-right text-[12.5px] ${pnlCls(tot('dayPnl'))}`}>{signedMoney(tot('dayPnl'))}</td>
            <td class={`px-3 py-[6px] text-right text-[12.5px] ${pnlCls(tot('unrealPnl'))}`}>{signedMoney(tot('unrealPnl'))}</td>
          </tr>
        </tbody>
      </table>
    </section>

    {/* the analytics used to live in a side rail hidden below xl — on an
        iPad that meant a table over a black void (Jeff 2026-08-05) */}
    <div class="grid gap-2 md:grid-cols-3 items-start">
      <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
        <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('Concentration')}</h2>
        </header>
        <div class="px-2.5 py-1.5">
          {ladder.map(([sym, w]) => (
            <div key={sym} class="flex items-center gap-2 py-[2px] font-mono text-[10.5px]">
              <span class="w-12 font-[650] font-tick text-ink"><SymLink sym={sym} /></span>
              <div class="flex-1 h-3 relative">
                <div class="absolute inset-y-0 left-0 rounded-sm bg-accent/30"
                  style={{ width: `${(w / maxW) * 100}%` }} />
              </div>
              <span class="w-11 text-right text-ink-2">{fmtPctPlain(w)}</span>
            </div>
          ))}
        </div>
      </section>
      {margin && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
            <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('Margin')}</h2>
          </header>
          <div class="px-2.5 py-1.5 font-mono text-[11px] leading-[1.7]">
            {margin.equity != null && <div class="flex justify-between"><span class="text-muted">{tl('Equity')}</span><span class="text-ink font-semibold">{dollars(margin.equity)}</span></div>}
            {margin.maintenance != null && <div class="flex justify-between"><span class="text-muted">{tl('Maintenance')}</span><span class="text-ink-2">{dollars(margin.maintenance)}</span></div>}
            {margin.above_maintenance != null && <div class="flex justify-between"><span class="text-muted">{tl('Above maintenance')}</span><span class="text-ink-2">{dollars(margin.above_maintenance)}</span></div>}
            {margin.cushion_pct != null && <div class="flex justify-between"><span class="text-muted">{tl('Cushion')}</span>
              <span class={`font-semibold ${margin.cushion_pct < 8 ? 'text-down' : 'text-up'}`}>{fmtPctPlain(margin.cushion_pct, 2)}</span></div>}
          </div>
        </section>
      )}
      <BookPulse rows={rows} />
    </div>
    </div>
    </div>
  )
}

function AccountStat({ label, value, cls = 'text-ink' }) {
  return (
    <div class="bg-surface-1 border border-line rounded-xl px-4 py-3">
      <div class="text-[9px] text-muted uppercase tracking-wider pb-1">{label}</div>
      <div class={`font-mono text-[19px] font-semibold tracking-tight ${cls}`}>{value}</div>
    </div>
  )
}

function Account({ priceMap, positions, margin, account }) {
  const s = accountSummary(positions, priceMap)
  const live = !!margin
  const rows = positionRows(positions, priceMap)
  const gross = rows.every((row) => row.mktValue != null)
    ? rows.reduce((total, row) => total + row.mktValue, 0) : null
  const leverage = gross != null && margin?.equity ? gross / margin.equity : s.leverage
  const dayPnl = rows.every((row) => row.dayPnl != null)
    ? rows.reduce((total, row) => total + row.dayPnl, 0) : null
  const unrealPnl = rows.every((row) => row.unrealPnl != null)
    ? rows.reduce((total, row) => total + row.unrealPnl, 0) : null
  return (
    <div class="max-w-4xl">
      <div class="px-1 pb-2 font-mono text-[11px] text-muted">
        {tl('Account')} <span class="text-ink-2">{account || DEMO_ACCOUNT_ID}</span> · {live ? tt('portfolio.live_book') : tt('demo.formulas')}
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AccountStat label="NLV" value={dollars(margin?.equity ?? s.nlv)} />
        {!live && <AccountStat label={tl('Cash')} value={dollars(s.cash)} />}
        <AccountStat label={tl('Gross exposure')} value={dollars(gross ?? s.gross)} />
        <AccountStat label={tl('Leverage')} value={leverage != null ? `${leverage.toFixed(2)}x` : '—'} />
        <AccountStat label={tl('Maintenance')} value={dollars(margin?.maintenance ?? s.maintenance)} />
        <AccountStat label={tl('Excess liquidity')} value={dollars(margin?.above_maintenance ?? s.excessLiq)} />
        <AccountStat label={tl('Cushion')} value={fmtPctPlain(margin?.cushion_pct ?? s.cushionPct)}
          cls={(margin?.cushion_pct ?? s.cushionPct) != null && (margin?.cushion_pct ?? s.cushionPct) < 15 ? 'text-down' : 'text-up'} />
        <AccountStat label={tl('Day P&L')} value={signedMoney(dayPnl)} cls={pnlCls(dayPnl)} />
        <AccountStat label={tl('Unreal P&L')} value={signedMoney(unrealPnl)} cls={pnlCls(unrealPnl)} />
      </div>
    </div>
  )
}

function Sizing({ priceMap, positions }) {
  const [symbol, setSymbol] = useState('MSFT')
  const [targetPct, setTargetPct] = useState('10')
  const sym = symbol.trim().toUpperCase()
  const live = useQuotes(sym ? [sym] : [])
  const q = live[sym]?.quote
  const s = accountSummary(positions, priceMap)
  const held = positions.find((p) => p.symbol === sym)?.shares || 0
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

function Carry({ priceMap, positions }) {
  const [lev, setLev] = useState(1.5)
  const s = accountSummary(positions, priceMap)
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

function Cockpit({ priceMap, positions }) {
  const rows = positionRows(positions, priceMap)
  const s = accountSummary(positions, priceMap)
  const grid = stressGrid(positions, priceMap)
  const weights = rows.map((r) => r.weight).filter((w) => w != null)
  const top = weights.length ? Math.max(...weights) : null
  const hhi = weights.length ? weights.reduce((a, w) => a + (w / 100) ** 2, 0) : null

  return (
    <div class="max-w-2xl flex flex-col gap-3">
      <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
        <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Stress test')}</h2>
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
                  <td class={`px-3 py-[3px] font-bold ${move < 0 ? 'text-down' : 'text-up'}`}>{move > 0 ? '+' : ''}{move}%</td>
                  <td class={`px-2 py-[3px] text-right ${pnlCls(pnl)}`}>{signedMoney(pnl)}</td>
                  <td class="px-2 py-[3px] text-right text-ink">{money(nlvAfter)}</td>
                  <td class="px-3 py-[3px] text-right text-ink-2">
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
        <AccountStat label={tl('Top position')} value={fmtPctPlain(top)} />
        <AccountStat label={tl('Concentration (HHI)')} value={hhi != null ? hhi.toFixed(3) : '—'} />
        <AccountStat label={tl('Cushion')} value={fmtPctPlain(s.cushionPct)}
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

function Timeline({ priceMap, positions, accountId }) {
  const s = accountSummary(positions, priceMap)
  // real accrued NLV rows from fragwire's snapshot store — the curve is
  // honest: it starts the day the store went live and grows forward
  const [days, setDays] = useState(null)
  const wired = !!wireBase()
  useEffect(() => {
    if (!wired || !accountId || accountId === BOTH_ACCOUNTS) { setDays([]); return }
    let dead = false
    fetch(`${wireBase()}/api/portfolio/history?account=${encodeURIComponent(accountId)}`,
      { signal: AbortSignal.timeout(10_000) })
      .then((r) => r.json())
      .then((out) => { if (!dead) setDays(out.ok ? (out.days || []).filter((d) => d.nlv != null) : []) })
      .catch(() => { if (!dead) setDays([]) })
    return () => { dead = true }
  }, [accountId])
  const real = wired && Array.isArray(days) && days.length >= 2

  // Runs once the chart chunk is on the page. The `wired && !real` guard the
  // effect used to carry now lives in the render condition below — the box is
  // simply not mounted in that state — so nothing here draws the fake walk on
  // the wire build.
  const draw = (host, { createChart, AreaSeries }) => {
    if (!real && s.nlv == null) return undefined
    const chart = createChart(host, {
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
      timeScale: boundedTimeScale(false),
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: '#f59e0b',
      topColor: 'rgba(245, 158, 11, 0.25)',
      bottomColor: 'rgba(245, 158, 11, 0.0)',
      lineWidth: 1.5,
    })
    series.setData(real
      ? days.map((d) => ({ time: d.date, value: d.nlv }))
      : nlvWalk('ttw-demo-nlv', 252, s.nlv))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }

  return (
    <section class="bg-surface-1 border border-line rounded-xl p-2 max-w-4xl min-w-0">
      <div class="px-2 pb-1 font-mono text-[11px] text-muted">
        {real
          ? `NLV · ${tl('snapshots since')} ${days[0].date} · ${days.length} ${tl('days')}`
          : wired
            ? `${tl('snapshot store live — the curve draws itself as daily history accrues')}${days?.length ? ` (${days.length}/2)` : ''}`
            : tt('demo.timeline_note')}
      </div>
      {(real || !wired) && (
        <ChartMount class="h-[380px] w-full" deps={[s.nlv, real, days]} mount={draw}
          placeholder={<Loading label={tt('common.loading')} />} />
      )}
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
        <span class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
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

function Backtest({ accountId }) {
  const [savedCsv, setSavedCsv] = useState(() => loadFillsCsv())
  const isDemo = savedCsv == null
  const csv = savedCsv ?? demoFillsCsv()

  // the broker's own executions, accrued in fragwire's fills ledger — the
  // real trade history replaces the hand-typed CSV wherever it exists.
  // sweep=1 pulls the last 7 days off ibkr-mcp first, so an open page is
  // never staler than the broker.
  const [serverFills, setServerFills] = useState(null)
  const [source, setSourceState] = useState(() => localStorage.getItem('bt_source_v1') || 'broker')
  const setSource = (v) => { setSourceState(v); localStorage.setItem('bt_source_v1', v) }
  useEffect(() => {
    if (!wireBase() || !accountId || accountId === BOTH_ACCOUNTS) { setServerFills([]); return }
    let dead = false
    fetch(`${wireBase()}/api/portfolio/fills?account=${encodeURIComponent(accountId)}&sweep=1`,
      { signal: AbortSignal.timeout(30_000) })
      .then((r) => r.json())
      .then((out) => { if (!dead) setServerFills(out.ok ? serverFillsToLedger(out.fills) : []) })
      .catch(() => { if (!dead) setServerFills([]) })
    return () => { dead = true }
  }, [accountId])
  const brokerN = serverFills?.length || 0
  const useBroker = source === 'broker' && brokerN > 0

  const [benchmarkInput, setBenchmarkInput] = useState('QQQ')
  const [reportCcy, setReportCcy] = useState('USD')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const benchmark = benchmarkInput.trim().toUpperCase() || 'QQQ'
  const fills = useMemo(
    () => (useBroker ? serverFills : parseFillsCsv(csv)),
    [useBroker, serverFills, csv])

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

      {wireBase() && accountId !== BOTH_ACCOUNTS && (
        <div class="flex items-center gap-1 font-mono text-[10px]">
          {[['broker', `${tl('broker ledger')}${brokerN ? ` · ${brokerN}` : ''}`],
            ['manual', tl('manual csv')]].map(([v, label]) => (
            <button key={v} onClick={() => setSource(v)}
              disabled={v === 'broker' && !brokerN}
              class={`px-2 py-0.5 rounded-md border ${source === v && (v !== 'broker' || brokerN)
                ? 'border-accent-2 text-accent-2 bg-accent-2-soft'
                : 'border-line text-muted hover:text-ink'} disabled:opacity-40`}>
              {label}
            </button>
          ))}
          {!brokerN && serverFills !== null && (
            <span class="text-muted font-anth text-[10.5px]">
              {tl('no broker fills accrued yet — the ledger fills in as you trade')}
            </span>
          )}
        </div>
      )}
      {!useBroker && <FillsEditor
        csv={csv}
        isDemo={isDemo}
        onSave={(text) => { saveFillsCsv(text); setSavedCsv(text) }}
        onResetDemo={() => { saveFillsCsv(null); setSavedCsv(null) }}
      />}

      {!fills.length && (
        <section class="bg-surface-1 border border-line rounded-xl p-4 font-mono text-[11px] text-muted flex flex-col gap-1.5">
          <span>{tl('No fills yet — add rows to the ledger above.')}</span>
          <span>{tl('CSV format')}: date,symbol,side,qty,price[,currency]</span>
          <span class="text-ink-2">2023-01-10,AAPL,BUY,50,132.50</span>
        </section>
      )}

      {fills.length > 0 && loading && !result && (
        <Loading label={tt('common.loading')} minH={220} />
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

const wireBase = () => (wireServiceUrl() ? wireServiceUrl().replace(/\/$/, '') : '')

function NeedsWire() {
  return (
    <div class="px-1 font-mono text-[11.5px] text-muted max-w-lg leading-relaxed">
      this view reads the live broker link, which only exists on the private
      wire build.
    </div>
  )
}

/** Markdown panel fed by a fragwire→IBKR tool endpoint. */
function IbkrMd({ url, empty }) {
  const [state, setState] = useState({ status: 'loading', md: '' })
  useEffect(() => {
    let dead = false
    setState({ status: 'loading', md: '' })
    fetch(url, { signal: AbortSignal.timeout(30_000) })
      .then((r) => r.json())
      .then((out) => !dead && setState(out.ok
        ? { status: 'ok', md: out.markdown }
        : { status: 'err', md: out.error || 'failed' }))
      .catch((err) => !dead && setState({ status: 'err', md: String(err.message || err) }))
    return () => { dead = true }
  }, [url])
  if (state.status === 'loading') return <Loading label={tt('portfolio.gateway_loading')} minH={120} />
  if (state.status === 'err') return <div class="px-1 py-2 font-mono text-[11px] text-down">{state.md}</div>
  if (!state.md.trim()) return <Empty label={empty || tt('portfolio.gateway_empty')} />
  return (
    <section class="bg-surface-1 border border-line rounded-xl px-3 py-2 font-anth text-[12.5px] leading-relaxed text-ink-2 max-w-3xl overflow-x-auto">
      <MdLite text={state.md} />
    </section>
  )
}

function WhatIf({ accountId, positions }) {
  const [action, setAction] = useState('SELL')
  const [symbol, setSymbol] = useState('')
  const [qty, setQty] = useState('')
  const [url, setUrl] = useState('')
  if (!wireBase()) return <NeedsWire />
  if (accountId === BOTH_ACCOUNTS) return <div class="px-1 font-anth text-[11.5px] text-muted">{tt('portfolio.pick_one_account')}</div>
  const run = (e) => {
    e.preventDefault()
    const sym = symbol.trim().toUpperCase()
    const n = parseInt(qty, 10)
    if (!sym || !n) return
    setUrl(`${wireBase()}/api/ibkr/what-if?action=${action}&symbol=${encodeURIComponent(sym)}&quantity=${n}&account=${encodeURIComponent(accountId || '')}`)
  }
  // one tap loads a held name; the fraction chips then speak in position
  // language (¼ / ½ / all of what you actually hold), not raw share counts
  const held = (positions || []).filter((p) => p.shares > 0)
  const active = held.find((p) => p.symbol === symbol.trim().toUpperCase())
  return (
    <div class="flex flex-col gap-2 max-w-3xl">
      {held.length > 0 && (
        <div class="flex items-center gap-1 flex-wrap font-mono text-[10px]">
          <span class="text-muted uppercase tracking-wider text-[9px] mr-1">{tl('positions')}</span>
          {held.map((p) => (
            <button key={`${p.symbol}-${p.currency}`} type="button"
              onClick={() => { setSymbol(p.symbol); if (!qty) setQty(String(Math.max(1, Math.round(p.shares / 4)))) }}
              class={`px-1.5 py-px rounded-full border ${p.symbol === active?.symbol
                ? 'border-accent text-accent bg-accent-soft'
                : 'border-line text-ink-2 hover:border-accent/50 hover:text-accent'}`}>
              {p.symbol} <span class="text-muted">{Math.round(p.shares)}</span>
            </button>
          ))}
        </div>
      )}
      <form onSubmit={run} class="flex items-center gap-2 flex-wrap font-mono text-[11.5px]">
        <div class="flex gap-0.5 bg-surface-2 border border-line rounded-lg p-0.5">
          {['BUY', 'SELL'].map((a) => (
            <button key={a} type="button" onClick={() => setAction(a)}
              class={`px-2.5 py-1 rounded-md font-semibold ${action === a
                ? (a === 'BUY' ? 'bg-up text-black' : 'bg-down text-black')
                : 'text-muted hover:text-ink'}`}>{a}</button>
          ))}
        </div>
        <input value={qty} onInput={(e) => setQty(e.currentTarget.value)} placeholder={tl('qty')} inputMode="numeric"
          class="w-20 bg-surface-2 border border-line rounded-lg px-2 py-1 text-ink outline-none focus:border-accent" />
        <input value={symbol} onInput={(e) => setSymbol(e.currentTarget.value)} placeholder="SYM"
          class="w-24 bg-surface-2 border border-line rounded-lg px-2 py-1 text-ink uppercase outline-none focus:border-accent" />
        {active && (
          <span class="flex gap-1">
            {[['¼', 0.25], ['½', 0.5], [tl('all'), 1]].map(([label, f]) => (
              <button key={label} type="button"
                onClick={() => setQty(String(Math.max(1, Math.round(active.shares * f))))}
                class="px-1.5 py-0.5 rounded border border-line-2 text-muted hover:text-accent hover:border-accent/50 text-[10px]">
                {label}
              </button>
            ))}
          </span>
        )}
        <button class="border border-accent text-accent bg-accent-soft rounded-lg px-3 py-1 font-semibold hover:bg-accent hover:text-black">
          run what-if
        </button>
        <span class="text-[10px] text-muted">{tt('portfolio.margin_preview')}</span>
      </form>
      {url && <IbkrMd url={url} />}
      {/* buying-room context lives on the same page as the question it
          answers — the ladder shows headroom per name before you what-if.
          Fetch only on open: it's a real gateway round-trip. */}
      <LadderFold accountId={accountId} />
    </div>
  )
}

function LadderFold({ accountId }) {
  const [open, setOpen] = useState(false)
  return (
    <div class="max-w-3xl">
      <button type="button" onClick={() => setOpen((v) => !v)}
        class="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-accent px-1 py-1">
        {open ? '▾' : '▸'} {tl('margin ladder')}
      </button>
      {open && <IbkrMd url={`${wireBase()}/api/ibkr/margin-ladder?account=${encodeURIComponent(accountId || '')}`} />}
    </div>
  )
}

function Trades({ accountId }) {
  const [view, setView] = useState('fills')
  const [filter, setFilter] = useState('')
  const [applied, setApplied] = useState('')
  if (!wireBase()) return <NeedsWire />
  if (accountId === BOTH_ACCOUNTS) return <div class="px-1 font-anth text-[11.5px] text-muted">{tt('portfolio.pick_one_account')}</div>
  const qs = `view=${view}&account=${encodeURIComponent(accountId || '')}`
    + (applied ? `&symbol_filter=${encodeURIComponent(applied)}` : '')
  return (
    <div class="flex flex-col gap-2 max-w-3xl">
      <div class="flex items-center gap-1 flex-wrap font-mono text-[11px]">
        {['fills', 'orders'].map((v) => (
          <button key={v} onClick={() => setView(v)}
            class={`border rounded-md px-2.5 py-0.5 font-semibold ${view === v
              ? 'bg-accent border-accent text-black' : 'border-line text-ink-2 hover:text-ink'}`}>{v}</button>
        ))}
        <form class="ml-2 flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); setApplied(filter.trim().toUpperCase()) }}>
          <input value={filter} onInput={(e) => setFilter(e.currentTarget.value)}
            placeholder="SYM" title={tl('filter by symbol')}
            class="w-20 bg-surface-2 border border-line rounded-md px-2 py-0.5 text-ink uppercase outline-none focus:border-accent placeholder:text-muted" />
          {applied && (
            <button type="button" onClick={() => { setFilter(''); setApplied('') }}
              class="text-muted hover:text-down text-[10px]">✕ {applied}</button>
          )}
        </form>
      </div>
      <IbkrMd url={`${wireBase()}/api/ibkr/trades?${qs}`} empty="no executions this session" />
      {/* cash coming to the book rides along with what left it */}
      <DividendsFold accountId={accountId} />
    </div>
  )
}

function DividendsFold({ accountId }) {
  const [open, setOpen] = useState(false)
  return (
    <div class="max-w-3xl">
      <button type="button" onClick={() => setOpen((v) => !v)}
        class="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-accent px-1 py-1">
        {open ? '▾' : '▸'} {tl('upcoming dividends')}
      </button>
      {open && <IbkrMd url={`${wireBase()}/api/ibkr/dividends?scope=calendar&account=${encodeURIComponent(accountId || '')}`} />}
    </div>
  )
}

// ── Thesis Watcher ───────────────────────────────────────────────────────
// A monitoring surface, not a list. The watcher's whole point is that a
// condition can be FIRED, CLEAR, blind (NO DATA — an automated detector that
// cannot see is itself a risk) or simply unreviewed (AWAITING REVIEW). Those
// four never share a colour here, and the human trigger — recording a manual
// reading — is one expand away from every row.

async function postThesis(path, body) {
  const resp = await fetch(`${wireBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (resp.status === 404 || resp.status === 405) {
    const err = new Error('unsupported')
    err.unsupported = true
    throw err
  }
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  const out = await resp.json().catch(() => ({}))
  if (out && out.ok === false) throw new Error(out.error || 'write refused')
  return out
}

const stamp = (ms) => (ms == null ? '' : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
const stampFull = (ms) => (ms == null ? '' : new Date(ms).toLocaleString('en-US',
  { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))

function FreshChip({ fresh }) {
  if (!fresh) return <span class="font-mono text-[9px] text-muted">{tl('never run')}</span>
  const detail = [
    fresh.kind && `${tl('run')}: ${fresh.kind}`,
    fresh.evaluated != null && `${tl('evaluated')}: ${fresh.evaluated}`,
    fresh.fired != null && `${tl('fired')}: ${fresh.fired}`,
    stampFull(fresh.ms),
  ].filter(Boolean).join(' · ')
  return (
    <StatusPill tone={fresh.tone === 'clear' ? 'muted' : fresh.tone} title={detail}>
      {fresh.source === 'run' ? tl('watcher ran') : tl('db written')} {fresh.age} {tl('ago')}
    </StatusPill>
  )
}

function ManualEntry({ breaker, onDone }) {
  const [open, setOpen] = useState(false)
  const [fired, setFired] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!open) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        class="mt-2 font-mono text-[10px] uppercase tracking-wider text-accent border border-accent/40 rounded-md px-2 py-1 hover:bg-accent-soft">
        {tl('record manual reading')}
      </button>
    )
  }
  const commit = async () => {
    setBusy(true)
    setErr('')
    try {
      await postThesis('/api/thesis/manual', { breaker_id: breaker.id, fired, note: note.trim() })
      setOpen(false)
      setNote('')
      onDone({ ok: true })
    } catch (error) {
      if (error.unsupported) {
        setOpen(false)
        onDone({ unsupported: true })
      } else setErr(tl('could not record — try again'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div class="mt-2 border border-line rounded-lg p-2 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <div class="flex items-center gap-1 font-mono text-[10px]">
        <span class="text-muted uppercase tracking-wider mr-1">{tl('reading')}</span>
        {[[false, tl('condition holds')], [true, tl('condition breached')]].map(([value, label]) => (
          <button key={String(value)} type="button" onClick={() => setFired(value)}
            class={`border rounded-md px-2 py-0.5 font-semibold ${fired === value
              ? (value ? 'bg-down border-down text-black' : 'bg-up/20 border-up/50 text-up')
              : 'border-line text-ink-2 hover:text-ink'}`}>{label}</button>
        ))}
      </div>
      <textarea value={note} rows={2} onInput={(e) => setNote(e.currentTarget.value)}
        placeholder={tl('what did you read, and where')}
        class="w-full bg-surface-2 border border-line rounded-md px-2 py-1 font-anth text-[12px] text-ink outline-none focus:border-accent placeholder:text-muted" />
      <div class="flex items-center gap-2">
        <button type="button" disabled={busy || !note.trim()} onClick={commit}
          class="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-accent text-black font-bold disabled:opacity-40">
          {busy ? tl('saving…') : tl('commit reading')}
        </button>
        <button type="button" onClick={() => { setOpen(false); setErr('') }}
          class="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink">{tl('cancel')}</button>
        {err && <span class="font-mono text-[10px] text-down">{err}</span>}
        {!note.trim() && <span class="font-mono text-[9px] text-muted">{tl('a note is required')}</span>}
      </div>
    </div>
  )
}

function BreakerDrawer({ breaker, canWrite, onWrote, onUnsupported }) {
  const rows = evidenceRows(breaker.evidence)
  const history = Array.isArray(breaker.manual_history) ? breaker.manual_history : []
  const alerted = toMs(breaker.alerted_at)
  return (
    <div class="border-t border-line-2 bg-surface-2 px-3 py-2.5 flex flex-col gap-2.5">
      {breaker.reason && (
        <div>
          <div class="font-mono text-[9px] uppercase tracking-wider text-muted pb-0.5">{tl('reason')}</div>
          <div class="font-anth text-[12px] text-ink-2 leading-snug">{breaker.reason}</div>
        </div>
      )}
      {rows.length > 0 && (
        <div>
          <div class="font-mono text-[9px] uppercase tracking-wider text-muted pb-1">{tl('evidence')}</div>
          <dl class="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-1">
            {rows.map((row) => (
              <div key={row.key} class="contents">
                <dt class="font-mono text-[10px] text-muted truncate" title={row.label}>{row.label}</dt>
                <dd class="font-mono text-[11px] text-ink break-words">
                  {/^https?:\/\//.test(row.value)
                    ? <a href={row.value} target="_blank" rel="noopener" class="text-accent hover:underline break-all">{row.value}</a>
                    : row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {history.length > 0 && (
        <div>
          <div class="font-mono text-[9px] uppercase tracking-wider text-muted pb-1">{tl('manual history')}</div>
          <div class="flex flex-col gap-1">
            {history.map((entry, i) => (
              <div key={i} class="flex items-baseline gap-2">
                <StatusPill tone={entry.fired ? 'fired' : 'clear'}>
                  {entry.fired ? tl('breached') : tl('holds')}
                </StatusPill>
                <span class="font-anth text-[11.5px] text-ink-2 leading-snug">{entry.note}</span>
                <span class="ml-auto font-mono text-[9px] text-muted shrink-0">{stamp(toMs(entry.created_at))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div class="flex flex-wrap items-center gap-x-3 font-mono text-[9.5px] text-muted">
        {alerted != null && <span>{tl('alerted')} {stampFull(alerted)}</span>}
        {breaker.updated_at != null && <span>{tl('updated')} {stampFull(toMs(breaker.updated_at))}</span>}
        <span>{breaker.auto === false ? tl('manual condition') : tl('automated detector')}</span>
      </div>
      {rows.length === 0 && !breaker.reason && (
        <div class="font-anth text-[11.5px] text-muted">{tl('no evidence recorded for this condition yet')}</div>
      )}
      {canWrite && (
        <ManualEntry breaker={breaker} onDone={(res) => {
          if (res.unsupported) onUnsupported()
          else onWrote()
        }} />
      )}
    </div>
  )
}

function BreakerRow({ breaker, open, onToggle, canWrite, onWrote, onUnsupported }) {
  const state = verdictState(breaker)
  const updated = toMs(breaker.updated_at)
  // "no manual input recorded" is what AWAITING already says on the pill
  const reason = /^no manual input recorded/i.test(breaker.reason || '') ? '' : breaker.reason
  return (
    <div class={`border-t border-line/50 first:border-0${open ? ' bg-surface-3/50' : ''}`}>
      <div role="button" tabIndex={0} aria-expanded={open} onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        class="px-3 py-2 cursor-pointer hover:bg-surface-3 group">
        <div class="flex items-center gap-2 flex-wrap">
          <StatusPill tone={state.tone}>{thesisTerm(state.label)}</StatusPill>
          <span class="font-mono text-[9px] uppercase tracking-wider text-ink-2 border border-line rounded px-1.5 py-[1px]">
            {thesisTerm(String(breaker.category || '').replaceAll('_', ' '))}
          </span>
          {breaker.auto === false && (
            <span class="font-mono text-[9px] uppercase tracking-wider text-muted" title={tl('manual condition')}>{tl('manual')}</span>
          )}
          <span class="ml-auto font-mono text-[9px] text-muted">{stamp(updated)}</span>
          <span class="font-mono text-[10px] text-muted group-hover:text-accent" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </div>
        <div class="font-anth text-[12.5px] text-ink leading-snug pt-1">{breaker.description || breaker.id}</div>
        {reason && !open && <div class="font-mono text-[10.5px] text-muted pt-0.5 truncate">{reason}</div>}
      </div>
      {open && (
        <BreakerDrawer breaker={breaker} canWrite={canWrite} onWrote={onWrote} onUnsupported={onUnsupported} />
      )}
    </div>
  )
}

function CandidateRow({ candidate, canWrite, onSettled, onUnsupported }) {
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const send = async (action, text) => {
    setBusy(true)
    setErr('')
    // optimistic: the row leaves the queue now, comes back on failure
    onSettled(candidate.key, action)
    try {
      await postThesis(`/api/thesis/candidates/${encodeURIComponent(candidate.id)}`,
        text ? { action, note: text } : { action })
      setNoting(false)
    } catch (error) {
      onSettled(candidate.key, null)
      if (error.unsupported) onUnsupported()
      else setErr(tl('action failed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div class="border-t border-line/50 first:border-0 px-3 py-2">
      <div class="flex items-start gap-2">
        <div class="min-w-0 font-anth text-[12px] text-ink-2 leading-snug">
          {candidate.url
            ? <a href={candidate.url} target="_blank" rel="noopener" class="hover:text-accent">{candidate.summary}</a>
            : candidate.summary}
          {candidate.breaker_id && (
            <span class="ml-2 font-mono text-[9px] uppercase tracking-wider text-muted">{candidate.breaker_id}</span>
          )}
        </div>
        <span class="ml-auto shrink-0 font-mono text-[9px] text-muted">{stamp(toMs(candidate.created_at))}</span>
      </div>
      {canWrite && candidate.actionable && (
        <div class="flex flex-wrap items-center gap-2 pt-1.5">
          {noting ? (
            <>
              <input value={note} autofocus onInput={(e) => setNote(e.currentTarget.value)}
                placeholder={tl('why does this matter')}
                class="flex-1 min-w-[10rem] bg-surface-2 border border-line rounded-md px-2 py-0.5 font-anth text-[11.5px] text-ink outline-none focus:border-accent placeholder:text-muted" />
              <button type="button" disabled={busy} onClick={() => send('confirm', note.trim())}
                class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-accent text-black font-bold disabled:opacity-40">
                {tl('save')}
              </button>
              <button type="button" onClick={() => setNoting(false)}
                class="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink">{tl('cancel')}</button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => setNoting(true)}
                class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-up/50 text-up hover:bg-up/10">
                {tl('confirm')}
              </button>
              <button type="button" disabled={busy} onClick={() => send('dismiss')}
                class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-line text-muted hover:text-down">
                {tl('dismiss')}
              </button>
            </>
          )}
          {err && <span class="font-mono text-[10px] text-down">{err}</span>}
        </div>
      )}
    </div>
  )
}

function Thesis() {
  const [snap, setSnap] = useState(null)
  const [signals, setSignals] = useState([])
  const [nonce, setNonce] = useState(0)
  const [openKey, setOpenKey] = useState('')
  // writes stay hidden until the server proves it has the endpoints; a 404
  // means this fragwire predates them, and faking a confirmation would be a lie
  const [canWrite, setCanWrite] = useState(true)
  const [settled, setSettled] = useState({})
  useEscape(() => setOpenKey(''), !!openKey)
  useEffect(() => {
    if (!wireBase()) return
    let cancelled = false
    const read = async (path) => {
      const response = await fetch(`${wireBase()}${path}`, { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`wire ${response.status}`)
      return response.json()
    }
    Promise.all([
      read('/api/breakers'),
      read('/api/events?limit=240&newest=1').then((out) => thesisSignals(out.events)).catch(() => []),
    ]).then(([snapshot, nextSignals]) => {
      if (cancelled) return
      setSnap(snapshot)
      setSignals(nextSignals)
    }).catch(() => {
      if (!cancelled) setSnap({ ok: false })
    })
    return () => { cancelled = true }
  }, [nonce])
  if (!wireBase()) return <NeedsWire />
  if (!snap) return <Loading label={tt('portfolio.watcher_loading')} minH={160} />
  if (!snap.available) return <div class="px-1 py-2 font-mono text-[11px] text-muted">{tt('portfolio.watcher_unavailable')}</div>

  const breakers = Array.isArray(snap.breakers) ? snap.breakers : []
  const health = thesisHealth(breakers)
  const groups = groupBySeverity(breakers)
  const fresh = watcherFreshness(snap.freshness)
  const ledger = rotationLedger(snap.rotation)
  const cats = catalystRows(snap.catalysts)
  const queue = candidateRows(snap.candidates).filter((c) => !settled[c.key])
  const reload = () => setNonce((n) => n + 1)
  const byId = new Map(breakers.map((b) => [b.id, b]))

  return (
    <div class="flex flex-col gap-3 max-w-3xl">
      <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
        <header class="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-line-2 bg-surface-2">
          <h2 class="font-jakarta font-bold text-[15px] tracking-tight text-accent">{tl('Thesis Watcher')}</h2>
          <StatusPill size="sm" tone={health.state === 'GOOD' ? 'clear' : 'fired'}>{tl(health.state)}</StatusPill>
          <span class="ml-auto"><FreshChip fresh={fresh} /></span>
        </header>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2">
          <AccountStat label={thesisTerm('FIRED')} value={String(health.fired)}
            cls={health.fired ? 'text-down' : 'text-muted'} />
          <AccountStat label={thesisTerm('NO DATA')} value={String(health.noData)}
            cls={health.noData ? 'text-accent' : 'text-muted'} />
          <AccountStat label={thesisTerm('AWAITING REVIEW')} value={String(health.awaiting)} cls="text-ink-2" />
          <AccountStat label={thesisTerm('CLEAR')} value={String(health.clear)}
            cls={health.clear ? 'text-up' : 'text-muted'} />
        </div>
      </section>

      {groups.map((group) => (
        <section key={group.severity} class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="flex items-center gap-2 px-3 py-1.5 border-b border-line-2 bg-surface-2">
            <h3 class="font-jakarta font-bold text-[11px] tracking-wider text-accent uppercase">
              {thesisTerm(group.severity)}
            </h3>
            <span class="font-mono text-[9px] text-muted">{group.rows.length}</span>
            {group.fired > 0 && <StatusPill tone="fired">{group.fired} {thesisTerm('FIRED')}</StatusPill>}
          </header>
          {group.rows.map((breaker) => (
            <BreakerRow key={breaker.id} breaker={breaker}
              open={openKey === breaker.id}
              onToggle={() => setOpenKey(openKey === breaker.id ? '' : breaker.id)}
              canWrite={canWrite} onWrote={reload} onUnsupported={() => setCanWrite(false)} />
          ))}
        </section>
      ))}

      {queue.length > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="flex items-center gap-2 px-3 py-1.5 border-b border-line-2 bg-surface-2">
            <h3 class="font-jakarta font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Sweep candidates')}</h3>
            <span class="font-mono text-[9px] text-muted">{queue.length}</span>
          </header>
          {queue.map((candidate) => (
            <CandidateRow key={candidate.key} candidate={candidate} canWrite={canWrite}
              onSettled={(key, action) => setSettled((prev) => ({ ...prev, [key]: action }))}
              onUnsupported={() => setCanWrite(false)} />
          ))}
        </section>
      )}

      {cats.length > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
            <h3 class="font-jakarta font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Upcoming catalysts')}</h3>
          </header>
          {cats.map((cat, i) => (
            <div key={`${cat.date}-${i}`} class="flex items-baseline gap-2 border-t border-line/50 first:border-0 px-3 py-1">
              <span class="font-mono text-[11px] text-ink">{cat.date}</span>
              {cat.symbol && <span class="font-mono text-[10px] text-accent">{cat.symbol}</span>}
              <span class="font-anth text-[12px] text-ink-2 truncate">{cat.label}</span>
              {cat.breaker_id && byId.has(cat.breaker_id) && (
                <button type="button" onClick={() => setOpenKey(cat.breaker_id)}
                  class="font-mono text-[9px] uppercase tracking-wider text-muted hover:text-accent shrink-0"
                  title={byId.get(cat.breaker_id).description || cat.breaker_id}>{cat.breaker_id}</button>
              )}
              <span class={`ml-auto shrink-0 font-mono text-[10px] ${cat.days <= 7 ? 'text-accent' : 'text-muted'}`}>
                {cat.days === 0 ? tl('today') : `${cat.days}${tl('d')}`}
              </span>
            </div>
          ))}
        </section>
      )}

      {ledger.length > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="flex items-baseline gap-2 px-3 py-1.5 border-b border-line-2 bg-surface-2">
            <h3 class="font-jakarta font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Rotation estimate')}</h3>
            <span class="font-mono text-[17px] font-semibold text-ink">{ledger[0].estimate}</span>
            <span class="ml-auto font-mono text-[9px] text-muted">{ledger.length} {tl('revisions')}</span>
          </header>
          {ledger[0].note && (
            <div class="px-3 py-1.5 font-anth text-[12px] text-ink-2 leading-snug border-b border-line/50">{ledger[0].note}</div>
          )}
          {ledger.slice(1).map((row, i) => (
            <div key={i} class="flex items-baseline gap-2 border-t border-line/50 first:border-0 px-3 py-1">
              <span class="font-mono text-[11px] text-ink-2">{row.estimate}</span>
              <span class="font-anth text-[11.5px] text-muted truncate">{row.note}</span>
              <span class="ml-auto shrink-0 font-mono text-[9px] text-muted">{stamp(row.ms)}</span>
            </div>
          ))}
        </section>
      )}

      <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
        <header class="flex items-center gap-2 px-3 py-1.5 border-b border-line-2 bg-surface-2">
          <h2 class="font-jakarta font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Thesis signals')}</h2>
          <span class="ml-auto font-mono text-[9px] text-muted">{signals.length}</span>
        </header>
        {signals.length ? signals.map((signal) => (
          <div key={signal.id} class="border-t border-line/50 px-3 py-1.5 first:border-0">
            <div class="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-muted">
              <span class={`rounded px-1 font-bold ${signal.meta?.thesis >= 3 ? 'bg-down text-black' : 'bg-accent text-black'}`}>T{signal.meta?.thesis}</span>
              <span>{signal.source || 'wire'}</span>
              <span>{signal.type?.replaceAll('_', ' ')}</span>
            </div>
            {signal.url ? <a href={signal.url} target="_blank" rel="noopener" class="block pt-0.5 font-jakarta text-[12px] leading-snug text-ink-2 hover:text-accent">{signal.headline}</a>
              : <div class="pt-0.5 font-jakarta text-[12px] leading-snug text-ink-2">{signal.headline}</div>}
          </div>
        )) : <div class="px-3 py-2 font-jakarta text-[11px] text-muted">{tl('No thesis-tagged wire signals in this window.')}</div>}
      </section>

      <AiReport
        label="AI thesis read"
        filename="research-briefing.md"
        hint={tl('grounded in supplied conditions and market evidence')}
        buildPrompt={async () => ({
          system: 'You are an evidence-first investment research assistant. Distinguish reported facts from inference and stay within the supplied record.',
          prompt: thesisAnalysisPrompt(breakers, signals),
        })}
        archive={{ kind: 'briefing', title: 'Research Briefing' }}
      />
    </div>
  )
}

function TimeTravel({ priceMap, accountId }) {
  const [date, setDate] = useState('')
  const [rows, setRows] = useState(null)
  const [snapInfo, setSnapInfo] = useState(null)
  const csv = loadFillsCsv() || demoFillsCsv()
  const run = async (e) => {
    e.preventDefault()
    if (!date) return
    setRows('loading')
    setSnapInfo(null)
    // the real thing first: fragwire's booklog holds actual broker snapshots
    // (positions + marks as they were), so a covered date replays the true
    // book instead of a fills-CSV reconstruction
    if (wireBase() && accountId && accountId !== BOTH_ACCOUNTS) {
      try {
        const resp = await fetch(
          `${wireBase()}/api/portfolio/snapshot?account=${encodeURIComponent(accountId)}&date=${date}`,
          { signal: AbortSignal.timeout(10_000) })
        if (resp.ok) {
          const out = await resp.json()
          if (out.ok && out.positions?.length) {
            setSnapInfo({ date: out.date, nlv: out.nlv })
            setRows(out.positions.map((p) => ({
              sym: p.symbol, qty: p.shares, avg: p.avg_cost ?? 0,
              then: p.market_price ?? null,
              // a CAD CDR marked against the US listing's USD quote prints
              // +2500% garbage — cross-currency rows show "—" honestly
              now: (p.currency || 'USD') === 'USD'
                ? priceMap[p.symbol]?.price ?? null : null,
            })))
            return
          }
        }
      } catch { /* store not there yet — fills replay below */ }
    }
    const fills = parseFillsCsv(csv).filter((f) => f.date <= date)
    const bySym = new Map()
    for (const f of fills) {
      const cur = bySym.get(f.symbol) || { qty: 0, cost: 0 }
      if (f.side === 'BUY') { cur.qty += f.qty; cur.cost += f.qty * f.price }
      else {
        const avg = cur.qty > 0 ? cur.cost / cur.qty : 0
        cur.qty -= f.qty; cur.cost -= f.qty * avg
      }
      bySym.set(f.symbol, cur)
    }
    const open = [...bySym.entries()].filter(([, v]) => v.qty > 0.0001)
    const out = await Promise.all(open.map(async ([sym, v]) => {
      let then = null
      try {
        const h = await fetchHistory(sym, '5Y')
        const target = new Date(date).getTime() / 1000
        const bar = (h?.bars || []).reduce((best, b2) =>
          (Math.abs(b2.time - target) < Math.abs((best?.time ?? Infinity) - target) ? b2 : best), null)
        then = bar?.close ?? null
      } catch { /* symbol gone */ }
      const now = priceMap[sym]?.price ?? null
      return { sym, qty: v.qty, avg: v.qty ? v.cost / v.qty : 0, then, now }
    }))
    setRows(out)
  }
  return (
    <div class="flex flex-col gap-2 max-w-3xl">
      <form onSubmit={run} class="flex items-center gap-2 font-mono text-[11.5px]">
        <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)}
          class="bg-surface-2 border border-line rounded-lg px-2 py-1 text-ink outline-none focus:border-accent" />
        <button class="border border-accent text-accent bg-accent-soft rounded-lg px-3 py-1 font-semibold hover:bg-accent hover:text-black">
          replay the book
        </button>
        <span class="text-[10px] text-muted">{tt('portfolio.time_note')}</span>
      </form>
      {rows === 'loading' && <Loading label={tt('portfolio.pricing_past')} minH={120} />}
      {snapInfo && (
        <div class="font-mono text-[10px] px-1 text-accent">
          ● {tl('broker snapshot')} {snapInfo.date}
          {snapInfo.nlv != null && <span class="text-muted"> · NLV {money(snapInfo.nlv)}</span>}
        </div>
      )}
      {Array.isArray(rows) && (rows.length ? (
        <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto">
          <table class="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
                <th class="px-3 py-1.5 text-left">{tl('Sym')}</th>
                <th class="px-2 py-1.5 text-right">{tl('Qty')}</th>
                <th class="px-2 py-1.5 text-right">{tl('Avg cost')}</th>
                <th class="px-2 py-1.5 text-right">px {date}</th>
                <th class="px-2 py-1.5 text-right">{tl('Value then')}</th>
                <th class="px-2 py-1.5 text-right">{tl('Price now')}</th>
                <th class="px-3 py-1.5 text-right">{tl('Since then')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const chg = r.then && r.now ? ((r.now / r.then) - 1) * 100 : null
                return (
                  <tr key={r.sym} class="border-t border-line">
                    <td class="px-3 py-[3px] font-[650] font-tick text-ink"><SymLink sym={r.sym} /></td>
                    <td class="px-2 py-[3px] text-right text-ink-2">{Math.round(r.qty)}</td>
                    <td class="px-2 py-[3px] text-right text-muted">{r.avg.toFixed(2)}</td>
                    <td class="px-2 py-[3px] text-right text-ink-2">{r.then != null ? r.then.toFixed(2) : '—'}</td>
                    <td class="px-2 py-[3px] text-right text-ink font-semibold">{r.then != null ? money(r.then * r.qty) : '—'}</td>
                    <td class="px-2 py-[3px] text-right text-ink-2">{r.now != null ? r.now.toFixed(2) : '—'}</td>
                    <td class={`px-3 py-[3px] text-right font-semibold ${chg == null ? 'text-muted' : chg >= 0 ? 'text-up' : 'text-down'}`}>
                      {chg == null ? '—' : fmtPct(chg)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ) : <div class="font-mono text-[11px] text-muted px-1">{tt('portfolio.no_historical_positions')}</div>)}
    </div>
  )
}

function useLiveBook(account) {
  // tailnet: fragwire fronts ibkr-mcp — the real book replaces the demo
  const [book, setBook] = useState(null)
  useEffect(() => {
    const base = wireServiceUrl()
    if (!base) return
    if (!account) return
    setBook(null)
    let dead = false
    const pull = () => {
      const url = new URL(`${base.replace(/\/$/, '')}/api/portfolio`)
      const params = url.searchParams
      if (account) params.set('account', account)
      return fetch(url,
        { signal: AbortSignal.timeout(10_000) })
      .then((r) => r.json())
      .then((out) => {
        if (!dead && out.ok && out.positions?.length) {
          setBook({
            positions: out.positions.map((x) => ({
              symbol: x.symbol,
              shares: x.shares,
              avgCost: x.avg_cost,
              // IBKR's own marks ride along — a CAD CDR priced off the US
              // listing's USD quote produced garbage cost basis (Jeff
              // 2026-08-05); the broker already knows the truth.
              livePrice: x.market_price ?? null,
              liveValue: x.market_value ?? null,
              // account-base-currency value — the ONLY thing safe to sum:
              // raw CAD legs inflated gross and understated Dan's leverage
              // (1.73x shown vs 2.22x true, Jeff 2026-08-06)
              liveBase: x.market_value_base ?? null,
              liveUnreal: x.unrealized_pnl ?? null,
              currency: x.currency || 'USD',
              account: x.account || out.account || '',
              accountLabel: x.account_label || out.account_label || '',
            })),
            margin: out.margin || null,
            account: out.account || '',
            accountLabel: out.account_label || '',
          })
        } else if (!dead) {
          setBook((cur) => cur || false)   // false = wire up, ibkr not answering
        }
      })
      .catch(() => { if (!dead) setBook((cur) => cur || false) })
    }
    pull()
    const t = setInterval(pull, 60_000)
    return () => { dead = true; clearInterval(t) }
  }, [account])
  return book
}

function usePortfolioAccounts() {
  const [accounts, setAccounts] = useState(null)
  useEffect(() => {
    const base = wireServiceUrl()
    if (!base) return
    fetch(`${base.replace(/\/$/, '')}/api/portfolio/accounts`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => r.json())
      .then((out) => out.ok && setAccounts(out.accounts || []))
      .catch(() => setAccounts([]))
  }, [])
  return accounts
}

function AccountSwitcher({ accounts, account, onChange }) {
  if (!accounts || accounts.length < 2) return null
  const items = [accounts[0], { id: BOTH_ACCOUNTS, label: tl('Both') }, ...accounts.slice(1)]
  const index = Math.max(0, items.findIndex((item) => item.id === account))
  return (
    <div class="relative grid rounded-lg border border-line bg-surface-1 p-0.5 overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(3.5rem, 1fr))` }}
      role="group" aria-label={tt('portfolio.account_switcher')}>
      <span class="portfolio-account-slider absolute inset-y-0.5 left-0.5 rounded-md bg-surface-3 border border-line-2 transition-transform duration-300 ease-out"
        style={{ width: `calc((100% - 4px) / ${items.length})`, transform: `translateX(${index * 100}%)` }} />
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)}
          class={`relative z-10 px-3 py-1 font-anth text-[10.5px] font-semibold whitespace-nowrap ${item.id === account ? 'text-ink' : 'text-muted hover:text-ink'}`}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

function PortfolioHeader({ accounts, account, onChange, book, wired }) {
  const live = !!book
  // the account ID + broker, not a nickname + margin readout (Jeff 2026-08-10)
  const label = book?.account || book?.accountLabel || (account === BOTH_ACCOUNTS ? tl('Both') : '')
  const family = IS_FAMILY_BUILD
  const detail = family ? tl('My Portfolios')
    : live ? `${label} · ${tl('Interactive Brokers')}`
    : book === false ? tt('portfolio.link_down')
      : wired ? tt('portfolio.connecting') : tt('demo.banner')
  return (
    <header class="flex flex-wrap items-center gap-3 mx-1 mb-2 py-1">
      <div class="flex min-w-0 items-center gap-2.5 mr-auto">
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-2 bg-surface-2 text-accent" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 15.5h14M4.5 12l3-3 2.5 2 5-6.5M5 15.5V13m5 2.5V12m5 3.5V8" /></svg>
        </span>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="font-anth text-[13px] font-bold tracking-wide text-ink">{tl('Portfolio')}</h1>
            {live && <span class="h-1.5 w-1.5 rounded-full bg-up" title={tt('portfolio.live')} />}
          </div>
          <div class="truncate font-anth text-[9.5px] text-muted">{detail}</div>
        </div>
      </div>
      {!family && <AccountSwitcher accounts={accounts} account={account} onChange={onChange} />}
    </header>
  )
}

export function Portfolio({ route }) {
  const accounts = usePortfolioAccounts()
  const [account, setAccount] = useState(() => localStorage.getItem('portfolio_account_v1') || '')
  useEffect(() => {
    if (accounts?.length && account !== BOTH_ACCOUNTS && !accounts.some((a) => a.id === account)) {
      // no stored pick yet: 蛋宝 reads this app in Chinese, so zh boots on
      // her account (the second gateway); an explicit choice always wins
      const fallback = (getLocale() === 'zh' && accounts.length > 1)
        ? accounts[accounts.length - 1].id : accounts[0].id
      setAccount(fallback)
      localStorage.setItem('portfolio_account_v1', fallback)
    }
  }, [accounts, account])
  const onAccountChange = (next) => {
    setAccount(next)
    localStorage.setItem('portfolio_account_v1', next)
  }
  const book = useLiveBook(account)
  // a configured wire NEVER falls back to synthetic numbers — the demo book
  // only exists for the keyless public build (Jeff 2026-08-05)
  const wired = !!wireServiceUrl()
  const positions = book?.positions || (wired ? [] : DEMO_POSITIONS)
  const symbols = positions.map((p) => p.symbol)
  const live = useQuotes(symbols)
  const priceMap = {}
  for (const s of symbols) {
    const q = live[s]?.quote
    if (q) priceMap[s] = q
  }
  // the demo book is a placeholder: once the user has built portfolios of
  // their own, the portfolio landing shows THOSE (Jeff 2026-08-20) — an
  // explicit #/portfolio/positions still reaches the synthetic book, and a
  // wired build still lands on the real broker book
  const [hasMine, setHasMine] = useState(() => loadPortfolios().length > 0)
  useEffect(() => onPortfoliosChange((items) => setHasMine(items.length > 0)), [])
  // the family build has no broker surface at all — every route lands on
  // the hand-built books
  const family = IS_FAMILY_BUILD
  const view = family ? 'mine' : route.sub || (!wired && hasMine ? 'mine' : 'positions')

  const View = {
    positions: Positions,
    mine: MyPortfolios,
    account: Account,
    sizing: Sizing,
    carry: Carry,
    cockpit: Cockpit,
    whatif: WhatIf,
    trades: Trades,
    timetravel: TimeTravel,
    thesis: Thesis,
    timeline: Timeline,
    backtest: Backtest,
  }[view] || Positions

  if (wired && !book && view !== 'mine') {
    return (
      <div class="flex-1 p-3 min-w-0">
        <PortfolioHeader accounts={accounts} account={account} onChange={onAccountChange} book={book} wired />
      </div>
    )
  }

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <PortfolioHeader accounts={accounts} account={account} onChange={onAccountChange} book={book} wired={wired} />
      <View priceMap={priceMap} positions={positions} margin={book?.margin || null}
        account={book?.accountLabel || book?.account} accountId={account} />
    </div>
  )
}
