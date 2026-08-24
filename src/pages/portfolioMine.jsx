/** "My Portfolios" — Koyfin-style hand-built books (Jeff 2026-08-20).
 *
 *  Any number of portfolios, each with a display currency fixed at creation;
 *  holdings across USD/CAD/HKD/CNY markets valued live, converted through
 *  live FX pairs. Everything the user types lives in localStorage only —
 *  the site is static and nothing entered here leaves the browser.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useQuotes } from '../hooks.js'
import { SymbolSuggest } from '../components/SymbolSuggest.jsx'
import { sizeForWeight } from '../lib/demo.js'
import { breadth, capitalMix, cashSplit, concentration, dayContribution, sortRows, unrealizedStats, venueGroups, venueSplit, venueSubtotal, sectorSplit } from '../lib/bookStats.js'
import { BOOK_CARDS, hiddenCards, onCardsChange, resetCards, toggleCard } from '../lib/bookCards.js'
import { BUCKETS } from '../lib/symbols.js'
import { FlashPrice } from '../components/Fig.jsx'
import { fmtPrice, fmtPct, fmtPctPlain } from '../lib/format.js'
import { tl, getLocale } from '../lib/i18n.js'
import { loadZhTable, onZhTable, zhName } from '../lib/zhNames.js'
import { fetchCnIndustry, isCnListing } from '../lib/cnData.js'
import { daysUntil } from '../lib/markets.js'
import { setHeaderActions } from '../lib/headerSlot.js'
import { venueFlag } from '../lib/venueFlag.js'
import { VENUE_LABEL, fxDayPct, fxImpact, limitFlag, marketSession, venueDayBreakdown } from '../lib/cnMarkets.js'
import { fetchSymbolEventsCached } from '../lib/cnEvents.js'
import { BookNews } from './portfolioNews.jsx'
import { BookPerformance } from './portfolioPerformance.jsx'
import { BookTrades } from './portfolioTrades.jsx'
import { CashActivity } from './portfolioCash.jsx'
import { BookEvents } from './portfolioEvents.jsx'
import { PORTFOLIO_CCYS, cashAccountName, convertCcy, fmtCcy, fmtCcyZh, fxSymbolsFor, holdingCurrency, ratesFromQuotes } from '../lib/fx.js'
import { MAX_MY_HOLDINGS, createPortfolio, deletePortfolio, loadPortfolios, loadTrash, onPortfoliosChange, purgeTrash, restoreFromTrash, removeCash, removeHolding, renamePortfolio, setCash, setHolding, setPortfolioCcy, portfolioValues, recordSnapshot, previousSnapshot } from '../lib/myPortfolios.js'

const pnlCls = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')
// Account totals read in full digits in any locale — 富途/同花顺 print
// 54,128,742 for an account, and keep 万/亿 for market-wide figures. Only
// the glance cards (movers, contribution, cash split) use 万/亿, where nobody
// needs the cents (Jeff 2026-08-22, correcting an earlier over-application).
const money = (v, ccy) => fmtCcy(v, ccy)
const glance = (v, ccy) => (getLocale() === 'zh' ? fmtCcyZh(v, ccy) : fmtCcy(v, ccy))
const signed = (v, ccy) => (v == null ? '—' : `${v >= 0 ? '+' : '-'}${money(Math.abs(v), ccy)}`)
const signedGlance = (v, ccy) => (v == null ? '—' : `${v >= 0 ? '+' : '-'}${glance(Math.abs(v), ccy)}`)

// The provider names everything in English; a zh reader gets the Chinese
// name where the table knows it, the English one where it doesn't.
function holdingName(symbol, quotes) {
  return (getLocale() === 'zh' && zhName(symbol)) || quotes[symbol]?.name || ''
}

/** zh locale: pull the name chunk and re-render once it lands. */
function useZhNames() {
  const [, tick] = useState(0)
  useEffect(() => {
    if (getLocale() !== 'zh') return undefined
    loadZhTable()
    return onZhTable(() => tick((t) => t + 1))
  }, [])
}

function CcySelect({ value, onChange, id, options = PORTFOLIO_CCYS }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.currentTarget.value)}
      class="h-7 rounded-md border border-line-2 bg-surface-2 px-2 font-anth text-[11px] text-ink outline-none focus:border-accent/60">
      {options.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  )
}

function NewPortfolioForm({ onDone }) {
  const [name, setName] = useState('')
  const [ccy, setCcy] = useState('USD')
  const submit = (e) => {
    e.preventDefault()
    const p = createPortfolio(name, ccy)
    if (p) { setName(''); onDone(p.id) }
  }
  return (
    <form onSubmit={submit} class="flex flex-wrap items-center gap-2">
      <input value={name} onInput={(e) => setName(e.currentTarget.value)}
        placeholder={tl('Portfolio name')} aria-label={tl('Portfolio name')} data-1p-ignore data-lpignore="true"
        class="w-40 rounded border border-line-2 bg-surface-2 px-2 py-1 font-anth text-[11px] text-ink placeholder:text-muted outline-none focus:border-accent/60" />
      <label class="flex items-center gap-1.5 font-anth text-[10px] text-muted">
        {tl('Display currency')}
        <CcySelect value={ccy} onChange={setCcy} />
      </label>
      <button type="submit" disabled={!name.trim()}
        class="rounded border border-accent/40 bg-accent/10 px-2.5 py-1 font-anth text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-40">
        {tl('Create')}
      </button>
    </form>
  )
}

/** Only a listing the data provider confirms may enter a book (Jeff
 *  2026-08-21). A broker board code — "02628" — is not a symbol on any venue,
 *  and a book full of them prices nothing and files itself as USD, which is
 *  exactly how this page got a Hong Kong portfolio valued in dollars. So the
 *  Add button stays shut until the typed text IS a listing: picked from the
 *  dropdown, or typed in full and matched against the provider's own hits.
 *  Currency then follows the listing and is never an input. */
function AddHoldingForm({ portfolio }) {
  const [sym, setSym] = useState('')
  const [picked, setPicked] = useState(null)     // {symbol, name} from the dropdown
  const [shares, setShares] = useState('')
  const [cost, setCost] = useState('')
  const sharesRef = useRef(null)
  const full = portfolio.holdings.length >= MAX_MY_HOLDINGS
  const typed = sym.trim().toUpperCase()
  const confirmed = picked && String(picked.symbol).toUpperCase() === typed ? picked : null
  const submit = (e) => {
    e.preventDefault()
    if (!confirmed) return
    const ok = setHolding(portfolio.id, confirmed.symbol, Number(shares),
      cost === '' ? undefined : Number(cost))
    if (ok) { setSym(''); setPicked(null); setShares(''); setCost('') }
  }
  const onPick = (h) => {
    setSym(h.symbol)
    setPicked(h)
    sharesRef.current?.focus()
  }
  const onHits = (hits) => {
    const exact = hits.find((h) => String(h.symbol).toUpperCase() === typed)
    if (exact) setPicked(exact)
  }
  const box = 'rounded border border-line-2 bg-surface-2 px-2 py-1.5 font-mono text-[10.5px] text-ink placeholder:text-[10px] placeholder:text-muted outline-none focus:border-accent/60'
  return (
    <form onSubmit={submit}>
      <div class="flex flex-wrap items-center gap-2">
        <SymbolSuggest value={sym} placeholder={tl('Symbol or company')}
          ariaLabel={tl('Symbol or company')}
          onInput={(e) => { setSym(e.currentTarget.value); setPicked(null) }}
          onPick={onPick} onHits={onHits} dropUp={false} inputClass={`${box} w-40 uppercase`} />
        <input ref={sharesRef} value={shares} onInput={(e) => setShares(e.currentTarget.value)}
          placeholder={tl('Shares')} aria-label={tl('Shares')} inputMode="decimal" data-1p-ignore data-lpignore="true"
          class={`${box} w-24`} />
        <input value={cost} onInput={(e) => setCost(e.currentTarget.value)}
          placeholder={tl('Avg cost (opt.)')} aria-label={tl('Avg cost (opt.)')}
          inputMode="decimal" data-1p-ignore data-lpignore="true" class={`${box} w-32`} />
        <button type="submit" disabled={full || !confirmed || !(Number(shares) > 0)}
          class="rounded border border-accent/40 bg-accent/10 px-3 py-1.5 font-anth text-[12px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-40">
          {tl('Add')}
        </button>
        {full && <span class="font-anth text-[10px] text-muted">{tl('List is full')}</span>}
      </div>
      {confirmed && (
        <div class="mt-1 font-anth text-[10px] text-muted">
          {confirmed.symbol} · {(getLocale() === 'zh' && zhName(confirmed.symbol)) || confirmed.name}
          {confirmed.exch && <span class="text-[9px] uppercase tracking-wider"> · {confirmed.exch}</span>}
        </div>
      )}
      {typed && !confirmed && (
        <div class="mt-1.5 font-anth text-[9.5px] text-accent">
          {tl('Pick the listing from the list — a plain board code like 02628 is not a symbol anywhere.')}
        </div>
      )}
    </form>
  )
}

/** Removing a row takes two taps (Jeff 2026-08-21). The first arms the
 *  button and says so; the second removes. It disarms on blur, and on its own
 *  after a few seconds, so an armed × can never sit waiting for a stray click.
 *  The button keeps its width in both states or the whole column reflows
 *  under the pointer. */
function ConfirmRemove({ label, onConfirm }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const t = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button type="button"
      title={armed ? tl('Tap again to remove') : tl('Remove')}
      aria-label={`${armed ? tl('Tap again to remove') : tl('Remove')} ${label}`}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      class={`inline-flex min-w-[3.25rem] items-center justify-center rounded px-1.5 py-1 transition-colors ${
        armed
          ? 'border border-down/50 bg-down/10 font-anth text-[9px] font-semibold uppercase tracking-wider text-down'
          : 'text-muted hover:text-down'}`}>
      {armed ? tl('Sure?') : '×'}
    </button>
  )
}

function SharesCell({ portfolio, row }) {
  // restating shares is the most common edit — it happens in place, no
  // separate form round-trip (Jeff 2026-08-20: stepdad-proof the flow)
  const commit = (e) => {
    const v = Number(e.currentTarget.value)
    if (Number.isFinite(v) && v > 0 && v !== row.shares) setHolding(portfolio.id, row.symbol, v, row.cost)
    else e.currentTarget.value = String(row.shares)
  }
  return (
    <input key={`${row.symbol}:${row.shares}`} defaultValue={String(row.shares)}
      inputMode="decimal" data-1p-ignore data-lpignore="true" aria-label={`${tl('Shares')} ${row.symbol}`}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
      style={{ width: `${Math.max(5, String(row.shares).length + 1.5)}ch` }}
      class="rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-ink-2 outline-none transition-colors hover:border-line-2 focus:border-accent/60 focus:bg-surface-2" />
  )
}

/** Position sizing for a hand-built book (Jeff 2026-08-21: "a bunch of tools
 *  from portfolio can still be used by him"). Same sizeForWeight math as the
 *  broker book, but everything runs in the portfolio's display currency so a
 *  mixed HKD/USD book sizes honestly. */
function SizingForm({ portfolio, quotes, rates }) {
  const { total } = portfolioValues(portfolio.holdings, quotes, rates, portfolio.ccy, portfolio.cash)
  const [sym, setSym] = useState('')
  const [targetPct, setTargetPct] = useState('10')
  const chosen = String(sym || '').trim().toUpperCase()
  const live = useQuotes(chosen ? [chosen] : [])
  const q = live[chosen]?.quote
  const ccy = holdingCurrency(chosen, q)
  const px = q?.extPrice ?? q?.price
  const pxDisplay = convertCcy(typeof px === 'number' && px > 0 ? px : null, ccy, portfolio.ccy, rates)
  const held = portfolio.holdings.find((h) => h.symbol === chosen)?.shares || 0
  const r = pxDisplay != null && total.value
    ? sizeForWeight({ nlv: total.value, price: pxDisplay, targetPct: Number(targetPct) || 0, currentShares: held })
    : null
  const box = 'rounded-md border border-line-2 bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] text-ink placeholder:text-[10px] placeholder:text-muted outline-none focus:border-accent/60'
  return (
    <div>
      <div class="flex flex-wrap items-center gap-2">
        <SymbolSuggest value={sym} placeholder={tl('Symbol or company')} ariaLabel={`${tl('Sizing')} ${tl('Symbol')}`}
          onInput={(e) => setSym(e.currentTarget.value)} onPick={(h) => setSym(h.symbol)}
          dropUp={false} inputClass={`${box} w-36 uppercase`} />
        <label class="flex items-center gap-1.5 font-anth text-[10px] text-muted">
          {tl('Target weight')}
          <input value={targetPct} onInput={(e) => setTargetPct(e.currentTarget.value)}
            inputMode="decimal" data-1p-ignore data-lpignore="true" aria-label={tl('Target weight')}
            class={`${box} w-16 text-right`} />%
        </label>
        {r && (
          <span class="flex flex-wrap items-baseline gap-x-3 font-mono text-[11px]">
            <span class="text-ink">{tl('Target')} <span class="font-semibold">{r.targetShares}</span> {tl('shares')}</span>
            <span class={r.delta >= 0 ? 'text-up' : 'text-down'}>
              {r.delta >= 0 ? tl('buy') : tl('sell')} <span class="font-semibold">{Math.abs(r.delta)}</span>
              {' '}({fmtCcy(Math.abs(r.cost), portfolio.ccy)})
            </span>
            <span class="text-muted text-[10px]">{tl('now')} {held}</span>
          </span>
        )}
        {chosen && !r && <span class="font-anth text-[10px] text-muted">…</span>}
      </div>
      <div class="mt-1.5 font-anth text-[9.5px] text-muted">
        {tl('What a target weight works out to in shares, at the live price.')}
      </div>
    </div>
  )
}

function CostCell({ portfolio, row }) {
  // avg cost edits in place too (Jeff 2026-08-20) — blank clears it, which
  // simply turns the unrealized column back to a dash
  const commit = (e) => {
    const raw = e.currentTarget.value.trim()
    if (raw === '') { if (row.cost != null) setHolding(portfolio.id, row.symbol, row.shares) }
    else {
      const v = Number(raw)
      if (Number.isFinite(v) && v > 0 && v !== row.cost) setHolding(portfolio.id, row.symbol, row.shares, v)
      else e.currentTarget.value = row.cost != null ? String(row.cost) : ''
    }
  }
  return (
    <input key={`${row.symbol}:${row.cost ?? ''}`} defaultValue={row.cost != null ? String(row.cost) : ''}
      placeholder="—" inputMode="decimal" data-1p-ignore data-lpignore="true"
      aria-label={`${tl('Avg cost')} ${row.symbol}`}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
      class="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[10.5px] text-muted outline-none transition-colors hover:border-line-2 focus:border-accent/60 focus:bg-surface-2 focus:text-ink" />
  )
}

/** A cash balance edits in place the way shares do. Negative is legal — that
 *  is a margin balance, not a typo. */
function CashCell({ portfolio, row, rates }) {
  const commit = (e) => {
    const raw = e.currentTarget.value.replace(/,/g, '').trim()
    const v = Number(raw)
    // a cleared field is a slip, not a request to zero the account
    if (raw !== '' && Number.isFinite(v) && v !== row.amount) {
      const bookAmount = convertCcy(v - row.amount, row.ccy, portfolio.ccy, rates)
      setCash(portfolio.id, row.ccy, v, bookAmount == null ? {} : { bookAmount, bookCcy: portfolio.ccy })
    }
    else e.currentTarget.value = String(row.amount)
  }
  return (
    <input key={`${row.ccy}:${row.amount}`} defaultValue={String(row.amount)}
      inputMode="decimal" data-1p-ignore data-lpignore="true"
      aria-label={`${tl('Cash')} ${row.ccy}`}
      title={tl('Direct balance edits are recorded as deposits or withdrawals.')}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
      style={{ width: `${Math.max(6, String(row.amount).length + 1.5)}ch` }}
      class="rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-ink-2 outline-none transition-colors hover:border-line-2 focus:border-accent/60 focus:bg-surface-2" />
  )
}

export function Holdings({ portfolio, quotes, rates }) {
  useZhNames()
  const all = portfolioValues(portfolio.holdings, quotes, rates, portfolio.ccy, portfolio.cash)
  const { missing, total } = all
  const cashRows = all.rows.filter((r) => r.kind === 'cash')
  const ccy = portfolio.ccy
  // click a header to sort: numbers start descending, names ascending, a
  // second click flips, a third returns to the book's own order. The pick
  // persists across books — it's how this reader likes the table, not a
  // property of one book (Jeff 2026-08-22)
  const [sort, setSort] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_portfolio_sort_v1')) || {} } catch { return {} }
  })
  const clickSort = (key, first) => {
    const next = sort.key !== key ? { key, dir: first } : sort.dir === first ? { key, dir: first === 'asc' ? 'desc' : 'asc' } : {}
    setSort(next)
    try { localStorage.setItem('my_portfolio_sort_v1', JSON.stringify(next)) } catch { /* best-effort */ }
  }
  const holdRows = all.rows.filter((r) => r.kind !== 'cash')
  const rows = sortRows(holdRows, sort.key, sort.dir)
  // resting order shows its venue sections; an explicit header sort is one
  // flat list again (Gordon 2026-08-23: "make the groups more apparent")
  const sorted = !!(sort.key && sort.dir)
  const groups = !sorted ? venueGroups(holdRows) : null
  const groupLabel = { hk: tl('HK stocks'), cn: tl('A-shares'), other: tl('US & other') }
  const [collapsedByBook, setCollapsedByBook] = useState(() => {
    try { return JSON.parse(localStorage.getItem('my_portfolio_venue_collapse_v1')) || {} } catch { return {} }
  })
  const collapsed = new Set(collapsedByBook[portfolio.id] || [])
  const toggleVenue = (key) => {
    setCollapsedByBook((prev) => {
      const next = { ...prev }
      const keys = new Set(next[portfolio.id] || [])
      if (keys.has(key)) keys.delete(key); else keys.add(key)
      next[portfolio.id] = [...keys]
      try { localStorage.setItem('my_portfolio_venue_collapse_v1', JSON.stringify(next)) } catch { /* best-effort */ }
      return next
    })
  }
  const holdingRow = (r) => (
    <tr key={r.symbol} class="border-t border-line hover:bg-surface-3 whitespace-nowrap">
      <td class="px-2.5 py-[2px] cursor-pointer"
        onClick={() => (location.hash = `#/research/${r.symbol.toLowerCase()}`)}>
        <span class="font-bold text-accent">{r.symbol}</span>
        {holdingName(r.symbol, quotes) && (
          <span class="block max-w-[9rem] truncate font-anth text-[8.5px] leading-[1.1] text-muted">
            {holdingName(r.symbol, quotes)}
          </span>
        )}
      </td>
      <td class="px-1.5 py-[2px] font-anth text-[10px] text-muted">{r.ccy}</td>
      <td class="px-1.5 py-[2px] text-right"><SharesCell portfolio={portfolio} row={r} /></td>
      <td class="px-1.5 py-[2px] text-right"><CostCell portfolio={portfolio} row={r} /></td>
      <td class="px-1.5 py-[2px] text-right text-ink-2 font-medium">
        {r.price != null ? <FlashPrice price={r.price} fmt={fmtPrice} /> : '—'}
      </td>
      <td class={`px-1.5 py-[2px] text-right font-medium ${pnlCls(r.dayPct)}`}>
        {r.dayPnlDisplay != null
          ? <>{signed(r.dayPnlDisplay, ccy)} <span class="text-[10px] font-normal">({fmtPct(r.dayPct)})</span></>
          : r.dayPct != null ? fmtPct(r.dayPct) : '—'}
      </td>
      <td class="px-1.5 py-[2px] text-right text-ink font-semibold text-[12px]">
        {r.valueDisplay != null ? fmtCcy(r.valueDisplay, ccy) : '—'}
      </td>
      <td class="px-1.5 py-[2px] text-right text-ink-2 font-medium">
        {r.weightPct != null ? fmtPctPlain(r.weightPct) : '—'}
      </td>
      <td class={`px-1.5 py-[2px] text-right font-semibold ${pnlCls(r.unrealDisplay)}`}>
        {r.unrealDisplay != null ? signed(r.unrealDisplay, ccy) : '—'}
      </td>
      <td class="px-1.5 py-[2px] text-right">
        <ConfirmRemove label={r.symbol} onConfirm={() => removeHolding(portfolio.id, r.symbol)} />
      </td>
    </tr>
  )
  const venueTotalRow = (g) => {
    const subtotal = venueSubtotal(g.rows)
    return (
      <tr key={`venue-subtotal-${g.key}`} data-venue-subtotal={g.key}
        class="border-t border-line-2 bg-surface-2/55 font-medium whitespace-nowrap">
        <td colSpan={5} class="px-2.5 py-[4px] font-anth text-[10px] text-ink-2">
          {groupLabel[g.key]} <span class="text-muted">{tl('Subtotal')}</span>
          <span class="ml-1.5 font-mono text-[9px] text-muted">{subtotal.count}</span>
        </td>
        <td class={`px-1.5 py-[4px] text-right ${pnlCls(subtotal.dayPnl)}`}>
          {subtotal.dayPnl != null
            ? <>{signed(subtotal.dayPnl, ccy)} {subtotal.dayPct != null && <span class="text-[10px] font-normal">({fmtPct(subtotal.dayPct)})</span>}</>
            : '—'}
        </td>
        <td class="px-1.5 py-[4px] text-right font-semibold text-ink text-[12px]">
          {subtotal.value != null ? fmtCcy(subtotal.value, ccy) : '—'}
        </td>
        <td class="px-1.5 py-[4px] text-right text-ink-2">
          {subtotal.weightPct != null ? fmtPctPlain(subtotal.weightPct) : '—'}
        </td>
        <td class={`px-1.5 py-[4px] text-right font-semibold ${pnlCls(subtotal.unrealPnl)}`}>
          {subtotal.unrealPnl != null ? signed(subtotal.unrealPnl, ccy) : '—'}
        </td>
        <td />
      </tr>
    )
  }
  const th = (key, label, cls, first = 'desc') => (
    <th class={`${cls} book-th ${sort.key === key ? 'book-th-on' : ''}`} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => clickSort(key, first)} class="uppercase tracking-wider">{label}</button>
    </th>
  )
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto">
      <table class="book-table w-full border-collapse font-mono text-[11px]">
        <thead>
          {/* nowrap: 股数 stacked into two lines on a phone (Jeff 2026-08-20) */}
          <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider whitespace-nowrap">
            {th('symbol', tl('Sym'), 'px-2.5 py-1.5 text-left', 'asc')}
            {th('ccy', tl('Ccy'), 'px-1.5 py-1.5 text-left', 'asc')}
            {/* pr-2.5 = the cell's px-1.5 plus the editable input's own px-1 */}
            {th('shares', tl('Shares'), 'pl-1.5 pr-2.5 py-1.5 text-right')}
            {th('cost', tl('Avg cost'), 'pl-1.5 pr-2.5 py-1.5 text-right')}
            {th('price', tl('Price'), 'px-1.5 py-1.5 text-right')}
            {th('day', tl('Day'), 'px-1.5 py-1.5 text-right')}
            {th('value', `${tl('Value')} (${ccy})`, 'px-1.5 py-1.5 text-right')}
            {th('weight', tl('Weight'), 'px-1.5 py-1.5 text-right')}
            {th('unreal', tl('Unreal P&L'), 'px-1.5 py-1.5 text-right')}
            <th class="px-1.5 py-1.5" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {groups && groups.length > 1 && groups.flatMap((g) => [
            <tr key={`venue-${g.key}`} class="border-t border-line bg-surface-2/80">
              <td colSpan={10} class="p-0">
                <button type="button" data-venue-group={g.key} aria-expanded={!collapsed.has(g.key)}
                  onClick={() => toggleVenue(g.key)}
                  class="group flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-anth transition-colors hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none">
                  <span class="h-3.5 w-0.5 rounded-full bg-accent/70" aria-hidden="true" />
                  <span class="text-[10px] font-semibold uppercase tracking-[.13em] text-ink-2 group-hover:text-ink">
                    {groupLabel[g.key]}
                  </span>
                  <span class="font-mono text-[9.5px] font-semibold tracking-normal text-accent/85">· {g.rows.length}</span>
                  <svg viewBox="0 0 12 12" class={`ml-auto h-3 w-3 text-muted transition-transform ${collapsed.has(g.key) ? '-rotate-90' : ''}`} aria-hidden="true">
                    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </td>
            </tr>,
            ...(collapsed.has(g.key) ? [] : [...g.rows.map(holdingRow), venueTotalRow(g)]),
          ])}
          {!(groups && groups.length > 1) && rows.map(holdingRow)}
          {!rows.length && !cashRows.length && (
            <tr class="border-t border-line">
              <td colSpan={10} class="px-3 py-5 text-center font-anth text-[11px] text-muted">
                {tl('No holdings yet — add a symbol below.')}
                <span class="mt-0.5 block text-[9.5px] opacity-80">{tl('Prices, totals and weights appear as soon as the first one lands.')}</span>
              </td>
            </tr>
          )}
          {cashRows.map((r) => (
            <tr key={r.symbol} class="border-t border-line hover:bg-surface-3 whitespace-nowrap">
              <td class="px-2.5 py-[2px]">
                <span class="font-bold text-ink-2">{tl(cashAccountName(r.ccy))}</span>
              </td>
              <td class="px-1.5 py-[2px] font-anth text-[10px] text-muted">{r.ccy}</td>
              <td class="px-1.5 py-[2px] text-right"><CashCell portfolio={portfolio} row={r} rates={rates} /></td>
              <td class="px-1.5 py-[2px] text-right text-muted">—</td>
              <td class="px-1.5 py-[2px] text-right text-muted">—</td>
              <td class="px-1.5 py-[2px] text-right text-muted">—</td>
              <td class="px-1.5 py-[2px] text-right text-ink font-semibold text-[12px]">
                {r.valueDisplay != null ? fmtCcy(r.valueDisplay, ccy) : '—'}
              </td>
              <td class="px-1.5 py-[2px] text-right text-ink-2 font-medium">
                {r.weightPct != null ? fmtPctPlain(r.weightPct) : '—'}
              </td>
              <td class="px-1.5 py-[2px] text-right text-muted">—</td>
              <td class="px-1.5 py-[2px] text-right">
                {(portfolio.cashTxns || []).every((entry) => entry.ccy !== r.ccy || entry.kind === 'opening')
                  && !(portfolio.txns || []).some((txn) => txn.ccy === r.ccy && txn.affectsCash) ? (
                    <ConfirmRemove label={tl(cashAccountName(r.ccy))} onConfirm={() => removeCash(portfolio.id, r.ccy)} />
                  ) : (
                    <button type="button" aria-label={tl('Cash activity')}
                      onClick={() => window.dispatchEvent(new CustomEvent('portfolio-tool', { detail: 'cash' }))}
                      class="font-anth text-[9px] text-muted hover:text-accent">{tl('activity')}</button>
                  )}
              </td>
            </tr>
          ))}
          {(rows.length > 0 || cashRows.length > 0) && (
            <tr class="border-t border-line-2 bg-surface-2 font-bold whitespace-nowrap">
              <td class="px-2.5 py-[5px] text-ink" colSpan={5}>{tl('Total')}</td>
              <td class={`px-1.5 py-[5px] text-right ${pnlCls(total.dayPnl)}`}>
                {total.dayPnl != null ? signed(total.dayPnl, ccy) : '—'}
              </td>
              <td class="px-1.5 py-[5px] text-right text-ink text-[12.5px]">{fmtCcy(total.value, ccy)}</td>
              <td class="px-1.5 py-[5px] text-right text-ink-2">{total.value != null ? '100%' : '—'}</td>
              <td class={`px-1.5 py-[5px] text-right text-[12.5px] ${pnlCls(total.unrealPnl)}`}>
                {total.unrealPnl != null ? signed(total.unrealPnl, ccy) : '—'}
              </td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      {missing.length > 0 && (
        <div class="px-3 py-1.5 border-t border-line font-anth text-[10px] text-muted">
          {tl('Awaiting prices or FX for')}: {missing.join(', ')} — {tl('excluded from totals')}
        </div>
      )}
    </section>
  )
}

/** Shares of a whole as a ring: slices are [{label, value, cls}], the centre
 *  carries one figure. SVG only — a ring of six arcs is not a chart library. */
function Donut({ slices, centre, centreSub }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (!(total > 0)) return null
  const R = 22; const C = 2 * Math.PI * R
  let acc = 0
  return (
    <svg viewBox="0 0 56 56" class="h-[72px] w-[72px] shrink-0 -rotate-90" role="img">
      <circle cx="28" cy="28" r={R} fill="none" stroke="var(--color-surface-3)" stroke-width="7" />
      {slices.map((x, i) => {
        const len = (x.value / total) * C
        const el = <circle key={i} cx="28" cy="28" r={R} fill="none" stroke={x.color} stroke-width="7"
          stroke-dasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`} stroke-dashoffset={(-acc).toFixed(2)} />
        acc += len
        return el
      })}
      <g class="rotate-90" style={{ transformOrigin: '28px 28px' }}>
        <text x="28" y={centreSub ? 27 : 30} text-anchor="middle" class="font-anth fill-current text-ink" style={{ fontSize: '10px', fontWeight: 600 }}>{centre}</text>
        {centreSub && <text x="28" y="36" text-anchor="middle" class="fill-current text-muted" style={{ fontSize: '6px' }}>{centreSub}</text>}
      </g>
    </svg>
  )
}
const RING = ['#f59e0b', '#60a5fa', '#f472b6', '#a3e635', '#c084fc', '#34d399', '#6b7280']
// CNY is the red one; HKD gets the amber so the two never read as a pair
const CCY_RING = { CNY: '#f85149', HKD: '#f59e0b', USD: '#34d399', CAD: '#60a5fa' }
const ccyFlag = (c) => venueFlag({ symbol: { HKD: 'X.HK', CNY: 'X.SS', USD: 'X', CAD: 'X.TO', GBP: 'X.L', JPY: 'X.T', SGD: 'X.SI', AUD: 'X.AX', EUR: 'X.DE' }[c] || '' }) || null

/** The book's marks as a dated line with the first/last values labelled —
 *  the 净值 page's chart at card size, book only. */
function MiniLine({ marks, ccy }) {
  const pts = marks.slice(-90)
  if (pts.length < 2) return null
  const W = 200; const H = 56
  const vs = pts.map((m) => m.v)
  const lo = Math.min(...vs); const hi = Math.max(...vs); const span = hi - lo || 1
  const x = (i) => (i / (pts.length - 1)) * W
  const y = (v) => 4 + (1 - (v - lo) / span) * (H - 8)
  const d = vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const up = vs[vs.length - 1] >= vs[0]
  const col = up ? 'var(--color-up)' : 'var(--color-down)'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" class="block h-[56px] w-full" role="img">
      <defs>
        <linearGradient id="mini-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color={col} stop-opacity="0.2" />
          <stop offset="1" stop-color={col} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#mini-fill)" stroke="none" />
      <path d={d} fill="none" stroke={col} stroke-width="1.6" vector-effect="non-scaling-stroke" />
    </svg>
  )
}

/** The book's own marks (one per day the page saw it fully priced) as a
 *  bare line — needs two marks before it draws anything. */
function Sparkline({ marks }) {
  const pts = marks.slice(-60).map((m) => m.v).filter((v) => Number.isFinite(v))
  if (pts.length < 2) return null
  const W = 120; const H = 30
  const lo = Math.min(...pts); const hi = Math.max(...pts); const span = hi - lo || 1
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - lo) / span) * (H - 4)).toFixed(1)}`).join(' ')
  const up = pts[pts.length - 1] >= pts[0]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" class="w-full h-[30px] max-sm:hidden" role="img">
      <path d={d} fill="none" stroke={up ? 'var(--color-up)' : 'var(--color-down)'} stroke-width="1.6" vector-effect="non-scaling-stroke" />
    </svg>
  )
}

const CAPITAL_MIX = {
  cn: { label: 'A-shares', short: 'A', cls: 'bg-accent' },
  hk: { label: 'HK stocks', short: 'HK', cls: 'bg-accent-2' },
  other: { label: 'Other equities', short: 'Other', cls: 'bg-ink-2/65' },
  cash: { label: 'Cash', short: 'Cash', cls: 'bg-up/70' },
}

/** The compact allocation rail in the hero's final grid slot. It answers a
 *  different question from Currency mix below: what capital is deployed in
 *  A-shares, Hong Kong, elsewhere, or still cash. */
function CapitalMix({ rows, className = '' }) {
  const parts = capitalMix(rows)
  return (
    <div class={`min-w-0 ${className}`}>
      <div class="pb-1 font-anth text-[8.5px] uppercase tracking-wider text-muted">{tl('Capital mix')}</div>
      {parts.length ? (
        <>
          <div class="flex h-2 w-full overflow-hidden rounded-sm bg-surface-3" aria-label={tl('Capital mix')}>
            {parts.map((part) => (
              <span key={part.key} class={CAPITAL_MIX[part.key].cls}
                style={{ width: `${part.pct}%` }}
                title={`${tl(CAPITAL_MIX[part.key].label)} ${fmtPctPlain(part.pct)}`} />
            ))}
          </div>
          <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[9px] leading-none text-muted">
            {parts.map((part) => (
              <span key={part.key} class="whitespace-nowrap">
                <span class="text-ink-2">{tl(CAPITAL_MIX[part.key].short)}</span> {Math.round(part.pct)}%
              </span>
            ))}
          </div>
        </>
      ) : <span class="font-mono text-[11px] text-muted">—</span>}
    </div>
  )
}

function SummaryStrip({ portfolio, quotes, rates, ccys, fxLive, bench }) {
  const { total, rows } = portfolioValues(portfolio.holdings, quotes, rates, portfolio.ccy, portfolio.cash)
  const priced = rows.filter((r) => r.valueDisplay != null)
  // The panel beside the headline number was three facts wide and mostly air
  // (Jeff 2026-08-21). Same rows, read seven ways.
  const br = breadth(rows)
  const un = unrealizedStats(rows)
  const cs = cashSplit(rows)
  const topWeight = priced.reduce((m, r) => (r.weightPct != null && r.weightPct > m ? r.weightPct : m), 0) || null
  const chip = (v, pct) =>
    v == null ? null : (
      <span class={`font-anth text-[12px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${
        v >= 0 ? 'text-up border-up/30 bg-up/10' : 'text-down border-down/30 bg-down/10'}`}>
        {signed(v, portfolio.ccy)}{pct != null && <span class="text-[10px] font-normal"> ({fmtPct(pct)})</span>}
      </span>
    )
  const fxUsed = [...new Set([...(ccys || []), portfolio.ccy])].filter((c) => c !== 'USD')
  // One rate per line rather than one truncated line (Jeff 2026-08-21: the
  // second pair was cut off mid-word). Two currencies is the common case and
  // both have to be readable; the column is the narrowest of the three.
  const fxRates = fxUsed.map((c) => [c, rates[c] != null ? rates[c].toFixed(3) : '…'])
  // file today's mark once the whole book has priced — a partial book
  // would write a value that is just "what loaded so far"
  const fullyPriced = rows.length > 0 && priced.length === rows.length && Number.isFinite(total.value)
  useEffect(() => {
    if (!fullyPriced) return
    recordSnapshot(portfolio.id, total.value, portfolio.ccy)
  }, [fullyPriced, Math.round(total.value || 0), portfolio.id, portfolio.ccy])
  const prevMark = previousSnapshot(portfolio, portfolio.ccy)
  const marks = (portfolio.snapshots || []).filter((s) => s.c === portfolio.ccy)
  const vfact = (label, value, good, sub) => (
    <div key={label} class="min-w-0">
      <div class="font-anth text-[8.5px] uppercase tracking-wider text-muted pb-0.5">{label}</div>
      <div class={`font-anth text-[13px] font-semibold tabular-nums whitespace-nowrap ${good == null ? 'text-ink' : good ? 'text-up' : 'text-down'}`}>{value}</div>
      {sub && <div class="font-mono text-[9.5px] text-muted">{sub}</div>}
    </div>
  )
  const sinceLast = prevMark && Number.isFinite(total.value) ? total.value - prevMark.v : null
  return (
    <section class="book-hero border border-line rounded-xl overflow-hidden bg-surface-1">
      <div class="flex flex-wrap items-stretch">
        <div class="px-4 py-3 flex-1 min-w-[240px] flex flex-col justify-between gap-3">
          {/* the trend line lives under the number, full width — beside it,
              an eight-digit book at 30px walked straight through the svg
              (Jeff 2026-08-23). Each chip is atomic: wrap between facts,
              never inside one. */}
          <div>
            <div class="font-anth text-[9px] uppercase tracking-[.14em] text-muted">{tl('Value')} ({portfolio.ccy})</div>
            <div class="font-anth text-[30px] leading-tight font-semibold tracking-tight text-ink tabular-nums">{money(total.value, portfolio.ccy)}</div>
            {/* one row always (Jeff 2026-08-23) — overflow scrolls rather
                than wrapping the percent away from its number */}
            <div class="flex items-center gap-2 pt-1.5 overflow-x-auto no-scrollbar">
              {chip(total.dayPnl, total.dayPct)}
              {sinceLast != null && (
                <span class="font-anth text-[10.5px] text-muted whitespace-nowrap" title={prevMark.d}>{tl('since last')}{' '}
                  <span class={`font-semibold ${pnlCls(sinceLast)}`}>{signed(sinceLast, portfolio.ccy)}
                    {prevMark.v > 0 && <span class="font-normal"> ({fmtPct((sinceLast / prevMark.v) * 100)})</span>}</span></span>
              )}
            </div>
            <Sparkline marks={marks} />
          </div>
          {/* the book's own money facts live beside the headline; market facts
              live on the right (Jeff 2026-08-22: the space beside the number
              and the strip under it were empty) */}
          <div class="flex flex-wrap gap-x-6 gap-y-2">
            {vfact(tl('Cost basis'), un.costBasis != null ? money(un.costBasis, portfolio.ccy) : '—', null)}
            {vfact(tl('Open P&L'), total.unrealPnl != null ? signed(total.unrealPnl, portfolio.ccy) : '—', total.unrealPnl == null ? null : total.unrealPnl >= 0,
              un.pct != null ? fmtPct(un.pct) : null)}
            {vfact(tl('Cash'), cs.cash ? money(cs.cash, portfolio.ccy) : '—', null, cs.cashPct != null ? fmtPctPlain(cs.cashPct) : null)}
          </div>
        </div>
        <div class="px-4 py-3 flex-[1.6] min-w-[300px] border-l border-line max-sm:border-l-0 max-sm:border-t flex flex-col justify-center">
          {/* what a HK / mainland holder reads first: where the book sits, how
              each market did today, what the currency did to it, and whether
              those markets are even open right now (Jeff 2026-08-22) */}
          {(() => {
            const venues = venueDayBreakdown(priced)
            const heroVenues = venues.slice(0, 2)
            const fxPct = fxDayPct(fxLive, ccys, portfolio.ccy)
            const fxImp = fxImpact(priced, fxPct, portfolio.ccy)
            const rateTo = (c) => (rates?.[c] && rates?.[portfolio.ccy] ? rates[c] / rates[portfolio.ccy] : null)
            const fact = (label, value, good, sub) => (
              <div key={label} class="min-w-0">
                <div class="font-anth text-[8.5px] uppercase tracking-wider text-muted pb-0.5">{label}</div>
                <div class={`font-anth text-[13px] font-semibold tabular-nums whitespace-nowrap ${good == null ? 'text-ink' : good ? 'text-up' : 'text-down'}`}>{value}</div>
                {sub && <div class="font-mono text-[9.5px] text-muted leading-snug">{Array.isArray(sub) ? sub.map((t, i) => <span key={i} class="inline-block whitespace-nowrap mr-2">{t}</span>) : sub}</div>}
              </div>
            )
            return (
              <>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 font-mono text-[10px]">
                  {SESSION_VENUES.filter((v) => venues.some((b) => b.venue === v) || v !== 'US').map((v) => {
                    const ss = marketSession(v)
                    return (
                      <span key={v} class="inline-flex items-center gap-1 whitespace-nowrap">
                        <span class={`inline-block h-1.5 w-1.5 rounded-full ${ss.state === 'open' ? 'bg-up' : ss.state === 'closed' ? 'bg-muted/50' : 'bg-accent'}`} />
                        <span class="text-ink-2">{tl(VENUE_SHORT[v])}</span>
                        <span class={sessionTone[ss.state]}>{tl(`market ${ss.state}`)}{ss.opensAt ? ` ${ss.opensAt}` : ''}</span>
                      </span>
                    )
                  })}
                  <span class="mx-1 h-3 w-px bg-line" />
                  {BENCH.map((b) => {
                    const q = bench?.[b.symbol]?.quote
                    return (
                      <span key={b.symbol} class="inline-flex items-baseline gap-1 whitespace-nowrap">
                        <span class="text-muted">{tl(b.label)}</span>
                        <span class={q?.pct == null ? 'text-muted' : q.pct >= 0 ? 'text-up' : 'text-down'}>{q?.pct == null ? '—' : fmtPct(q.pct)}</span>
                      </span>
                    )
                  })}
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                  {heroVenues.map((b) => fact(tl(VENUE_SHORT[b.venue] || b.venue),
                    b.dayPct == null ? fmtPctPlain(b.weightPct) : `${fmtPct(b.dayPct)}`, b.dayPct == null ? null : b.dayPct >= 0,
                    [`${fmtPctPlain(b.weightPct)} ${tl('of book')}`, b.hasDay ? signed(b.dayPnl, portfolio.ccy) : '—']))}
                  {fact(tl('FX impact'), Object.keys(fxImp.byCcy).length ? signed(fxImp.total, portfolio.ccy) : '—', Object.keys(fxImp.byCcy).length ? fxImp.total >= 0 : null,
                    Object.entries(fxPct).filter(([c]) => c !== 'USD' || ccys.includes('USD')).slice(0, 2).map(([c, p]) => `${c}→${portfolio.ccy} ${rateTo(c) != null ? rateTo(c).toFixed(4) : '…'} ${p >= 0 ? '+' : ''}${p.toFixed(2)}%`))}
                  {fact(tl('Top weight'), topWeight != null ? fmtPctPlain(topWeight) : '—', null,
                    (() => { const t = priced.find((r) => r.weightPct === topWeight); return t ? holdingName(t.symbol, quotes) : null })())}
                  {fact(tl('Day range'), (() => {
                    const best = priced.filter((r) => r.kind !== 'cash' && r.dayPct != null)
                    if (!best.length) return '—'
                    const hi = Math.max(...best.map((r) => r.dayPct)); const lo = Math.min(...best.map((r) => r.dayPct))
                    return `${fmtPct(lo)} / ${fmtPct(hi)}`
                  })(), null, null)}
                  {fact(tl('Names'), String(priced.filter((r) => r.kind !== 'cash').length), null, `${br.up} ↑ · ${br.flat || 0} → · ${br.down} ↓`)}
                  <CapitalMix rows={priced} className={heroVenues.length === 0 ? 'sm:col-span-2' : heroVenues.length === 2 ? 'sm:col-span-3' : ''} />
                </div>
              </>
            )
          })()}
        </div>
      </div>
    </section>
  )
}

/** At-a-glance analysis for a hand-built book (Jeff 2026-08-20: the landing
 *  must still read like an overview, not a bare table; 2026-08-21: "add more
 *  analytics ... if we add a ton then add a way for user to hide em").
 *
 *  Nine cards is more than one screen wants, so every card is individually
 *  hideable and the hidden set persists. All of it derives from the same
 *  valued rows the table shows — no extra fetch, and no card that can
 *  disagree with the total above it. */
/** East Money industry labels for the book's HK / mainland names, fetched
 *  once each (cached in cnData) with provider spacing, so the Sectors card
 *  has buckets for a book the US large-cap table knows nothing about. */
function useCnIndustries(symbols) {
  const [map, setMap] = useState({})
  const key = symbols.filter(isCnListing).sort().join(',')
  useEffect(() => {
    let live = true
    const syms = key ? key.split(',') : []
    ;(async () => {
      for (const sym of syms) {
        try {
          const label = await fetchCnIndustry(sym)
          if (!live) return
          if (label) setMap((m) => (m[sym] === label ? m : { ...m, [sym]: label }))
        } catch { /* a missing label is an Other row, not an error */ }
        // push2 302s a burst; a book of 20 fills in over ~30s, then sits in cache
        await new Promise((r) => setTimeout(r, 1500))
      }
    })()
    return () => { live = false }
  }, [key])
  return map
}

// The three cards a reader looks at first sit above the table; the rest
// follow it (Jeff 2026-08-22: "put the 3 most important cards up top, then
// the table, then the rest")
// movers, the book against its indices, and the currency's share of the day:
// the three questions a HK / mainland holder asks first (Jeff 2026-08-22)
const TOP_CARDS = ['movers', 'indices', 'fx']
const BENCH = [
  { symbol: '^HSI', label: 'HSI', venue: 'HK' },
  { symbol: '000300.SS', label: 'CSI 300', venue: 'CN' },
  { symbol: '^GSPC', label: 'S&P 500', venue: 'US' },
]
const SESSION_VENUES = ['HK', 'CN', 'US']
const VENUE_SHORT = { HK: 'HK stocks', CN: 'A-shares', US: 'US stocks', CA: 'Canada', OTHER: 'Other' }
const sessionTone = { open: 'text-up', lunch: 'text-accent', pre: 'text-accent', closed: 'text-muted' }

/** The next 30 days of results dates and ex-dividends across the book —
 *  the events page's data, cached, trickled in with provider spacing. */
function UpcomingCard({ symbols, quotes }) {
  const [ev, setEv] = useState({})
  const key = symbols.join(',')
  useEffect(() => {
    let live = true
    setEv({})
    ;(async () => {
      for (const sym of symbols) {
        try {
          const e = await fetchSymbolEventsCached(sym)
          if (!live) return
          setEv((m) => ({ ...m, [sym]: e }))
        } catch { /* a missing calendar is an absent row */ }
        await new Promise((r) => setTimeout(r, 450))
      }
    })()
    return () => { live = false }
  }, [key])
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const items = symbols.flatMap((sym) => {
    const e = ev[sym]
    if (!e) return []
    const out = []
    if (e.nextResults && e.nextResults >= today && e.nextResults <= horizon) out.push({ d: e.nextResults, sym, what: tl('results') })
    if (e.exDate && e.exDate >= today && e.exDate <= horizon) out.push({ d: e.exDate, sym, what: tl('ex-div') })
    return out
  }).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6)
    .map((it) => ({ ...it, days: daysUntil(it.d, today) }))
  const loaded = Object.keys(ev).length
  if (!items.length) {
    return <span class="font-anth text-[10px] text-muted">{loaded >= symbols.length ? tl('Nothing due in the next 30 days.') : `${tl('loading')} ${loaded}/${symbols.length}…`}</span>
  }
  return (
    <div class="flex flex-col gap-0.5 font-mono text-[10.5px]">
      {items.map((it, i) => (
        <div key={i} class="flex items-baseline gap-2">
          <span class="w-11 shrink-0 text-accent">{it.d.slice(5).replace('-', '/')}</span>
          <span class={`w-8 shrink-0 text-right font-anth text-[9.5px] ${it.days <= 1 ? 'text-accent font-semibold' : 'text-muted'}`}>{it.days === 0 ? tl('Today') : tl('{n}d').replace('{n}', it.days)}</span>
          <a href={`#/research/${it.sym.toLowerCase()}`} class="font-bold text-ink hover:underline">{it.sym}</a>
          <span class="min-w-0 truncate font-anth text-[9.5px] text-muted">{holdingName(it.sym, quotes)}</span>
          <span class="ml-auto shrink-0 font-anth text-[9.5px] text-muted">{it.what}</span>
        </div>
      ))}
    </div>
  )
}

function BookAnalysis({ portfolio, quotes, rates, slot = null, fxLive = {}, bench = {} }) {
  const [hidden, setHidden] = useState(hiddenCards)
  const [editing, setEditing] = useState(false)
  useEffect(() => onCardsChange((next) => setHidden([...next])), [])
  const { rows } = portfolioValues(portfolio.holdings, quotes, rates, portfolio.ccy, portfolio.cash)
  const priced = rows.filter((r) => r.valueDisplay != null)
  const ccy = portfolio.ccy
  // only the slot that renders the Sectors card pays for industry lookups
  const industries = useCnIndustries(slot === 'top' ? [] : priced.map((r) => r.symbol))
  if (priced.length < 2) return null

  const card = (id, title, body) => {
    // a card whose body is null has nothing to say for this book — same as hidden
    if (hidden.includes(id) || body == null) return null
    return (
      <section key={id} class="book-card rounded-xl border border-line bg-surface-1 px-3 py-2 min-w-0">
        <div class="book-eyebrow pb-1 font-anth text-[9px] uppercase tracking-wider text-muted">{title}</div>
        {body}
      </section>
    )
  }
  // one shared bar row so nine cards do not drift into nine bar styles
  const bar = (key, label, width, value, cls = 'bg-accent/50', labelCls = 'text-ink-2') => (
    <div key={key} class="flex items-center gap-2 font-mono text-[10px]">
      <span class={`w-16 shrink-0 truncate font-bold ${labelCls}`}>{label}</span>
      <span class={`h-2 rounded-sm ${cls}`} style={{ width: `${Math.max(0, Math.min(100, width))}%`, minWidth: '2px' }} />
      <span class="ml-auto text-muted">{value}</span>
    </div>
  )
  const stat = (label, value, cls = 'text-ink') => (
    <div key={label} class="flex items-baseline justify-between gap-2">
      <span class="font-anth text-[10px] text-muted">{label}</span>
      <span class={`font-mono text-[11.5px] font-semibold ${cls}`}>{value}</span>
    </div>
  )

  const movers = priced.filter((r) => r.dayPnlDisplay != null)
    .sort((a, b) => Math.abs(b.dayPnlDisplay) - Math.abs(a.dayPnlDisplay)).slice(0, 4)
  const byWeight = [...priced].sort((a, b) => b.weightPct - a.weightPct).slice(0, 6)
  const maxW = byWeight[0]?.weightPct || 1
  const con = concentration(rows)
  const br = breadth(rows)
  const un = unrealizedStats(rows)
  const contrib = dayContribution(rows).slice(0, 5)
  const cs = cashSplit(rows)
  const mix = new Map()
  for (const r of priced) mix.set(r.ccy, (mix.get(r.ccy) || 0) + r.valueDisplay)
  const mixTotal = [...mix.values()].reduce((a, b) => a + b, 0)

  const cards = [
    card('movers', tl('Day movers'), (
      <div class="flex flex-col gap-0.5 font-mono text-[11px]">
        {movers.map((r) => {
          const lim = limitFlag(r.symbol, r.dayPct)
          return (
            <div key={r.symbol} class="flex items-baseline justify-between gap-2">
              <span class="min-w-0 flex items-baseline gap-1.5">
                <span class="font-bold text-accent">{r.symbol}</span>
                {holdingName(r.symbol, quotes) && <span class="truncate font-anth text-[9.5px] text-muted">{holdingName(r.symbol, quotes)}</span>}
                {lim && <span class={`rounded px-1 font-anth text-[8.5px] font-bold ${lim === 'up' ? 'bg-up/20 text-up' : 'bg-down/20 text-down'}`}>{tl(lim === 'up' ? 'limit up' : 'limit down')}</span>}
              </span>
              <span class={`shrink-0 ${pnlCls(r.dayPnlDisplay)}`}>
                {signedGlance(r.dayPnlDisplay, ccy)}
                <span class="text-[10px] font-normal"> ({fmtPct(r.dayPct)})</span>
              </span>
            </div>
          )
        })}
      </div>
    )),
    // the book's day against the indices it actually trades under — a HK /
    // mainland book that "fell" on a day the HSI fell more did its job
    card('indices', tl('vs indices'), (() => {
      const dayRows = priced.filter((r) => r.dayPnlDisplay != null)
      const v = dayRows.reduce((s, r) => s + r.valueDisplay, 0)
      const pnl = dayRows.reduce((s, r) => s + r.dayPnlDisplay, 0)
      const bookPct = v - pnl > 0 ? (pnl / (v - pnl)) * 100 : null
      const row = (label, pct, strong) => (
        <div key={label} class="flex items-center gap-2 font-mono text-[10.5px]">
          <span class={`w-16 shrink-0 truncate font-anth ${strong ? 'text-ink font-semibold' : 'text-ink-2'}`}>{label}</span>
          <span class="relative h-2 flex-1 rounded-sm bg-surface-3 overflow-hidden">
            {pct != null && <span class={`absolute top-0 h-2 ${pct >= 0 ? 'bg-up/60 left-1/2' : 'bg-down/60 right-1/2'}`} style={{ width: `${Math.min(50, Math.abs(pct) * 8)}%` }} />}
            <span class="absolute left-1/2 top-0 h-2 w-px bg-line" />
          </span>
          <span class={`w-14 text-right ${pct == null ? 'text-muted' : pct >= 0 ? 'text-up' : 'text-down'}`}>{pct == null ? '—' : fmtPct(pct)}</span>
        </div>
      )
      return (
        <div class="flex flex-col gap-1">
          {row(tl('This book'), bookPct, true)}
          {BENCH.map((b) => row(tl(b.label), bench?.[b.symbol]?.quote?.pct ?? null, false))}
        </div>
      )
    })()),
    // a CNY-denominated book full of HKD names moves with the peg's drift
    // and the USD/CNY fix as much as with the tape — say how much was that
    card('fx', tl('FX impact'), (() => {
      const ccys = [...new Set(priced.map((r) => r.ccy))]
      const fxPct = fxDayPct(fxLive, ccys, ccy)
      const imp = fxImpact(priced, fxPct, ccy)
      const entries = Object.entries(imp.byCcy)
      if (!entries.length) return <span class="font-anth text-[10px] text-muted">{tl('No currency exposure — everything trades in the display currency.')}</span>
      const rateTo = (c) => (rates?.[c] && rates?.[ccy] ? rates[c] / rates[ccy] : null)
      return (
        <div class="flex flex-col gap-1">
          {stat(tl('Day move'), signedGlance(imp.total, ccy), pnlCls(imp.total))}
          {entries.map(([c, v]) => (
            <div key={c} class="flex items-center gap-2 font-mono text-[10px]">
              <span class="w-20 shrink-0 font-anth text-ink-2">{c}→{ccy}</span>
              <span class="text-ink">{rateTo(c) != null ? rateTo(c).toFixed(4) : '…'}</span>
              <span class={fxPct[c] >= 0 ? 'text-up' : 'text-down'}>{fxPct[c] >= 0 ? '+' : ''}{fxPct[c].toFixed(2)}%</span>
              <span class={`ml-auto ${pnlCls(v)}`}>{signedGlance(v, ccy)}</span>
            </div>
          ))}
        </div>
      )
    })()),
    card('upcoming', tl('Upcoming'), <UpcomingCard symbols={priced.filter((r) => r.kind !== 'cash').map((r) => r.symbol)} quotes={quotes} />),
    // Movers ranks by size of move; this ranks by share of the day's total
    // move, which is the question "what actually moved my book today".
    card('contribution', tl('Day contribution'), contrib.length ? (
      <div class="flex flex-col gap-1">
        {contrib.map((r) => bar(r.symbol, r.symbol, r.sharePct ?? 0,
          signedGlance(r.pnl, ccy), r.pnl >= 0 ? 'bg-up/55' : 'bg-down/55',
          r.pnl >= 0 ? 'text-up' : 'text-down'))}
      </div>
    ) : <span class="font-anth text-[10px] text-muted">—</span>),
    card('breadth', tl('Breadth'), (
      <div class="flex flex-col gap-1">
        <div class="flex h-2.5 w-full overflow-hidden rounded-sm bg-surface-3">
          <span class="bg-up/70" style={{ width: `${(br.up / Math.max(1, br.up + br.down + br.flat)) * 100}%` }} />
          <span class="bg-ink-2/40" style={{ width: `${(br.flat / Math.max(1, br.up + br.down + br.flat)) * 100}%` }} />
          <span class="bg-down/70" style={{ width: `${(br.down / Math.max(1, br.up + br.down + br.flat)) * 100}%` }} />
        </div>
        {stat(tl('Advancing'), `${br.up} / ${br.up + br.down + br.flat}`, 'text-up')}
        {br.best && stat(tl('Best'), `${br.best.symbol} ${fmtPct(br.best.dayPct)}`, 'text-up')}
        {br.worst && stat(tl('Worst'), `${br.worst.symbol} ${fmtPct(br.worst.dayPct)}`, 'text-down')}
      </div>
    )),
    card('weights', tl('Weights'), (
      <div class="flex flex-col gap-1">
        {byWeight.map((r) => bar(r.symbol, r.symbol, (r.weightPct / maxW) * 100, fmtPctPlain(r.weightPct)))}
      </div>
    )),
    // effective N: the number of equal positions that would concentrate the
    // same way. A 20-name book with one 40% position is not a 20-name book.
    card('concentration', cs.cash !== 0 ? `${tl('Concentration')} · ${tl('ex-cash')}` : tl('Concentration'), con.top1 == null ? null : (() => {
      const held = priced.filter((r) => r.kind !== 'cash').sort((a, b) => b.valueDisplay - a.valueDisplay)
      const heldTotal = held.reduce((s, r) => s + r.valueDisplay, 0)
      const top = held.slice(0, 5)
      const rest = heldTotal - top.reduce((s, r) => s + r.valueDisplay, 0)
      const slices = [...top.map((r, i) => ({ label: r.symbol, value: r.valueDisplay, color: RING[i] })),
        ...(rest > 0 ? [{ label: tl('Other'), value: rest, color: RING[6] }] : [])]
      return (
        <div class="flex items-center gap-3">
          <Donut slices={slices} centre={con.effectiveN.toFixed(1)} centreSub={`/ ${con.count}`} />
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            {stat(tl('Largest'), `${top[0].symbol} ${fmtPctPlain((top[0].valueDisplay / heldTotal) * 100)}`)}
            {stat(tl('Top 3'), fmtPctPlain(con.top3))}
            {stat(tl('Top 5'), fmtPctPlain(con.top5))}
            {stat(tl('Effective names'), con.effectiveN.toFixed(1), con.effectiveN < con.count / 2 ? 'text-accent' : 'text-ink')}
          </div>
        </div>
      )
    })()),
    card('unrealized', tl('Open P&L'), un.covered ? (
      <div class="flex flex-col gap-1">
        {stat(tl('Cost basis'), glance(un.costBasis, ccy))}
        {stat(tl('Open'), `${signedGlance(un.pnl, ccy)}${un.pct != null ? ` (${fmtPct(un.pct)})` : ''}`, pnlCls(un.pnl))}
        {un.best && stat(tl('Best'), `${un.best.symbol} ${fmtPct(un.best.unrealPct)}`, 'text-up')}
        {un.worst && stat(tl('Worst'), `${un.worst.symbol} ${fmtPct(un.worst.unrealPct)}`, 'text-down')}
        {un.covered < priced.filter((r) => r.kind !== 'cash').length && stat(tl('With cost'), `${un.covered} / ${priced.filter((r) => r.kind !== 'cash').length}`, 'text-muted')}
      </div>
    ) : (
      <div class="flex flex-col gap-1">
        {stat(tl('Cost basis'), '—', 'text-muted')}
        {stat(tl('Open'), '—', 'text-muted')}
        {stat(tl('With cost'), `0 / ${priced.filter((r) => r.kind !== 'cash').length}`, 'text-muted')}
      </div>
    )),
    card('sectors', tl('Sectors'), (() => {
      const cnBuckets = Object.entries(industries).reduce((acc, [sym, label]) => {
        const b = acc.find((x) => x.name === label)
        if (b) b.symbols.push(sym); else acc.push({ name: label, symbols: [sym] })
        return acc
      }, [])
      const { entries, total: totalV, unmappedShare } = sectorSplit(priced, [...BUCKETS, ...cnBuckets])
      // the buckets only know US large-caps: a book that mostly files under
      // Other learns nothing from this card, so it steps aside for Markets
      if (unmappedShare > 0.7) return null
      const top = entries.slice(0, 5)
      const maxS = top[0]?.[1] || 1
      return (
        <div class="flex flex-col gap-1">
          {top.map(([name, v]) => (
            <div key={name} class="flex items-center gap-2 font-mono text-[10px]">
              <span class="w-20 shrink-0 truncate font-anth text-ink-2">{tl(name)}</span>
              <span class="h-2 rounded-sm bg-accent-2/50" style={{ width: `${(v / maxS) * 100}%`, minWidth: '2px' }} />
              <span class="ml-auto text-muted">{fmtPctPlain((v / totalV) * 100)}</span>
            </div>
          ))}
        </div>
      )
    })()),
    // The sector buckets only know US large-caps, so a Hong Kong / mainland
    // book files itself under "Other" and learns nothing. Where the names are
    // listed is the split that book really has.
    // where the book is listed, and how each market did for it today
    card('venues', tl('Markets'), (() => {
      const venues = venueDayBreakdown(priced).slice(0, 6)
      const maxV = venues[0]?.value || 1
      return (
        <div class="flex flex-col gap-1">
          {venues.map((v) => (
            <div key={v.venue} class="grid grid-cols-[3.5rem_1fr_auto] items-center gap-x-2 font-mono text-[10px]">
              <span class="truncate font-anth text-ink-2">{tl(VENUE_SHORT[v.venue] || v.venue)}</span>
              <span class="flex items-center gap-2 min-w-0">
                <span class="h-2 rounded-sm bg-accent/45" style={{ width: `${(v.value / maxV) * 60}%`, minWidth: '2px' }} />
                <span class="text-muted">{fmtPctPlain(v.weightPct)}</span>
              </span>
              <span class={`text-right whitespace-nowrap ${v.dayPct == null ? 'text-muted' : v.dayPct >= 0 ? 'text-up' : 'text-down'}`}>
                {v.dayPct == null ? '—' : signedGlance(v.dayPnl, ccy)}
                {v.dayPct != null && <span class="block text-[9px] font-normal">{fmtPct(v.dayPct)}</span>}
              </span>
            </div>
          ))}
        </div>
      )
    })()),
    // each currency quoted in itself (a CNY line in HK$ is a conversion, not a
    // holding), with the book's own currency summing it up underneath
    card('currency', tl('Currency mix'), (() => {
      const entries = [...mix.entries()].sort((a, b) => b[1] - a[1])
      const color = (c, i) => CCY_RING[c] || RING[(i + 4) % RING.length]
      return (
        <div class="flex items-center gap-3">
          <Donut slices={entries.map(([c, v], i) => ({ label: c, value: v, color: color(c, i) }))} centre={String(entries.length)} centreSub={tl('ccy')} />
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            {entries.map(([c, v], i) => {
              const native = convertCcy(v, ccy, c, rates)
              return (
                <div key={c} class="flex items-baseline justify-between gap-2 font-mono text-[10.5px]">
                  <span class="flex items-center gap-1.5 font-anth text-ink-2">
                    <span class="inline-block h-2 w-2 rounded-sm" style={{ background: color(c, i) }} />
                    {ccyFlag(c) && <img src={ccyFlag(c)} alt="" class="h-[9px] w-3 rounded-[1px] object-cover" />}
                    {c}
                  </span>
                  <span class="text-ink whitespace-nowrap">{native != null ? fmtCcy(native, c, 0) : glance(v, ccy)}<span class="text-muted text-[9.5px]"> · {fmtPctPlain((v / mixTotal) * 100)}</span></span>
                </div>
              )
            })}
            <div class="mt-0.5 flex items-baseline justify-between gap-2 border-t border-line-2 pt-1 font-mono text-[10.5px]">
              <span class="font-anth text-muted">{tl('Total')} ({ccy})</span>
              <span class="font-semibold text-ink whitespace-nowrap">{fmtCcy(mixTotal, ccy, 0)}</span>
            </div>
          </div>
        </div>
      )
    })()),
    card('cash', tl('Cash & deployment'), (
      <div class="flex flex-col gap-1">
        <div class="flex h-2.5 w-full overflow-hidden rounded-sm bg-surface-3">
          <span class="bg-accent/60" style={{ width: `${cs.total > 0 ? (cs.invested / cs.total) * 100 : 0}%` }} />
        </div>
        {stat(tl('Invested'), glance(cs.invested, ccy))}
        {stat(tl('Cash'), glance(cs.cash, ccy), cs.cash < 0 ? 'text-down' : 'text-ink')}
        {stat(tl('Cash weight'), cs.cashPct != null ? fmtPctPlain(cs.cashPct) : '—')}
      </div>
    )),
    // the book's own value line, one mark per day the page saw it priced
    card('trend', tl('Trend'), (() => {
      const marks = (portfolio.snapshots || []).filter((m) => m.c === ccy)
      if (!marks.length) return null
      if (marks.length < 2) {
        return (
          <div class="flex flex-col gap-1">
            {stat(tl('first mark'), `${marks[0].d.slice(5).replace('-', '/')} ${glance(marks[0].v, ccy)}`)}
            {stat(tl('marks'), '1', 'text-muted')}
          </div>
        )
      }
      const first = marks[0]; const last = marks[marks.length - 1]
      const lo = marks.reduce((m, x) => (x.v < m.v ? x : m), first)
      const hi = marks.reduce((m, x) => (x.v > m.v ? x : m), first)
      return (
        <div class="flex flex-col gap-1">
          <MiniLine marks={marks} ccy={ccy} />
          {stat(`${tl('since')} ${first.d.slice(5).replace('-', '/')}`, `${signedGlance(last.v - first.v, ccy)} (${fmtPct(((last.v - first.v) / first.v) * 100)})`, pnlCls(last.v - first.v))}
          {stat(tl('High'), `${hi.d.slice(5).replace('-', '/')} ${glance(hi.v, ccy)}`)}
          {stat(tl('Low'), `${lo.d.slice(5).replace('-', '/')} ${glance(lo.v, ccy)}`)}
        </div>
      )
    })()),
    // every position's open P&L as a diverging bar around zero — which names
    // are carrying the book and which are dragging it
    card('pnlmap', tl('P&L map'), (() => {
      const withPnl = priced.filter((r) => r.kind !== 'cash' && r.unrealDisplay != null)
        .sort((a, b) => Math.abs(b.unrealDisplay) - Math.abs(a.unrealDisplay)).slice(0, 6)
      if (!withPnl.length) return null
      const maxA = Math.max(...withPnl.map((r) => Math.abs(r.unrealDisplay))) || 1
      return (
        <div class="flex flex-col gap-1">
          {withPnl.map((r) => (
            <div key={r.symbol} class="grid grid-cols-[3.5rem_1fr_auto] items-center gap-x-2 font-mono text-[10px]">
              <span class="truncate font-bold text-ink-2">{r.symbol}</span>
              <span class="relative h-2 rounded-sm bg-surface-3 overflow-hidden">
                <span class={`absolute top-0 h-2 ${r.unrealDisplay >= 0 ? 'bg-up/60 left-1/2' : 'bg-down/60 right-1/2'}`} style={{ width: `${(Math.abs(r.unrealDisplay) / maxA) * 50}%` }} />
                <span class="absolute left-1/2 top-0 h-2 w-px bg-line" />
              </span>
              <span class={`text-right whitespace-nowrap ${pnlCls(r.unrealDisplay)}`}>{signedGlance(r.unrealDisplay, ccy)}</span>
            </div>
          ))}
        </div>
      )
    })()),
  ].filter(Boolean)
  const shown = slot === 'top' ? cards.filter((c) => TOP_CARDS.includes(c.key))
    : slot === 'rest' ? cards.filter((c) => !TOP_CARDS.includes(c.key)) : cards
  if (slot === 'top') {
    return shown.length > 0
      ? <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{shown}</div>
      : null
  }

  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-anth text-[9px] uppercase tracking-[.14em] text-muted">{tl('Analytics')}</span>
        <button type="button" onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          class="rounded-md border border-line-2 px-2 py-0.5 font-anth text-[10px] text-muted transition-colors hover:border-accent/40 hover:text-accent">
          {tl(editing ? 'done' : 'choose cards')}
        </button>
        {hidden.length > 0 && !editing && (
          <span class="font-anth text-[9.5px] text-muted">
            {tl('{n} hidden').replace('{n}', hidden.length)}
          </span>
        )}
      </div>
      {editing && (
        <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 py-2">
          {BOOK_CARDS.map((c) => {
            const on = !hidden.includes(c.id)
            return (
              <button key={c.id} type="button" role="switch" aria-checked={on}
                onClick={() => toggleCard(c.id)}
                class={`rounded-md border px-2 py-1 font-anth text-[10.5px] transition-colors ${
                  on ? 'border-accent/45 bg-accent/10 text-accent'
                    : 'border-line-2 text-muted hover:border-line hover:text-ink-2'}`}>
                {on ? '✓ ' : ''}{tl(c.label)}
              </button>
            )
          })}
          <button type="button" onClick={resetCards}
            class="ml-auto rounded-md px-2 py-1 font-anth text-[10px] text-muted transition-colors hover:text-accent">
            {tl('show all')}
          </button>
        </div>
      )}
      {shown.length > 0 && (
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{shown}</div>
      )}
    </div>
  )
}

/** One control surface instead of three stacked cards (Jeff 2026-08-21).
 *  Adding a position, adding cash and sizing a trade are the same kind of
 *  act — they belong behind one set of tabs, not three headers competing for
 *  the same strip of screen. The tab strip carries the tactile treatment the
 *  design system reserves for controls; the form bodies stay flat. */
function BookTools({ portfolio, quotes, rates }) {
  const [tab, setTab] = useState('holding')
  useEffect(() => {
    const open = (event) => {
      if (event.detail === 'cash') {
        setTab('cash')
        requestAnimationFrame(() => document.getElementById('portfolio-cash-activity')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      }
    }
    window.addEventListener('portfolio-tool', open)
    return () => window.removeEventListener('portfolio-tool', open)
  }, [])
  const tabs = [
    { id: 'holding', label: tl('Add holding'), note: tl('Add or update a position') },
    { id: 'cash', label: tl('Cash activity'), note: tl('Reconcile deposits and withdrawals') },
    { id: 'sizing', label: tl('Sizing'), note: tl('Turn a target weight into shares') },
  ]
  const active = tabs.find((item) => item.id === tab)
  return (
    <section id="portfolio-cash-activity" class="overflow-hidden rounded-xl border border-line bg-surface-1">
      <div class="flex flex-col gap-2 border-b border-line bg-surface-2/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="font-anth text-[9px] font-semibold uppercase tracking-[.14em] text-ink-2">{tl('Book tools')}</div>
          <div class="truncate font-anth text-[9.5px] text-muted">{active.note}</div>
        </div>
        <div role="tablist" aria-label={tl('Portfolio tools')} class="flex min-w-0 gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((item, index) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id}
              aria-controls="portfolio-tool-panel" onClick={() => setTab(item.id)}
              class={`board-control inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-anth text-[10.5px] transition-colors ${
                tab === item.id
                  ? 'border border-accent/45 bg-accent/12 font-semibold text-accent'
                  : 'border border-transparent text-ink-2 hover:border-line-2 hover:text-ink'}`}>
              <span class={`font-mono text-[8px] ${tab === item.id ? 'text-accent/75' : 'text-muted/70'}`}>0{index + 1}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div id="portfolio-tool-panel" role="tabpanel" class="px-3 py-3">
        {tab === 'holding' && <AddHoldingForm portfolio={portfolio} />}
        {tab === 'cash' && <CashActivity portfolio={portfolio} rates={rates} />}
        {tab === 'sizing' && <SizingForm portfolio={portfolio} quotes={quotes} rates={rates} />}
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-surface-2/40 px-3 py-1.5 font-anth text-[9.5px] text-muted">
        <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span class="h-1.5 w-1.5 rounded-full bg-up/80" aria-hidden="true" />
          {tl('Saved automatically')}
        </span>
        <span class="flex flex-wrap items-center justify-end gap-x-2 tabular-nums">
          <span><b class="font-semibold text-ink-2">{portfolio.holdings.length}</b> {tl('holdings')}</span>
          <span class="text-line-2" aria-hidden="true">·</span>
          <span><b class="font-semibold text-ink-2">{(portfolio.cash || []).length}</b> {tl('cash accounts')}</span>
          <span class="rounded border border-line-2 px-1.5 py-px font-mono text-[9px] text-ink-2">{portfolio.ccy}</span>
        </span>
      </div>
    </section>
  )
}

function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  return Promise.reject(new Error('no clipboard'))
}

export const MyHoldings = (props) => <MyPortfolios {...props} view="holdings" />
export const MyNews = (props) => <MyPortfolios {...props} view="news" />
export const MyPerformance = (props) => <MyPortfolios {...props} view="performance" />
export const MyTrades = (props) => <MyPortfolios {...props} view="trades" />
export const MyEvents = (props) => <MyPortfolios {...props} view="events" />

/** Recently deleted books, one line, restorable for TRASH_DAYS. Renders
 *  nothing when the trash is empty — the usual case. */
function TrashRow({ items, onRestore }) {
  const [trash, setTrash] = useState(() => { purgeTrash(); return loadTrash() })
  useEffect(() => { setTrash(loadTrash()) }, [items])
  if (!trash.length) return null
  return (
    <div class="flex flex-wrap items-center gap-1.5 font-anth text-[11px] text-muted">
      <span>{tl('Recently deleted')}:</span>
      {trash.map((t) => (
        <button key={t.portfolio.id} type="button"
          onClick={() => { const p = restoreFromTrash(t.portfolio.id); if (p) onRestore(p.id) }}
          class="rounded-md border border-dashed border-line-2 px-2 py-0.5 text-ink-2 hover:border-accent/40 hover:text-accent">
          {t.portfolio.name} · {tl('Restore')}
        </button>
      ))}
    </div>
  )
}

export function MyPortfolios({ view = 'overview' } = {}) {
  const [items, setItems] = useState(loadPortfolios)
  useEffect(() => onPortfoliosChange((next) => setItems([...next])), [])
  const [selId, setSelId] = useState(() => {
    try { return localStorage.getItem('my_portfolio_sel_v1') || '' } catch { return '' }
  })
  const selected = items.find((p) => p.id === selId) || items[0] || null
  const select = (id) => {
    setSelId(id)
    try { localStorage.setItem('my_portfolio_sel_v1', id) } catch { /* best-effort */ }
  }
  const [creating, setCreating] = useState(items.length === 0)

  // Follow the holdings plus every FX pair the mix needs. The pair set can
  // grow once quotes land (a quote's own currency wins over the suffix
  // guess), which just re-follows with the richer list next render.
  const symbols = selected ? selected.holdings.map((h) => h.symbol) : []
  const preQuotes = useQuotes(symbols)
  const quotes = {}
  for (const s of symbols) {
    const q = preQuotes[s]?.quote
    if (q) quotes[s] = q
  }
  const ccys = useMemo(() => {
    const set = new Set(selected ? [selected.ccy] : [])
    for (const h of selected?.holdings || []) set.add(holdingCurrency(h.symbol, quotes[h.symbol]))
    for (const c of selected?.cash || []) set.add(c.ccy)
    return [...set]
  }, [selected, preQuotes])
  const fxLive = useQuotes(fxSymbolsFor(ccys))
  const rates = ratesFromQuotes(fxLive)
  // the indices a HK / mainland book is measured against, for the strip and the cards
  const bench = useQuotes(BENCH.map((b) => b.symbol))

  const rename = () => {
    if (!selected) return
    const name = prompt(tl('Rename portfolio'), selected.name)
    if (name != null) renamePortfolio(selected.id, name)
  }
  const remove = () => {
    if (!selected) return
    if (confirm(`${tl('Delete portfolio')} "${selected.name}"?`)) {
      deletePortfolio(selected.id)
      select('')
    }
  }

  // the actions live on the section heading row, the chips stay here
  const btn = 'h-7 rounded-md border border-line-2 bg-surface-2 px-2.5 max-sm:px-2 font-anth text-[11px] text-ink-2 transition-colors hover:border-line hover:text-ink whitespace-nowrap'
  useEffect(() => {
    setHeaderActions(
      <>
        <button type="button" onClick={() => setCreating((v) => !v)} class={`${btn} border-dashed text-muted hover:border-accent/40 hover:text-accent`} aria-label={tl('New portfolio')}>+<span class="max-sm:hidden"> {tl('New portfolio')}</span></button>
        {selected && (
          <>
            <span class="ml-1 h-4 w-px bg-line-2 max-sm:hidden" />
            <CcySelect value={selected.ccy} onChange={(c) => setPortfolioCcy(selected.id, c)} />
            <button type="button" onClick={rename} class={btn}>{tl('Rename')}</button>
            <button type="button" onClick={remove} class={`${btn} border-down/45 bg-down/10 text-down hover:border-down/70 hover:bg-down/15`}>{tl('Delete')}</button>
          </>
        )}
      </>,
    )
  }, [selected?.id, selected?.ccy, selected?.name, items.length])
  useEffect(() => () => setHeaderActions(null), [])

  return (
    <div class="flex flex-col gap-2.5">
      <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap">
        {items.map((p) => (
          <button key={p.id} type="button" onClick={() => select(p.id)}
            class={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 font-anth text-[11px] transition-colors ${
              selected?.id === p.id
                ? 'border-accent/50 bg-accent/10 text-accent font-semibold'
                : 'border-line-2 bg-surface-2 text-ink-2 hover:border-line hover:text-ink'}`}>
            {p.name} <span class="ml-1 text-[9px] uppercase opacity-70">{p.ccy}</span>
          </button>
        ))}
      </div>

      {creating && <NewPortfolioForm onDone={(id) => { select(id); setCreating(false) }} />}
      <TrashRow items={items} onRestore={select} />

      {selected ? (
        <>
          {/* overview = everything, as before; holdings = the table alone at
              full width; news = the per-ticker feed (Jeff 2026-08-22) */}
          {view === 'overview' && <SummaryStrip portfolio={selected} quotes={quotes} rates={rates} ccys={ccys} fxLive={fxLive} bench={bench} />}
          {view === 'overview' && <BookAnalysis portfolio={selected} quotes={quotes} rates={rates} fxLive={fxLive} bench={bench} slot="top" />}
          {(view === 'overview' || view === 'holdings') && <Holdings portfolio={selected} quotes={quotes} rates={rates} />}
          {(view === 'overview' || view === 'holdings') && <BookTools portfolio={selected} quotes={quotes} rates={rates} />}
          {view === 'overview' && <BookAnalysis portfolio={selected} quotes={quotes} rates={rates} fxLive={fxLive} bench={bench} slot="rest" />}
          {view === 'news' && <BookNews portfolio={selected} quotes={quotes} />}
          {view === 'performance' && <BookPerformance portfolio={selected} quotes={quotes} rates={rates} />}
          {view === 'trades' && <BookTrades portfolio={selected} quotes={quotes} />}
          {view === 'events' && <BookEvents portfolio={selected} quotes={quotes} />}
        </>
      ) : (
        <div class="rounded-xl border border-line bg-surface-1 px-4 py-6 text-center font-anth text-[11px] text-muted">
          {tl('No portfolios yet — create one above. Everything you enter stays in this browser.')}
        </div>
      )}
    </div>
  )
}
