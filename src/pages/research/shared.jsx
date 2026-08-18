// Small cross-view helpers shared by more than one research subview. Nothing
// here is a framework — each export already had callers on both sides of the
// split (Fundamentals/DesBand for ratingTone, most stat cards for Stat and
// SectionCard, the ownership/filings/profile views for useFetched).
import { useEffect, useState } from 'preact/hooks'
import { tl, t as tt } from '../../lib/i18n.js'

/** Analyst-consensus tone: conviction green → amber → red, matching the
 *  P&L grammar (strong buy is not the same signal as hold). */
export function ratingTone(key) {
  const k = String(key || '').toLowerCase().replace(/[\s_-]+/g, '_')
  if (k === 'strong_buy') return 'text-up font-semibold'
  if (k === 'buy' || k === 'overweight' || k === 'outperform') return 'text-up'
  if (k === 'hold' || k === 'neutral' || k === 'equal_weight') return 'text-accent'
  if (k === 'underperform' || k === 'underweight' || k === 'reduce') return 'text-down'
  if (k === 'sell' || k === 'strong_sell') return 'text-down font-semibold'
  return 'text-ink'
}

export function Stat({ label, value, cls = 'text-ink' }) {
  return (
    <div class="flex justify-between gap-3 px-3 py-[4px] border-b border-line last:border-0">
      <span class="font-anth text-muted text-[11px]">{tl(label)}</span>
      <span class={`font-mono text-[11px] ${cls}`}>{value ?? '—'}</span>
    </div>
  )
}

export function SectionCard({ title, actions, children }) {
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2 flex items-center gap-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
        {actions && <div class="ml-auto flex items-center gap-1 overflow-x-auto no-scrollbar">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

export function useFetched(symbol, fetcher) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let dead = false
    setData(null)
    setFailed(false)
    fetcher(symbol)
      .then((d) => { if (!dead) setData(d) })
      .catch(() => { if (!dead) setFailed(true) })
    return () => { dead = true }
  }, [symbol])
  return [data, failed]
}

export { tt }
