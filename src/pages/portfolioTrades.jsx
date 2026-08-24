import { useEffect, useMemo, useState } from 'preact/hooks'
import { addTxn, importTxns, removeTxn } from '../lib/myPortfolios.js'
import { positionsFromTxns, sortTxns } from '../lib/lots.js'
import { parseTradesCsv } from '../lib/tradeCsv.js'
import { fmtCcy } from '../lib/fx.js'
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
  const typed = sym.trim().toUpperCase()
  const symbol = picked && String(picked.symbol).toUpperCase() === typed ? picked.symbol : typed
  const submit = (e) => {
    e.preventDefault()
    const ok = addTxn(portfolio.id, { d, sym: symbol, side, qty: Number(qty), px: Number(px), fee: Number(fee) || 0 })
    if (ok) { setSym(''); setPicked(null); setQty(''); setPx(''); setFee('') }
  }
  return (
    <form onSubmit={submit} class="flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-0.5">
        <span class="font-anth text-[9px] uppercase tracking-wider text-muted">{tl('Symbol')}</span>
        <SymbolSuggest value={sym} placeholder={tl('Symbol or company')} ariaLabel={tl('Symbol')} dropUp={false}
          onInput={(e) => { setSym(e.currentTarget.value); setPicked(null) }} onPick={(h) => { setSym(h.symbol); setPicked(h) }}
          inputClass={`${box} w-40`} />
      </label>
      <span class="flex h-[26px] items-center gap-0.5 rounded border border-line bg-surface-2 px-0.5 self-end" role="radiogroup" aria-label={tl('Side')}>
        {['buy', 'sell'].map((s) => (
          <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(s)}
            class={`px-2 py-px font-anth text-[10.5px] rounded ${side === s ? (s === 'buy' ? 'bg-up text-black font-bold' : 'bg-down text-black font-bold') : 'text-muted hover:text-ink'}`}>
            {tl(s === 'buy' ? 'Buy' : 'Sell')}
          </button>
        ))}
      </span>
      {[[tl('Qty'), qty, setQty, 'w-24'], [tl('Price'), px, setPx, 'w-24'], [tl('Fee'), fee, setFee, 'w-20']].map(([label, v, set, w]) => (
        <label key={label} class="flex flex-col gap-0.5">
          <span class="font-anth text-[9px] uppercase tracking-wider text-muted">{label}</span>
          <input value={v} onInput={(e) => set(e.currentTarget.value)} inputMode="decimal" aria-label={label}
            data-1p-ignore data-lpignore="true" class={`${box} ${w} text-right`} />
        </label>
      ))}
      <label class="flex flex-col gap-0.5">
        <span class="font-anth text-[9px] uppercase tracking-wider text-muted">{tl('Date')}</span>
        <input type="date" value={d} onInput={(e) => setD(e.currentTarget.value)} aria-label={tl('Date')} class={`${box} w-36`} />
      </label>
      <button type="submit" disabled={!symbol || !(Number(qty) > 0) || !(Number(px) >= 0) || !d}
        class="h-[26px] rounded border border-accent/40 bg-accent/10 px-3 font-anth text-[12px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-40">
        {tl('Add trade')}
      </button>
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
          <span class="font-anth text-[9px] uppercase tracking-[.14em] text-muted">{tl('Ledger')} · {txns.length}</span>
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
