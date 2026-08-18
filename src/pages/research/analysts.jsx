import { useState, useEffect } from 'preact/hooks'
import { useQuotes } from '../../hooks.js'
import { tl, t as tt } from '../../lib/i18n.js'
import { fetchAnalysts } from '../../lib/fundamentals.js'
import { fmtPrice, fmtPct } from '../../lib/format.js'
import { Loading } from '../../components/Loading.jsx'

const GRADE_TONE = (g) => {
  const s = (g || '').toLowerCase()
  if (/buy|overweight|outperform|positive|accumulate/.test(s)) return 'text-up'
  if (/sell|underweight|underperform|negative|reduce/.test(s)) return 'text-down'
  return 'text-ink-2'
}

export function AnalystsView({ symbol }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const live = useQuotes([symbol])
  const price = live[symbol]?.quote?.price

  useEffect(() => {
    let dead = false
    setData(null)
    setFailed(false)
    fetchAnalysts(symbol)
      .then((d) => { if (!dead) setData(d) })
      .catch(() => { if (!dead) setFailed(true) })
    return () => { dead = true }
  }, [symbol])

  if (failed) {
    return <div class="px-1 font-mono text-[11px] text-muted">no analyst coverage for {symbol}</div>
  }
  if (!data) return <Loading label={tt('common.loading')} minH={240} />

  const t9 = data.trend
  const total = t9 ? t9.strongBuy + t9.buy + t9.hold + t9.sell + t9.strongSell : 0
  const seg = (n, cls) =>
    n > 0 && <div class={`${cls} h-full`} style={{ width: `${(n / total) * 100}%` }} title={n} />
  const tg = data.targets

  return (
    <div class="grid gap-3 items-start xl:grid-cols-[400px_minmax(0,1fr)]">
      <div class="flex flex-col gap-3 min-w-0">
      {t9 && total > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
            <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
              {tl('Rec trend')} · {total} {tl('Analysts').toLowerCase()}
            </h2>
          </header>
          <div class="p-4 pt-3">
          <div class="flex h-3 rounded overflow-hidden">
            {seg(t9.strongBuy, 'bg-up')}
            {seg(t9.buy, 'bg-up/50')}
            {seg(t9.hold, 'bg-accent/60')}
            {seg(t9.sell, 'bg-down/50')}
            {seg(t9.strongSell, 'bg-down')}
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 pt-2 font-mono text-[10px]">
            <span class="text-up">{tl('Strong buy')} {t9.strongBuy}</span>
            <span class="text-up/80">{tl('Buy')} {t9.buy}</span>
            <span class="text-accent">{tl('Hold')} {t9.hold}</span>
            <span class="text-down/80">{tl('Sell')} {t9.sell}</span>
            <span class="text-down">{tl('Strong sell')} {t9.strongSell}</span>
          </div>
          </div>
        </section>
      )}

      {tg.mean != null && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden font-mono text-[12px]">
          <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
            <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
              {tl('Price targets')}{tg.analysts != null && ` · ${tg.analysts}`}
            </h2>
          </header>
          <div class="p-4 pt-3">
          <div class="flex flex-wrap gap-x-6 gap-y-1">
            <span><span class="text-muted">{tl('Low')}</span> <span class="text-ink-2">{fmtPrice(tg.low)}</span></span>
            <span><span class="text-muted">{tl('Mean')}</span> <span class="text-ink">{fmtPrice(tg.mean)}</span></span>
            <span><span class="text-muted">{tl('High')}</span> <span class="text-ink-2">{fmtPrice(tg.high)}</span></span>
            {price != null && (
              <span>
                <span class="text-muted">{tl('Current')}</span>{' '}
                <span class={price <= tg.mean ? 'text-up' : 'text-down'}>
                  {fmtPrice(price)} ({fmtPct(((tg.mean - price) / price) * 100)} → {tl('Mean')})
                </span>
              </span>
            )}
          </div>
          </div>
        </section>
      )}

      </div>
      {data.history.length > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto min-w-0">
          <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
            <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Recent rating changes')}</h2>
          </header>
          <table class="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
                <th class="px-3 py-2 text-left">{tl('Date')}</th>
                <th class="px-2 py-2 text-left">{tl('Firm')}</th>
                <th class="px-2 py-2 text-left">{tl('From')}</th>
                <th class="w-6 px-1 py-2"></th>
                <th class="px-2 py-2 text-left">{tl('To')}</th>
                <th class="px-2 py-2 text-right">{tl('Past PT')}</th>
                <th class="w-8 px-1 py-2"></th>
                <th class="px-3 py-2 text-right">{tl('New PT')}</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((h, i) => (
                <tr key={i} class="border-t border-line hover:bg-surface-3">
                  <td class="px-3 py-[4px] text-muted whitespace-nowrap">
                    {h.date ? new Date(h.date).toISOString().slice(0, 10) : '—'}
                  </td>
                  <td class="px-2 py-[4px] text-ink whitespace-nowrap max-w-44 truncate">{h.firm}</td>
                  <td class="px-2 py-[4px] whitespace-nowrap text-muted">{h.from || '—'}</td>
                  <td class="w-6 px-1 py-[4px] text-center">
                    {h.action === 'up' ? <span class="text-up">▲</span>
                      : h.action === 'down' ? <span class="text-down">▼</span>
                      : ''}
                  </td>
                  <td class={`px-2 py-[4px] whitespace-nowrap font-medium ${GRADE_TONE(h.to)}`}>{h.to || '—'}</td>
                  <td class="px-2 py-[4px] text-right text-muted whitespace-nowrap">
                    {h.priorPt != null ? fmtPrice(h.priorPt) : '—'}
                  </td>
                  <td class="w-8 px-1 py-[4px] text-center text-muted">
                    {h.pt != null && h.priorPt != null ? '→' : ''}
                  </td>
                  <td class={`px-3 py-[4px] text-right whitespace-nowrap ${
                    h.pt != null && h.priorPt != null
                      ? (h.pt >= h.priorPt ? 'text-up' : 'text-down')
                      : 'text-ink-2'
                  }`}>
                    {h.pt != null ? fmtPrice(h.pt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
