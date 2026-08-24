import { useMemo, useState } from 'preact/hooks'
import { cashBalanceFor, cashJournal } from '../lib/cashLedger.js'
import { convertCcy, fmtCcy, PORTFOLIO_CCYS } from '../lib/fx.js'
import {
  addCashTxn, loadPortfolios, localDate, reconcileCash, removeCashTxn,
} from '../lib/myPortfolios.js'
import { tl } from '../lib/i18n.js'

const MODES = ['deposit', 'withdrawal', 'adjustment']
const MODE_LABEL = {
  deposit: 'Deposit', withdrawal: 'Withdraw', adjustment: 'Set balance',
}
const KIND_LABEL = {
  opening: 'Opening balance', deposit: 'Deposit', withdrawal: 'Withdrawal',
  adjustment: 'Adjustment', trade: 'Trade settlement',
}

/** Cash is a journal, not a loose number. Trades settle automatically; this
 *  ticket is only for money entering/leaving the book or reconciling it to a
 *  statement. */
export function CashActivity({ portfolio, rates }) {
  const [mode, setMode] = useState('deposit')
  const [ccy, setCcy] = useState(portfolio.cash?.[0]?.ccy || portfolio.ccy)
  const [amount, setAmount] = useState('')
  const [d, setD] = useState(() => localDate())
  const [note, setNote] = useState('')
  const [revision, setRevision] = useState(0)
  const current = useMemo(() => loadPortfolios().find((p) => p.id === portfolio.id) || portfolio,
    [portfolio, revision])
  const before = cashBalanceFor(current, ccy)
  const amountText = String(amount).replace(/,/g, '').trim()
  const raw = amountText === '' ? Number.NaN : Number(amountText)
  const delta = mode === 'deposit' ? raw : mode === 'withdrawal' ? -raw : raw - before
  const after = Number.isFinite(delta) ? before + delta : null
  const ready = !!d && (mode === 'adjustment' ? Number.isFinite(raw) && delta !== 0 : raw > 0)
  const journal = cashJournal(current).slice().reverse().slice(0, 16)

  const submit = (event) => {
    event.preventDefault()
    if (!ready) return
    const displayDelta = convertCcy(delta, ccy, current.ccy, rates)
    const meta = {
      d, note,
      ...(displayDelta != null ? { bookAmount: displayDelta, bookCcy: current.ccy } : {}),
    }
    const saved = mode === 'adjustment'
      ? reconcileCash(current.id, ccy, raw, meta)
      : addCashTxn(current.id, {
        ...meta, ccy, kind: mode, amount: raw,
        ...(displayDelta != null ? { bookAmount: Math.abs(displayDelta) } : {}),
      })
    if (!saved) return
    setAmount('')
    setNote('')
    setRevision((value) => value + 1)
  }

  const remove = (id) => {
    if (removeCashTxn(current.id, id)) setRevision((value) => value + 1)
  }

  const box = 'h-7 rounded-md border border-line-2 bg-surface-2 px-2 font-mono text-[11px] text-ink outline-none focus:border-accent/60'
  const actionTone = mode === 'deposit' ? 'border-up/45 bg-up/10 text-up'
    : mode === 'withdrawal' ? 'border-down/45 bg-down/10 text-down'
      : 'border-accent/45 bg-accent/10 text-accent'

  return (
    <div class="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
      <form onSubmit={submit} class="min-w-0 rounded-lg border border-line bg-surface-0/40 p-3">
        <div class="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_4.5rem_minmax(8rem,1fr)_auto]">
          <span class="col-span-2 grid h-7 grid-cols-3 items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5 sm:col-span-1 sm:flex" role="radiogroup" aria-label={tl('Cash action')}>
            {MODES.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={mode === id}
                onClick={() => { setMode(id); setAmount('') }}
                class={`h-6 min-w-0 whitespace-nowrap rounded px-1.5 font-anth text-[10.5px] transition-colors sm:px-2.5 ${mode === id ? actionTone : 'text-muted hover:text-ink'}`}>
                {tl(MODE_LABEL[id])}
              </button>
            ))}
          </span>
          <select value={ccy} onChange={(event) => setCcy(event.currentTarget.value)} aria-label={tl('Currency')}
            class={`${box} w-full font-anth`}>
            {PORTFOLIO_CCYS.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
          <label class="min-w-[9rem] flex-1">
            <span class="sr-only">{tl('Cash amount')}</span>
            <input value={amount} onInput={(event) => setAmount(event.currentTarget.value)}
              aria-label={tl('Cash amount')} inputMode="decimal" data-1p-ignore data-lpignore="true"
              placeholder={mode === 'adjustment' ? tl('Actual balance') : tl('Amount')}
              class={`${box} w-full text-right`} />
          </label>
          <input type="date" value={d} onInput={(event) => setD(event.currentTarget.value)}
            aria-label={tl('Date')} class={`${box} col-span-2 w-full sm:col-span-1 sm:w-auto`} />
        </div>
        <div class="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <input value={note} onInput={(event) => setNote(event.currentTarget.value)} aria-label={tl('Note')}
            placeholder={tl('Note (optional)')} maxlength={120}
            class={`${box} min-w-[12rem] flex-1 font-anth`} />
          <button type="submit" disabled={!ready}
            class={`h-7 rounded-md border px-3.5 font-anth text-[11px] font-semibold transition-opacity ${actionTone} disabled:opacity-35`}>
            {tl(MODE_LABEL[mode])}
          </button>
        </div>
        <div class="mt-3 grid grid-cols-2 overflow-hidden rounded-md border border-line bg-surface-2/50">
          <div class="border-r border-line px-2.5 py-2">
            <div class="font-anth text-[9px] uppercase tracking-wider text-muted">{tl('Current balance')}</div>
            <div class="mt-0.5 font-mono text-[13px] font-semibold text-ink">{fmtCcy(before, ccy, 2)}</div>
          </div>
          <div class="px-2.5 py-2 text-right">
            <div class="font-anth text-[9px] uppercase tracking-wider text-muted">{tl('Balance after')}</div>
            <div class={`mt-0.5 font-mono text-[13px] font-semibold ${after == null ? 'text-muted' : after < 0 ? 'text-down' : 'text-ink'}`}>
              {after == null ? '—' : fmtCcy(after, ccy, 2)}
            </div>
          </div>
        </div>
        <p class="mt-2 font-anth text-[9.5px] text-muted">
          {mode === 'adjustment'
            ? tl('Set the actual balance; the difference is recorded as a deposit or withdrawal.')
            : tl('Deposits and withdrawals change cash without changing shares.')}
        </p>
      </form>

      <section class="min-w-0 overflow-hidden rounded-lg border border-line bg-surface-0/40">
        <div class="flex items-center justify-between border-b border-line px-2.5 py-1.5">
          <span class="font-anth text-[9px] uppercase tracking-[.14em] text-muted">{tl('Cash journal')}</span>
          <span class="font-mono text-[9px] text-muted">{journal.length}</span>
        </div>
        {journal.length ? (
          <div class="max-h-52 overflow-auto">
            {journal.map((entry) => (
              <div key={entry.id} class="grid grid-cols-[4.6rem_minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-line px-2.5 py-1 first:border-t-0">
                <span class="font-mono text-[9.5px] text-muted">{entry.d || tl('Opening')}</span>
                <span class="min-w-0 truncate font-anth text-[10px] text-ink-2">
                  {entry.kind === 'trade' ? `${tl(entry.side === 'buy' ? 'Buy' : 'Sell')} ${entry.sym}` : tl(KIND_LABEL[entry.kind])}
                  {entry.note ? <span class="ml-1.5 text-muted">· {entry.note}</span> : null}
                </span>
                <span class={`whitespace-nowrap font-mono text-[10.5px] ${entry.amount >= 0 ? 'text-up' : 'text-down'}`}>
                  {entry.amount >= 0 ? '+' : '-'}{fmtCcy(Math.abs(entry.amount), entry.ccy, 2)}
                </span>
                {['deposit', 'withdrawal', 'adjustment'].includes(entry.kind) ? (
                  <button type="button" onClick={() => remove(entry.id)} aria-label={tl('Remove cash activity')}
                    class="font-mono text-[10px] text-muted hover:text-down">×</button>
                ) : <span class="w-2" />}
              </div>
            ))}
          </div>
        ) : (
          <div class="px-3 py-8 text-center font-anth text-[10.5px] text-muted">{tl('No cash activity yet.')}</div>
        )}
      </section>
    </div>
  )
}
