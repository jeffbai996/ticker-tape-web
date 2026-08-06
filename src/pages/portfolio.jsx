import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createChart, AreaSeries } from 'lightweight-charts'
import { boundedTimeScale } from '../lib/chartview.js'
import { useQuotes } from '../hooks.js'
import {
  DEMO_POSITIONS, DEMO_CASH, DEMO_BETAS, DEMO_ACCOUNT_ID, DEMO_MARGIN_RATE,
  positionRows, accountSummary, sizeForWeight, carryAt, stressGrid, nlvWalk,
} from '../lib/demo.js'
import { fmtPrice, fmtPct, fmtChange, fmtRatio } from '../lib/format.js'
import { getLocale, tl, t as tt } from '../lib/i18n.js'
import { FlashPrice } from '../components/Fig.jsx'
import {
  parseFillsCsv, assembleBacktest, convertFills, convertBars, needsFx, symbolCurrency,
} from '../lib/backtest.js'
import { demoFillsCsv, loadFillsCsv, saveFillsCsv, closesByDateFromChart } from '../lib/backtestData.js'
import { proxyBase } from '../lib/feed.js'
import { wireUrl } from '../lib/wire.js'
import { MdLite } from '../components/AiReport.jsx'
import { fetchHistory } from '../lib/history.js'
import { createPCache } from '../lib/pcache.js'

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
    <span class={cls}>{' '}({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)</span>
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
                <span class={cushion < 8 ? 'text-down' : 'text-up'}>{tl('Cushion')} {cushion?.toFixed(1)}%</span>
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

function BookPulse({ rows }) {
  const priced = rows.filter((row) => row.dayPnl != null)
  const ranked = [...priced].sort((a, b) => b.dayPnl - a.dayPnl)
  const contributor = ranked.find((row) => row.dayPnl >= 0)
  const detractor = [...ranked].reverse().find((row) => row.dayPnl < 0)
  const adv = priced.filter((row) => row.dayPnl >= 0).length
  const biggest = [...rows].filter((row) => row.weight != null).sort((a, b) => b.weight - a.weight)[0]
  const line = (label, row, cls) => (
    <div class="flex items-baseline gap-2 px-2.5 py-[2px] font-mono text-[10.5px]">
      <span class="text-muted">{label}</span>
      <span class="ml-auto text-ink-2">{row?.symbol || '—'}</span>
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
        <div class="flex justify-between px-2.5 py-[2px] font-mono text-[10.5px]"><span class="text-muted">{tl('Largest line')}</span><span class="text-ink-2">{biggest ? `${biggest.symbol} ${biggest.weight.toFixed(1)}%` : '—'}</span></div>
      </div>
    </section>
  )
}

function Positions({ priceMap, positions, margin, accountId }) {
  const rows = positionRows(positions, priceMap)
  const fallback = accountSummary(positions, priceMap)
  const combined = accountId === BOTH_ACCOUNTS
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
              {combined && <td class="px-2 py-[3px] font-anth text-[10px] text-muted">{r.accountLabel || r.account_label || '—'}</td>}
              <td class="px-2 py-[3px] text-right text-muted text-[10.5px]">{r.shares}</td>
              <td class="px-2 py-[3px] text-right text-muted text-[10.5px]">{fmtPrice(r.avgCost)}</td>
              <td class="px-2 py-[3px] text-right text-ink-2 font-medium"><FlashPrice price={r.price} fmt={fmtPrice} /></td>
              <td class="px-2 py-[3px] text-right text-ink font-semibold text-[12px]">{money(r.mktValue)}</td>
              <td class="px-2 py-[3px] text-right text-ink-2 font-medium">{r.weight != null ? `${r.weight.toFixed(1)}%` : '—'}</td>
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
              <span class="w-12 font-[650] font-tick text-ink">{sym}</span>
              <div class="flex-1 h-3 relative">
                <div class="absolute inset-y-0 left-0 rounded-sm bg-accent/30"
                  style={{ width: `${(w / maxW) * 100}%` }} />
              </div>
              <span class="w-11 text-right text-ink-2">{w.toFixed(1)}%</span>
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
              <span class={`font-semibold ${margin.cushion_pct < 8 ? 'text-down' : 'text-up'}`}>{margin.cushion_pct.toFixed(2)}%</span></div>}
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
        <AccountStat label={tl('Cushion')} value={(margin?.cushion_pct ?? s.cushionPct) != null ? `${(margin?.cushion_pct ?? s.cushionPct).toFixed(1)}%` : '—'}
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

function Timeline({ priceMap, positions }) {
  const el = useRef(null)
  const s = accountSummary(positions, priceMap)

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
      timeScale: boundedTimeScale(false),
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

const wireBase = () => (wireUrl() ? wireUrl().replace(/\/$/, '') : '')

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
  if (state.status === 'loading') return <div class="px-1 py-2 font-mono text-[11px] text-muted animate-pulse">{tt('portfolio.gateway_loading')}</div>
  if (state.status === 'err') return <div class="px-1 py-2 font-mono text-[11px] text-down">{state.md}</div>
  if (!state.md.trim()) return <div class="px-1 py-2 font-mono text-[11px] text-muted">{empty || tt('portfolio.gateway_empty')}</div>
  return (
    <section class="bg-surface-1 border border-line rounded-xl px-3 py-2 font-anth text-[12.5px] leading-relaxed text-ink-2 max-w-3xl overflow-x-auto">
      <MdLite text={state.md} />
    </section>
  )
}

function WhatIf({ accountId }) {
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
  return (
    <div class="flex flex-col gap-2 max-w-3xl">
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
        <button class="border border-accent text-accent bg-accent-soft rounded-lg px-3 py-1 font-semibold hover:bg-accent hover:text-black">
          run what-if
        </button>
        <span class="text-[10px] text-muted">{tt('portfolio.margin_preview')}</span>
      </form>
      {url && <IbkrMd url={url} />}
    </div>
  )
}

function Trades({ accountId }) {
  const [view, setView] = useState('fills')
  if (!wireBase()) return <NeedsWire />
  if (accountId === BOTH_ACCOUNTS) return <div class="px-1 font-anth text-[11.5px] text-muted">{tt('portfolio.pick_one_account')}</div>
  return (
    <div class="flex flex-col gap-2 max-w-3xl">
      <div class="flex gap-1 font-mono text-[11px]">
        {['fills', 'orders'].map((v) => (
          <button key={v} onClick={() => setView(v)}
            class={`border rounded-md px-2.5 py-0.5 font-semibold ${view === v
              ? 'bg-accent border-accent text-black' : 'border-line text-ink-2 hover:text-ink'}`}>{v}</button>
        ))}
      </div>
      <IbkrMd url={`${wireBase()}/api/ibkr/trades?view=${view}&account=${encodeURIComponent(accountId || '')}`} empty="no executions this session" />
    </div>
  )
}

function Thesis() {
  const [snap, setSnap] = useState(null)
  useEffect(() => {
    if (!wireBase()) return
    fetch(`${wireBase()}/api/breakers`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => r.json()).then(setSnap).catch(() => setSnap({ ok: false }))
  }, [])
  if (!wireBase()) return <NeedsWire />
  if (!snap) return <div class="px-1 py-2 font-mono text-[11px] text-muted animate-pulse">{tt('portfolio.watcher_loading')}</div>
  if (!snap.available) return <div class="px-1 py-2 font-mono text-[11px] text-muted">{tt('portfolio.watcher_unavailable')}</div>
  const VERD = {
    FIRED: 'bg-down text-black', AWAITING: 'bg-accent text-black',
    CLEAR: 'bg-up/20 text-up', NO_DATA: 'bg-surface-3 text-muted',
  }
  return (
    <div class="flex flex-col gap-2 max-w-3xl">
      <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
        <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Thesis breakers')}</h2>
        </header>
        {snap.breakers.map((b) => (
          <div key={b.id} class="border-t border-line/50 px-3 py-1.5 first:border-0">
            <div class="flex items-baseline gap-2 font-mono text-[11px]">
              <span class={`px-1.5 rounded text-[9px] font-bold ${VERD[b.verdict] || VERD.NO_DATA}`}>{b.verdict.replace('_', ' ')}</span>
              <span class="text-ink-2 text-[10px] uppercase tracking-wider">{b.category}</span>
              <span class="text-muted text-[10px]">{b.severity}</span>
              {b.updated_at && <span class="ml-auto text-muted text-[9.5px]">{new Date(b.updated_at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
            </div>
            <div class="font-anth text-[12px] text-ink-2 leading-snug pt-0.5">{b.description}</div>
            {b.reason && <div class="font-mono text-[10.5px] text-muted pt-0.5">{b.reason}</div>}
          </div>
        ))}
      </section>
      {snap.candidates?.length > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
            <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('New candidates')}</h2>
          </header>
          {snap.candidates.map((c, i) => (
            <div key={i} class="border-t border-line/50 px-3 py-1 first:border-0 font-anth text-[12px] text-ink-2">
              {c.url ? <a href={c.url} target="_blank" rel="noopener" class="hover:text-accent">{c.summary}</a> : c.summary}
            </div>
          ))}
        </section>
      )}
      {snap.rotation?.length > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl px-3 py-1.5 font-mono text-[11px]">
          <span class="text-muted uppercase text-[9px] tracking-wider">{tl('Rotation estimate')}</span>{' '}
          <span class="text-ink font-semibold">{snap.rotation[0].estimate}</span>
          {snap.rotation[0].note && <span class="text-muted"> — {snap.rotation[0].note}</span>}
        </section>
      )}
    </div>
  )
}

function TimeTravel({ priceMap }) {
  const [date, setDate] = useState('')
  const [rows, setRows] = useState(null)
  const csv = loadFillsCsv() || demoFillsCsv()
  const run = async (e) => {
    e.preventDefault()
    if (!date) return
    setRows('loading')
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
      {rows === 'loading' && <div class="font-mono text-[11px] text-muted animate-pulse px-1">{tt('portfolio.pricing_past')}</div>}
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
                    <td class="px-3 py-[3px] font-[650] font-tick text-ink">{r.sym}</td>
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
    const base = wireUrl()
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
    const base = wireUrl()
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
  const label = book?.accountLabel || book?.account || (account === BOTH_ACCOUNTS ? tl('Both') : '')
  const detail = live
    ? `${label} · ${tt('portfolio.live_book')}${book.margin?.cushion_pct != null ? ` · ${tl('Cushion')} ${book.margin.cushion_pct.toFixed(1)}%` : ''}`
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
      <AccountSwitcher accounts={accounts} account={account} onChange={onChange} />
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
  const wired = !!wireUrl()
  const positions = book?.positions || (wired ? [] : DEMO_POSITIONS)
  const symbols = positions.map((p) => p.symbol)
  const live = useQuotes(symbols)
  const priceMap = {}
  for (const s of symbols) {
    const q = live[s]?.quote
    if (q) priceMap[s] = q
  }
  const view = route.sub || 'positions'

  const View = {
    positions: Positions,
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

  if (wired && !book) {
    return (
      <div class="flex-1 p-3 min-w-0">
        <PortfolioHeader accounts={accounts} account={account} onChange={onAccountChange} book={null} wired />
        <div class="mx-1 mb-2 px-3 py-2 bg-surface-1 border border-line rounded-lg font-mono text-[11px] text-muted">
          {book === false ? tt('portfolio.link_down') : tt('portfolio.connecting')}
        </div>
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
