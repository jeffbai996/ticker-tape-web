import { useEffect, useState } from 'preact/hooks'
import { buildPerformance } from '../lib/performance.js'
import { fetchHistory } from '../lib/history.js'
import { fmtPct } from '../lib/format.js'
import { getLocale, tl } from '../lib/i18n.js'
import { LineChart } from '../components/LineChart.jsx'

// 净值 — the book's daily marks as a line, normalised to 100 at the first
// mark, against the indices a Hong Kong / mainland / US book competes with.
// The marks are filed by the overview (one per day the whole book priced),
// so the line grows with use; until two marks exist the page says so.

const BENCHMARKS = [
  { id: 'hsi', symbol: '^HSI', label: 'HSI', zh: '恒生指数' },
  { id: 'csi300', symbol: '000300.SS', label: 'CSI 300', zh: '沪深300' },
  { id: 'spx', symbol: '^GSPC', label: 'S&P 500', zh: '标普500' },
]
const COLORS = ['#f59e0b', '#60a5fa', '#f472b6', '#a3e635']

export function BookPerformance({ portfolio }) {
  const marks = (portfolio.snapshots || []).filter((s) => s.c === portfolio.ccy)
  const [bars, setBars] = useState({})
  useEffect(() => {
    let live = true
    ;(async () => {
      for (const b of BENCHMARKS) {
        try {
          const h = await fetchHistory(b.symbol, '1Y')
          if (!live) return
          setBars((m) => ({ ...m, [b.id]: h?.bars || [] }))
        } catch { /* a missing benchmark is a missing line, not an error */ }
        await new Promise((r) => setTimeout(r, 400))
      }
    })()
    return () => { live = false }
  }, [])

  const zh = getLocale() === 'zh'
  const benches = BENCHMARKS.filter((b) => bars[b.id]?.length).map((b) => ({ id: b.id, label: zh ? b.zh : b.label, bars: bars[b.id] }))
  const perf = buildPerformance(marks, benches, portfolio.cashTxns || [], portfolio.ccy)
  const names = [portfolio.name, ...benches.map((b) => b.label)]

  return (
    <div class="flex flex-col gap-2">
      <section class="rounded-xl border border-line bg-surface-1 px-3 py-2">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-1">
          <span class="font-anth text-[9px] uppercase tracking-[.14em] text-muted">{tl('Performance')}</span>
          <span class="font-mono text-[9.5px] text-muted">{marks.length} {tl('marks')}{marks.length ? ` · ${tl('first mark')} ${marks[0].d}` : ''}</span>
          {portfolio.cashTxns?.some((entry) => entry.kind !== 'opening') && (
            <span class="font-anth text-[9px] text-muted">· {tl('cash-flow adjusted')}</span>
          )}
        </div>
        {perf.dates.length >= 2 ? (
          <>
            <div class="text-ink-2"><LineChart dates={perf.dates} series={perf.series} colors={COLORS} /></div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 pt-1.5">
              {perf.series.map((s, k) => (
                <span key={s.id} class="inline-flex items-center gap-1.5 font-mono text-[10.5px]">
                  <span class="inline-block h-[3px] w-4 rounded" style={{ background: COLORS[k % COLORS.length] }} />
                  <span class="text-ink-2">{names[k]}</span>
                  <span class={s.ret == null ? 'text-muted' : s.ret >= 0 ? 'text-up' : 'text-down'}>{s.ret == null ? '—' : fmtPct(s.ret)}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <div class="py-6 text-center font-anth text-[11px] text-muted">
            {tl('Open this page once a day — the value line grows from those marks.')}
          </div>
        )}
      </section>
    </div>
  )
}
