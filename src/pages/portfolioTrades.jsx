import { useEffect, useMemo, useState } from 'preact/hooks'
import { addTxn, importTxns, removeTxn } from '../lib/myPortfolios.js'
import { positionsFromTxns, sortTxns } from '../lib/lots.js'
import { parseTradesCsv } from '../lib/tradeCsv.js'
import { offLot, positionAfter, tradeCcy, tradeEstimate } from '../lib/tradeTicket.js'
import { normalizeVenueCode } from '../lib/venueCodes.js'
import { useQuotes } from '../hooks.js'
import { fmtCcy } from '../lib/fx.js'
import { fmtPct, fmtPrice } from '../lib/format.js'
import { getLocale, tl } from '../lib/i18n.js'
import { loadZhTable, onZhTable, zhName } from '../lib/zhNames.js'
import { SymbolSuggest } from '../components/SymbolSuggest.jsx'

// 交易 — the ledger behind a hand-built book (Jeff 2026-08-22: lots instead
// of holdings). One trade at a time, or a broker export pasted in; the
// holdings rows for traded symbols are derived from here, never typed.

const box = 'rounded border border-line bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent/60'

export function AddTradeForm({ portfolio }) {
  const [sym, setSym] = useState('')
  const [picked, setPicked] = useState(null)
  const [side, setSide] = useState('buy')
  const [qty, setQty] = useState('')
  const [px, setPx] = useState('')
  const [fee, setFee] = useState('')
  const [d, setD] = useState(() => new Date().toISOString().slice(0, 10))
  const [tried, setTried] = useState(false)
  const typed = sym.trim().toUpperCase()
  const symbol = picked && String(picked.symbol).toUpperCase() === typed ? picked.symbol : normalizeVenueCode(typed)
  const live = useQuotes(symbol ? [symbol] : [])[symbol]?.quote
  const zh = getLocale() === 'zh'
  const ccy = tradeCcy(symbol, live)
  const est = tradeEstimate({ side, qty, px, fee })
  const pos = positionAfter(portfolio.holdings, symbol, { side, qty, px, fee })
  const ready = !!symbol && Number(qty) > 0 && String(px).trim() !== '' && Number(px) >= 0 && !!d
  const missing = [!symbol && tl('Symbol'), !(Number(qty) > 0) && tl('Qty'),
    !(String(px).trim() !== '' && Number(px) >= 0) && tl('Price')].filter(Boolean)
  const submit = (e) => {
    e.preventDefault()
    if (!ready) { setTried(true); return }
    const ok = addTxn(portfolio.id, { d, sym: symbol, side, qty: Number(qty), px: Number(px), fee: Number(fee) || 0 })
    if (ok) { setSym(''); setPicked(null); setQty(''); setPx(''); setFee(''); setTried(false) }
  }
  const buy = side === 'buy'
  const field = (label, v, set, opts = {}) => (
    <label class="flex flex-col gap-0.5 min-w-0">
      <span class="font-anth text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <input value={v} onInput={(e) => set(e.currentTarget.value)} inputMode="decimal" aria-label={label}
        data-1p-ignore data-lpignore="true" class={`${box} w-full text-right`} placeholder={opts.placeholder || ''} />
    </label>
  )
  const crow = (label, value, cls = 'text-ink') => (
    <div class="flex items-baseline justify-between gap-3">
      <span class="font-anth text-[9.5px] text-muted">{label}</span>
      <span class={`font-mono text-[11.5px] tabular-nums ${cls}`}>{value}</span>
    </div>
  )
  return (
    <form onSubmit={submit} class={`grid gap-3 sm:grid-cols-[1fr_15rem] rounded-lg border p-3 ${buy ? 'border-up/25' : 'border-down/25'}`}>
      <div class="flex flex-col gap-2.5 min-w-0">
        <div class="flex flex-wrap items-end gap-2">
          <span class="flex h-[28px] items-center gap-0.5 rounded border border-line bg-surface-2 px-0.5 self-end" role="radiogroup" aria-label={tl('Side')}>
            {['buy', 'sell'].map((x) => (
              <button key={x} type="button" role="radio" aria-checked={side === x} onClick={() => setSide(x)}
                class={`px-3 py-0.5 font-anth text-[11px] rounded ${side === x ? (x === 'buy' ? 'bg-up text-black font-bold' : 'bg-down text-black font-bold') : 'text-muted hover:text-ink'}`}>
                {tl(x === 'buy' ? 'Buy' : 'Sell')}
              </button>
            ))}
          </span>
          <label class="flex flex-1 min-w-[10rem] flex-col gap-0.5">
            <span class="font-anth text-[9px] uppercase tracking-wider text-muted">{tl('Symbol')}</span>
            <SymbolSuggest value={sym} placeholder={tl('Symbol or company')} ariaLabel={tl('Symbol')} dropUp={false}
              onInput={(e) => { setSym(e.currentTarget.value); setPicked(null) }} onPick={(h) => { setSym(h.symbol); setPicked(h) }}
              inputClass={`${box} w-full`} />
          </label>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {field(tl('Qty'), qty, setQty)}
          {field(tl('Price'), px, setPx, { placeholder: live?.price != null ? fmtPrice(live.price) : '' })}
          {field(tl('Fee'), fee, setFee)}
          <label class="flex flex-col gap-0.5 min-w-0">
            <span class="font-anth text-[9px] uppercase tracking-wider text-muted">{tl('Date')}</span>
            <input type="date" value={d} onInput={(e) => setD(e.currentTarget.value)} aria-label={tl('Date')} class={`${box} w-full`} />
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="submit"
            class={`h-[28px] rounded px-4 font-anth text-[12px] font-bold transition-colors ${ready
              ? (buy ? 'bg-up text-black hover:opacity-90' : 'bg-down text-black hover:opacity-90')
              : 'border border-line-2 text-muted'}`}>
            {tl(buy ? 'Record buy' : 'Record sell')}{symbol ? ` · ${symbol}` : ''}
          </button>
          {tried && missing.length > 0 && (
            <span class="font-anth text-[10.5px] text-down">{tl('Still needed')}: {missing.join(' · ')}</span>
          )}
          {offLot(symbol, qty) && (
            <span class="font-anth text-[10.5px] text-muted">{tl('A-shares trade in lots of 100')}</span>
          )}
        </div>
      </div>
      {/* the broker half of the ticket: what it is, what it costs, what the
          position becomes — before the tap, like the 委托 panel he knows */}
      <div class={`flex flex-col justify-center gap-1.5 rounded-md border border-line bg-surface-2/50 px-3 py-2 ${symbol ? '' : 'opacity-50'}`}>
        {crow(tl('Name'), symbol ? ((zh && zhName(symbol)) || live?.name || '—') : '—', 'text-ink-2 font-anth text-[10.5px] truncate max-w-[10rem]')}
        {crow(tl('Live price'), live?.price != null ? (
          <button type="button" onClick={() => setPx(String(live.price))} title={tl('Use live price')}
            class="rounded border border-line-2 px-1.5 py-px font-mono text-[11px] text-ink hover:border-accent/40 hover:text-accent">
            {fmtPrice(live.price)}{live.pct != null && <span class={`ml-1.5 text-[10px] ${live.pct >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(live.pct)}</span>}
          </button>
        ) : '—')}
        {crow(tl('Est. amount'), est != null ? fmtCcy(est, ccy, 2) : '—', buy ? 'font-semibold text-up' : 'font-semibold text-down')}
        {crow(tl('Position after'), pos ? `${pos.before} → ${pos.after} ${tl('shares')}` : '—')}
        {pos?.avgAfter != null && crow(tl('Avg cost after'), fmtPrice(pos.avgAfter))}
      </div>
    </form>
  )
}

function ImportPanel({ portfolio }) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(null)
  const parsed = useMemo(() => (text.trim() ? parseTradesCsv(text) : null), [text])
  const onFile = (e) => {
    const f = e.currentTarget.files?.[0]
    if (!f) return
    f.text().then(setText).catch(() => {})
  }
  const commit = () => {
    if (!parsed?.rows.length) return
    const out = importTxns(portfolio.id, parsed.rows)
    setDone(out); setText('')
  }
  return (
    <div class="flex flex-col gap-2">
      <p class="font-anth text-[10.5px] text-muted">{tl('Paste a broker export (CSV) — 富途, 华泰, IBKR Flex, or any file with symbol / side / quantity / price / date columns.')}</p>
      <div class="flex flex-wrap items-center gap-2">
        <label class="cursor-pointer rounded border border-line-2 px-2 py-1 font-anth text-[10.5px] text-muted hover:text-ink">
          {tl('Choose file')}<input type="file" accept=".csv,.tsv,.txt,text/csv" class="hidden" onChange={onFile} />
        </label>
        {text && <button type="button" onClick={() => { setText(''); setDone(null) }} class="font-anth text-[10.5px] text-muted hover:text-ink">{tl('Clear')}</button>}
        {done && <span class="font-anth text-[10.5px] text-up">+{done.added} · {tl('{n} rows could not be read').replace('{n}', done.rejected)}</span>}
      </div>
      <textarea value={text} onInput={(e) => { setText(e.currentTarget.value); setDone(null) }} rows={4} spellcheck={false}
        placeholder="代码,方向,成交数量,成交价格,成交时间&#10;HK.00700,买入,100,457.00,2026-08-20"
        class="w-full resize-y rounded border border-line bg-surface-0 px-2 py-1.5 font-mono text-[11px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/60" />
      {parsed && (
        <div class="rounded-lg border border-line bg-surface-2/60 px-2.5 py-2">
          <div class="flex flex-wrap items-center gap-3 font-anth text-[10.5px]">
            <span class="text-muted">{tl('Preview')} · {parsed.rows.length}</span>
            {parsed.errors.length > 0 && <span class="text-down">{tl('{n} rows could not be read').replace('{n}', parsed.errors.length)}: {parsed.errors.slice(0, 4).map((e) => `${tl('line')} ${e.line} (${e.reason})`).join(', ')}{parsed.errors.length > 4 ? '…' : ''}</span>}
            <button type="button" onClick={commit} disabled={!parsed.rows.length}
              class="ml-auto rounded border border-accent/40 bg-accent/10 px-3 py-1 font-anth text-[11px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-40">
              {tl('Import {n} trades').replace('{n}', parsed.rows.length)}
            </button>
          </div>
          {parsed.rows.length > 0 && (
            <div class="mt-1.5 max-h-40 overflow-auto font-mono text-[10.5px] text-ink-2">
              {parsed.rows.slice(0, 12).map((r, i) => (
                <div key={i} class="flex gap-3 whitespace-nowrap"><span class="w-20 text-muted">{r.d}</span><span class="w-20 font-bold text-accent">{r.sym}</span><span class={`w-8 ${r.side === 'buy' ? 'text-up' : 'text-down'}`}>{tl(r.side === 'buy' ? 'Buy' : 'Sell')}</span><span class="w-16 text-right">{r.qty}</span><span class="w-20 text-right">{r.px}</span><span class="w-14 text-right text-muted">{r.fee || ''}</span></div>
              ))}
              {parsed.rows.length > 12 && <div class="text-muted">… +{parsed.rows.length - 12}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function BookTrades({ portfolio, quotes }) {
  const [tab, setTab] = useState(null)
  const txns = sortTxns(portfolio.txns || []).reverse()
  const pos = useMemo(() => positionsFromTxns(portfolio.txns || []), [portfolio.txns])
  const zh = getLocale() === 'zh'
  const [, zhTick] = useState(0)
  useEffect(() => {
    if (!zh) return undefined
    loadZhTable()
    return onZhTable(() => zhTick((t) => t + 1))
  }, [zh])
  const name = (sym) => (zh && zhName(sym)) || quotes?.[sym]?.name || ''
  const realizedByCcy = Object.values(pos).reduce((acc, p) => { const c = p.ccy || '—'; acc[c] = (acc[c] || 0) + p.realized; return acc }, {})
  return (
    <div class="flex flex-col gap-2">
      {/* a journal: the record leads, entry controls sit in its header and
          open on demand (Jeff 2026-08-22: "framed more like a trading
          journal rather than something that beckons you to add trades") */}
      <section class="rounded-xl border border-line bg-surface-1 overflow-hidden">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-2 px-3 py-1.5">
          <span class="font-anth text-[9px] uppercase tracking-[.14em] text-muted"><span class="text-accent">{portfolio.name}</span> · {tl('Ledger')} · {txns.length}</span>
          {Object.entries(realizedByCcy).map(([c, v]) => (
            <span key={c} class="font-mono text-[11px]"><span class="font-anth text-[9.5px] text-muted">{tl('Realized')} </span>
              <span class={v >= 0 ? 'text-up' : 'text-down'}>{v >= 0 ? '+' : '-'}{fmtCcy(Math.abs(v), c, 2)}</span></span>
          ))}
          <span class="ml-auto flex gap-1">
            {[['add', tl('Add trade')], ['import', tl('Import trades')]].map(([id, label]) => (
              <button key={id} type="button" aria-expanded={tab === id} onClick={() => setTab(tab === id ? null : id)}
                class={`rounded border px-2 py-0.5 font-anth text-[10px] transition-colors ${tab === id ? 'border-accent/45 bg-accent/10 text-accent' : 'border-line-2 text-muted hover:border-line hover:text-ink'}`}>{label}</button>
            ))}
          </span>
        </div>
        {tab && <div class="border-b border-line-2 px-3 py-2.5">{tab === 'add' ? <AddTradeForm portfolio={portfolio} /> : <ImportPanel portfolio={portfolio} />}</div>}
        {txns.length === 0 ? (
          <div class="px-4 py-4 text-center font-mono text-[11px] text-muted">—</div>
        ) : (
          <div class="overflow-x-auto">
            <table class="book-table w-full border-collapse font-mono text-[11px]">
              <thead><tr class="font-anth text-[9px] uppercase tracking-wider text-muted">
                {[tl('Date'), tl('Symbol'), tl('Side'), tl('Qty'), tl('Price'), tl('Fee'), ''].map((h, i) => <th key={i} class={`px-2.5 py-1.5 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} class="border-t border-line hover:bg-surface-3 whitespace-nowrap">
                    <td class="px-2.5 py-[3px] text-muted">{t.d}</td>
                    <td class="px-2.5 py-[3px]"><span class="font-bold text-accent">{t.sym}</span>{name(t.sym) && <span class="ml-1.5 font-anth text-[9.5px] text-muted">{name(t.sym)}</span>}</td>
                    <td class={`px-2.5 py-[3px] ${t.side === 'buy' ? 'text-up' : 'text-down'}`}>{tl(t.side === 'buy' ? 'Buy' : 'Sell')}</td>
                    <td class="px-2.5 py-[3px] text-right">{t.qty}</td>
                    <td class="px-2.5 py-[3px] text-right">{t.px}{t.ccy ? <span class="ml-1 font-anth text-[9px] text-muted">{t.ccy}</span> : null}</td>
                    <td class="px-2.5 py-[3px] text-right text-muted">{t.fee || ''}</td>
                    <td class="px-2.5 py-[3px] text-right"><button type="button" onClick={() => removeTxn(portfolio.id, t.id)} title={tl('Remove trade')} aria-label={tl('Remove trade')} class="text-muted hover:text-down">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
