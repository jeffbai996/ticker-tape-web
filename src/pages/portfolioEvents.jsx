import { useEffect, useState } from 'preact/hooks'
import { fetchSymbolEvents } from '../lib/cnEvents.js'
import { fmtCcy } from '../lib/fx.js'
import { getLocale, tl } from '../lib/i18n.js'
import { loadZhTable, onZhTable, zhName } from '../lib/zhNames.js'

// 分红财报 — what each holding will do next: results date, ex-dividend,
// the last payout per share and what that is worth at the book's share
// count. Fetched one name at a time with provider spacing; each source
// fails alone, so a missing dividend report is a dash, not an empty page.

const within = (d, today, days) => d && d >= today && (Date.parse(d) - Date.parse(today)) / 86400000 <= days

export function BookEvents({ portfolio, quotes }) {
  const holdings = portfolio.holdings || []
  const key = holdings.map((h) => h.symbol).join(',')
  const [ev, setEv] = useState({})
  const [done, setDone] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    let live = true
    setEv({}); setDone(false)
    ;(async () => {
      for (const h of holdings) {
        try {
          const e = await fetchSymbolEvents(h.symbol, { today })
          if (!live) return
          setEv((m) => ({ ...m, [h.symbol]: e }))
        } catch { if (live) setEv((m) => ({ ...m, [h.symbol]: null })) }
        await new Promise((r) => setTimeout(r, 450))
      }
      if (live) setDone(true)
    })()
    return () => { live = false }
  }, [key])

  const zh = getLocale() === 'zh'
  const [, zhTick] = useState(0)
  useEffect(() => {
    if (!zh) return undefined
    loadZhTable()
    return onZhTable(() => zhTick((t) => t + 1))
  }, [zh])
  const name = (s) => (zh && zhName(s)) || quotes?.[s]?.name || ''
  const upcoming = holdings.flatMap((h) => {
    const e = ev[h.symbol]
    if (!e) return []
    const out = []
    if (within(e.nextResults, today, 14)) out.push({ d: e.nextResults, symbol: h.symbol, what: tl('Next results') })
    if (within(e.exDate, today, 14)) out.push({ d: e.exDate, symbol: h.symbol, what: tl('Ex-dividend') })
    if (within(e.payDate, today, 14)) out.push({ d: e.payDate, symbol: h.symbol, what: tl('paid') })
    return out
  }).sort((a, b) => a.d.localeCompare(b.d))
  const income = (h, e) => {
    const last = e?.dividends?.[0]
    return last?.perShare != null ? fmtCcy(last.perShare * h.shares, last.ccy, 0) : '—'
  }
  const fmtDate = (d) => (d ? (zh ? d.slice(5).replace('-', '/') : d.slice(5)) : '—')

  if (!holdings.length) {
    return <div class="rounded-xl border border-line bg-surface-1 px-4 py-6 text-center font-anth text-[11px] text-muted">{tl('Add holdings to see their news here.')}</div>
  }

  return (
    <div class="flex flex-col gap-2">
      <section class="rounded-xl border border-line bg-surface-1 px-3 py-2">
        <div class="flex items-baseline gap-2 pb-1 font-anth text-[9px] uppercase tracking-[.14em] text-muted">
          {tl('Upcoming 14 days')}
          {!done && <span class="normal-case tracking-normal">{tl('loading')} {Object.keys(ev).length}/{holdings.length}…</span>}
        </div>
        {upcoming.length === 0
          ? <div class="py-1 font-anth text-[10.5px] text-muted">{done ? tl('Nothing scheduled in the next two weeks.') : '…'}</div>
          : (
            <div class="flex flex-col gap-0.5">
              {upcoming.map((u, i) => (
                <div key={i} class="flex items-baseline gap-3 font-mono text-[11px]">
                  <span class="w-12 text-accent">{fmtDate(u.d)}</span>
                  <a href={`#/research/${u.symbol.toLowerCase()}`} class="font-bold text-ink hover:underline">{u.symbol}</a>
                  <span class="min-w-0 truncate font-anth text-[10.5px] text-ink-2">{name(u.symbol)}</span>
                  <span class="ml-auto font-anth text-[10px] text-muted">{u.what}</span>
                </div>
              ))}
            </div>
          )}
      </section>

      <section class="rounded-xl border border-line bg-surface-1 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="book-table w-full border-collapse font-mono text-[11px]">
            <thead><tr class="font-anth text-[9px] uppercase tracking-wider text-muted">
              {[tl('Symbol'), tl('Next results'), tl('Ex-dividend'), tl('Last dividend'), tl('Yield'), tl('Est. income')].map((h, i) => (
                <th key={i} class={`px-2.5 py-1.5 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {holdings.map((h) => {
                const e = ev[h.symbol]
                const last = e?.dividends?.[0]
                return (
                  <tr key={h.symbol} class="border-t border-line hover:bg-surface-3 whitespace-nowrap">
                    <td class="px-2.5 py-[3px]"><a href={`#/research/${h.symbol.toLowerCase()}`} class="font-bold text-accent hover:underline">{h.symbol}</a>{name(h.symbol) && <span class="ml-1.5 font-anth text-[9.5px] text-muted">{name(h.symbol)}</span>}</td>
                    <td class={`px-2.5 py-[3px] text-right ${within(e?.nextResults, today, 14) ? 'text-accent' : 'text-ink-2'}`}>{e === undefined ? '…' : e?.nextResults || '—'}</td>
                    <td class={`px-2.5 py-[3px] text-right ${within(e?.exDate, today, 14) ? 'text-accent' : 'text-ink-2'}`}>{e === undefined ? '…' : e?.exDate || '—'}</td>
                    <td class="px-2.5 py-[3px] text-right text-ink-2" title={last?.plan || ''}>{last?.perShare != null ? `${fmtCcy(last.perShare, last.ccy, last.perShare < 1 ? 3 : 2)} ${tl('per share')}` : e === undefined ? '…' : '—'}</td>
                    <td class="px-2.5 py-[3px] text-right text-muted">{e?.yieldPct != null ? `${e.yieldPct.toFixed(2)}%` : '—'}</td>
                    <td class="px-2.5 py-[3px] text-right text-ink">{e === undefined ? '…' : income(h, e)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
