/** "My Portfolios" — Koyfin-style hand-built books (Jeff 2026-08-20).
 *
 *  Any number of portfolios, each with a display currency fixed at creation;
 *  holdings across USD/CAD/HKD/CNY markets valued live, converted through
 *  live FX pairs. Everything the user types lives in localStorage only —
 *  the site is static and nothing entered here leaves the browser.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  createPublicWatchlistSync, connectPublicWatchlistSync, disconnectPublicWatchlistSync,
  getWatchlistCapability,
} from '../lib/cloudsave.js'
import { onPortfolioSyncStatus } from '../lib/portfolioSync.js'
import { wireServiceUrl } from '../lib/wire.js'
import { fixedSyncCapability } from '../lib/watchlistSync.js'
import { useQuotes } from '../hooks.js'
import { SymbolSuggest } from '../components/SymbolSuggest.jsx'
import { FlashPrice } from '../components/Fig.jsx'
import { fmtPrice, fmtPct, fmtPctPlain } from '../lib/format.js'
import { tl } from '../lib/i18n.js'
import { PORTFOLIO_CCYS, fmtCcy, fxSymbolsFor, holdingCurrency, ratesFromQuotes } from '../lib/fx.js'
import {
  MAX_MY_HOLDINGS, createPortfolio, deletePortfolio, loadPortfolios,
  onPortfoliosChange, removeHolding, renamePortfolio, setHolding, portfolioValues,
} from '../lib/myPortfolios.js'

const pnlCls = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')
const signed = (v, ccy) => (v == null ? '—' : `${v >= 0 ? '+' : '-'}${fmtCcy(Math.abs(v), ccy)}`)

function CcySelect({ value, onChange, id }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.currentTarget.value)}
      class="rounded border border-line-2 bg-surface-2 px-2 py-1 font-anth text-[11px] text-ink outline-none focus:border-accent/60">
      {PORTFOLIO_CCYS.map((c) => <option key={c} value={c}>{c}</option>)}
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
        placeholder={tl('Portfolio name')} aria-label={tl('Portfolio name')}
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

function AddHoldingRow({ portfolio }) {
  const [sym, setSym] = useState('')
  const [picked, setPicked] = useState(null)     // {symbol, name} from the dropdown
  const [shares, setShares] = useState('')
  const [cost, setCost] = useState('')
  const sharesRef = useRef(null)
  const full = portfolio.holdings.length >= MAX_MY_HOLDINGS
  const submit = (e) => {
    e.preventDefault()
    const ok = setHolding(portfolio.id, sym, Number(shares), cost === '' ? undefined : Number(cost))
    if (ok) { setSym(''); setPicked(null); setShares(''); setCost('') }
  }
  const onPick = (h) => {
    setSym(h.symbol)
    setPicked(h)
    sharesRef.current?.focus()
  }
  const box = 'rounded border border-line-2 bg-surface-2 px-2 py-1.5 font-mono text-[12px] text-ink placeholder:text-muted outline-none focus:border-accent/60'
  return (
    <form onSubmit={submit} class="border-t border-line bg-surface-2/50 px-3 py-2">
      <div class="flex flex-wrap items-center gap-2">
        <SymbolSuggest value={sym} placeholder={tl('Symbol or company')}
          ariaLabel={tl('Symbol or company')}
          onInput={(e) => { setSym(e.currentTarget.value); setPicked(null) }}
          onPick={onPick} dropUp={false} inputClass={`${box} w-40 uppercase`} />
        <input ref={sharesRef} value={shares} onInput={(e) => setShares(e.currentTarget.value)}
          placeholder={tl('Shares')} aria-label={tl('Shares')} inputMode="decimal"
          class={`${box} w-24`} />
        <input value={cost} onInput={(e) => setCost(e.currentTarget.value)}
          placeholder={tl('Avg cost (opt.)')} aria-label={tl('Avg cost (opt.)')}
          inputMode="decimal" class={`${box} w-32`} />
        <button type="submit" disabled={full || !sym.trim() || !(Number(shares) > 0)}
          class="rounded border border-accent/40 bg-accent/10 px-3 py-1.5 font-anth text-[12px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-40">
          {tl('Add')}
        </button>
        {full && <span class="font-anth text-[10px] text-muted">{tl('List is full')}</span>}
      </div>
      {picked && (
        <div class="mt-1 font-anth text-[10px] text-muted">
          {picked.symbol} · {picked.name}
        </div>
      )}
      <div class="mt-1 font-anth text-[9.5px] text-muted">
        {tl('Type a ticker or a company name and pick from the list.')}
      </div>
    </form>
  )
}

function FxFootnote({ ccys, rates, displayCcy }) {
  const used = ccys.filter((c) => c !== 'USD')
  if (!used.length && displayCcy === 'USD') return null
  return (
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 font-anth text-[10px] text-muted">
      <span class="uppercase tracking-wider text-[9px]">{tl('FX (live)')}</span>
      {[...new Set([...used, displayCcy])].filter((c) => c !== 'USD').map((c) => (
        <span key={c}>
          {fmtCcy(1, c)} = {rates[c] != null ? fmtCcy(rates[c], 'USD', 4) : '…'}
        </span>
      ))}
    </div>
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
      inputMode="decimal" aria-label={`${tl('Shares')} ${row.symbol}`}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
      class="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-ink-2 outline-none transition-colors hover:border-line-2 focus:border-accent/60 focus:bg-surface-2" />
  )
}

function Holdings({ portfolio, quotes, rates }) {
  const { rows, missing, total } = portfolioValues(portfolio.holdings, quotes, rates, portfolio.ccy)
  const ccy = portfolio.ccy
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto">
      <table class="w-full border-collapse font-mono text-[11px]">
        <thead>
          {/* nowrap: 股数 stacked into two lines on a phone (Jeff 2026-08-20) */}
          <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider whitespace-nowrap">
            <th class="px-3 py-2 text-left">{tl('Sym')}</th>
            <th class="px-2 py-2 text-left">{tl('Ccy')}</th>
            <th class="px-2 py-2 text-right">{tl('Shares')}</th>
            <th class="px-2 py-2 text-right">{tl('Avg cost')}</th>
            <th class="px-2 py-2 text-right">{tl('Price')}</th>
            <th class="px-2 py-2 text-right">{tl('Day')}</th>
            <th class="px-2 py-2 text-right">{tl('Value')} ({ccy})</th>
            <th class="px-2 py-2 text-right">{tl('Weight')}</th>
            <th class="px-2 py-2 text-right">{tl('Unreal P&L')}</th>
            <th class="px-2 py-2" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} class="border-t border-line hover:bg-surface-3 whitespace-nowrap">
              <td class="px-3 py-[3px] cursor-pointer"
                onClick={() => (location.hash = `#/research/${r.symbol.toLowerCase()}`)}>
                <span class="font-bold text-accent">{r.symbol}</span>
                {quotes[r.symbol]?.name && (
                  <span class="block max-w-[9rem] truncate font-anth text-[9px] leading-tight text-muted">
                    {quotes[r.symbol].name}
                  </span>
                )}
              </td>
              <td class="px-2 py-[3px] font-anth text-[10px] text-muted">{r.ccy}</td>
              <td class="px-2 py-[3px] text-right"><SharesCell portfolio={portfolio} row={r} /></td>
              <td class="px-2 py-[3px] text-right text-muted text-[10.5px]">{r.cost != null ? fmtPrice(r.cost) : '—'}</td>
              <td class="px-2 py-[3px] text-right text-ink-2 font-medium">
                {r.price != null ? <FlashPrice price={r.price} fmt={fmtPrice} /> : '—'}
              </td>
              <td class={`px-2 py-[3px] text-right font-medium ${pnlCls(r.dayPct)}`}>
                {r.dayPct != null ? fmtPct(r.dayPct) : '—'}
              </td>
              <td class="px-2 py-[3px] text-right text-ink font-semibold text-[12px]">
                {r.valueDisplay != null ? fmtCcy(r.valueDisplay, ccy) : '—'}
              </td>
              <td class="px-2 py-[3px] text-right text-ink-2 font-medium">
                {r.weightPct != null ? fmtPctPlain(r.weightPct) : '—'}
              </td>
              <td class={`px-2 py-[3px] text-right font-semibold ${pnlCls(r.unrealDisplay)}`}>
                {r.unrealDisplay != null ? signed(r.unrealDisplay, ccy) : '—'}
              </td>
              <td class="px-2 py-[3px] text-right">
                <button type="button" title={tl('Remove')} aria-label={`${tl('Remove')} ${r.symbol}`}
                  onClick={() => removeHolding(portfolio.id, r.symbol)}
                  class="rounded px-1.5 py-1 text-muted transition-colors hover:text-down">×</button>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr class="border-t border-line">
              <td colSpan={10} class="px-3 py-4 text-center font-anth text-[11px] text-muted">
                {tl('No holdings yet — add a symbol below.')}
              </td>
            </tr>
          )}
          {rows.length > 0 && (
            <tr class="border-t border-line-2 bg-surface-2 font-bold whitespace-nowrap">
              <td class="px-3 py-[6px] text-ink" colSpan={6}>{tl('Total')}</td>
              <td class="px-2 py-[6px] text-right text-ink text-[12.5px]">{fmtCcy(total.value, ccy)}</td>
              <td class="px-2 py-[6px] text-right text-ink-2">{total.value != null ? '100%' : '—'}</td>
              <td class={`px-2 py-[6px] text-right text-[12.5px] ${pnlCls(total.unrealPnl)}`}>
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
      <AddHoldingRow portfolio={portfolio} />
    </section>
  )
}

function SummaryStrip({ portfolio, quotes, rates }) {
  const { total } = portfolioValues(portfolio.holdings, quotes, rates, portfolio.ccy)
  const chip = (label, body) => (
    <div class="rounded-lg border border-line bg-surface-1 px-3 py-2">
      <div class="font-anth text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div class="font-mono text-[15px] font-semibold">{body}</div>
    </div>
  )
  return (
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:max-w-xl">
      {chip(`${tl('Value')} (${portfolio.ccy})`, <span class="text-ink">{fmtCcy(total.value, portfolio.ccy)}</span>)}
      {chip(tl('Day P&L'), (
        <span class={pnlCls(total.dayPnl)}>
          {signed(total.dayPnl, portfolio.ccy)}
          {total.dayPct != null && <span class="text-[11px] font-normal"> ({fmtPct(total.dayPct)})</span>}
        </span>
      ))}
      {chip(tl('Unreal P&L'), <span class={pnlCls(total.unrealPnl)}>{total.unrealPnl != null ? signed(total.unrealPnl, portfolio.ccy) : '—'}</span>)}
    </div>
  )
}

function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  return Promise.reject(new Error('no clipboard'))
}

/** The same sync code as the watchlist sync — one secret is "your data".
 *  Only the public build shows this; the private build saves through the
 *  wire automatically. */
function SyncControls() {
  const [capability, setCapability] = useState(() => getWatchlistCapability())
  const [entry, setEntry] = useState('')
  const [copied, setCopied] = useState(false)
  const [bad, setBad] = useState(false)
  const [st, setSt] = useState({ state: 'off' })
  useEffect(() => onPortfolioSyncStatus(setSt), [])
  if (wireServiceUrl()) return null

  // family build: the store is baked in, saving is just a fact — show the
  // one reassuring chip and none of the code management
  if (fixedSyncCapability()) {
    return (
      <div class="flex items-center gap-2 px-1 font-anth text-[10px] text-muted">
        <span class={`rounded border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider ${
          st.state === 'synced' ? 'border-up/40 text-up'
          : st.state === 'error' ? 'border-down/40 text-down' : 'border-line text-muted'}`}>
          {st.state === 'synced' ? tl('cloud saved') : st.state === 'error' ? tl('cloud offline') : tl('saving…')}
        </span>
        {tl('Everything here saves automatically and shows up on any device that opens this page.')}
      </div>
    )
  }

  const enable = () => setCapability(createPublicWatchlistSync())
  const connect = (e) => {
    e.preventDefault()
    if (!connectPublicWatchlistSync(entry)) { setBad(true); return }
    setBad(false)
    setEntry('')
    setCapability(getWatchlistCapability())
  }
  const disconnect = () => {
    if (!confirm(tl('Turn off cloud sync on this device?'))) return
    disconnectPublicWatchlistSync()
    setCapability('')
  }
  const copy = () => copyText(capability).then(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }).catch(() => {})

  return (
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-surface-1/70 px-3 py-2 font-anth text-[10px]">
      {capability ? (
        <>
          <span class={`rounded border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider ${
            st.state === 'synced' ? 'border-up/40 text-up'
            : st.state === 'syncing' ? 'border-line text-muted'
            : st.state === 'error' ? 'border-down/40 text-down' : 'border-line text-muted'}`}>
            {st.state === 'synced' ? tl('cloud saved') : st.state === 'syncing' ? tl('saving…')
              : st.state === 'error' ? tl('cloud offline') : tl('cloud sync')}
          </span>
          <span class="text-muted">{tl('Saved to the cloud — use the same code on another device to see the same portfolios.')}</span>
          <span class="ml-auto flex items-center gap-1.5">
            <span class="rounded border border-line bg-black/30 px-2 py-0.5 font-mono text-[9px] text-muted">•••• {capability.slice(-4)}</span>
            <button type="button" onClick={copy}
              class="rounded border border-accent/50 bg-accent-soft px-2 py-1 font-semibold text-accent hover:bg-accent/15">
              {tl(copied ? 'copied code ✓' : 'copy code')}
            </button>
            <button type="button" onClick={disconnect} class="px-1 text-[9px] text-muted hover:text-down">{tl('disconnect')}</button>
          </span>
        </>
      ) : (
        <>
          <span class="text-muted">{tl('Portfolios live only in this browser right now — turn on cloud sync so they survive and follow you.')}</span>
          <span class="ml-auto flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={enable}
              class="whitespace-nowrap rounded border border-accent/60 bg-accent-soft px-2.5 py-1 font-semibold text-accent hover:bg-accent/15">
              {tl('enable sync')}
            </button>
            <span class="text-[9px] text-muted">{tl('or')}</span>
            <form onSubmit={connect} class="flex items-center gap-1">
              <input value={entry} onInput={(e) => { setEntry(e.currentTarget.value); setBad(false) }}
                aria-label={tl('sync code')} placeholder={tl('sync code')} spellcheck={false}
                class="w-40 rounded border border-line bg-black/30 px-2 py-1 font-mono text-[9px] text-ink outline-none focus:border-accent" />
              <button class="rounded border border-line px-2 py-1 text-[9px] font-semibold text-ink-2 hover:border-accent hover:text-accent">
                {tl('connect')}
              </button>
            </form>
            {bad && <span class="text-[9px] text-down">{tl('not a sync code')}</span>}
          </span>
        </>
      )}
    </div>
  )
}

export function MyPortfolios() {
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
    return [...set]
  }, [selected, preQuotes])
  const fxLive = useQuotes(fxSymbolsFor(ccys))
  const rates = ratesFromQuotes(fxLive)

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

  return (
    <div class="flex flex-col gap-2.5">
      <div class="flex flex-wrap items-center gap-1.5">
        {items.map((p) => (
          <button key={p.id} type="button" onClick={() => select(p.id)}
            class={`rounded-md border px-2.5 py-1 font-anth text-[11px] transition-colors ${
              selected?.id === p.id
                ? 'border-accent/50 bg-accent/10 text-accent font-semibold'
                : 'border-line-2 bg-surface-2 text-ink-2 hover:border-line hover:text-ink'}`}>
            {p.name} <span class="ml-1 text-[9px] uppercase opacity-70">{p.ccy}</span>
          </button>
        ))}
        <button type="button" onClick={() => setCreating((v) => !v)}
          class="rounded-md border border-dashed border-line-2 px-2.5 py-1 font-anth text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-accent">
          + {tl('New portfolio')}
        </button>
        {selected && (
          <span class="ml-auto flex items-center gap-1">
            <button type="button" onClick={rename} title={tl('Rename portfolio')}
              class="rounded border border-line-2 px-2 py-0.5 font-anth text-[10px] text-muted transition-colors hover:text-ink">{tl('Rename')}</button>
            <button type="button" onClick={remove} title={tl('Delete portfolio')}
              class="rounded border border-line-2 px-2 py-0.5 font-anth text-[10px] text-muted transition-colors hover:border-down/50 hover:text-down">{tl('Delete')}</button>
          </span>
        )}
      </div>

      {creating && <NewPortfolioForm onDone={(id) => { select(id); setCreating(false) }} />}

      {selected ? (
        <>
          <SummaryStrip portfolio={selected} quotes={quotes} rates={rates} />
          <Holdings portfolio={selected} quotes={quotes} rates={rates} />
          <FxFootnote ccys={ccys} rates={rates} displayCcy={selected.ccy} />
        </>
      ) : (
        <div class="rounded-xl border border-line bg-surface-1 px-4 py-6 text-center font-anth text-[11px] text-muted">
          {tl('No portfolios yet — create one above. Everything you enter stays in this browser.')}
        </div>
      )}
      <SyncControls />
    </div>
  )
}
