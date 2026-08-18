import { useState, useEffect } from 'preact/hooks'
import { getLocale, tl } from '../../lib/i18n.js'
import { fetchDividends as fetchDivHistory, fetchSplits } from '../../lib/history.js'
import { fetchFundamentals } from '../../lib/fundamentals.js'
import { wireServiceUrl } from '../../lib/wire.js'
import { fmtPrice, fmtFracPct } from '../../lib/format.js'
import { MdLite } from '../../components/AiReport.jsx'

/** Dividend read: yield/rate/dates from fundamentals + the broker's
 *  dividend markdown when a wire is connected. */
export function DividendsView({ symbol }) {
  const [f, setF] = useState(null)
  const [md, setMd] = useState(null)
  const [hist, setHist] = useState(null)
  const [splits, setSplits] = useState(null)
  useEffect(() => {
    setF(null); setMd(null); setHist(null); setSplits(null)
    fetchFundamentals(symbol).then(setF).catch(() => setF({}))
    fetchDivHistory(symbol).then(setHist).catch(() => setHist([]))
    fetchSplits(symbol).then(setSplits).catch(() => setSplits([]))
    // wireServiceUrl, not wireUrl: /api/ibkr/* is a broker-backed route only a
    // real Fragwire answers. The public mirror is a headline archive, so asking
    // it burns a request to earn a 404.
    const base = wireServiceUrl()
    if (base) {
      fetch(`${base.replace(/\/$/, '')}/api/ibkr/dividends?scope=single&symbol=${encodeURIComponent(symbol)}`,
        { signal: AbortSignal.timeout(25_000) })
        .then((r) => r.json())
        .then((out) => setMd(out.ok ? out.markdown : null))
        .catch(() => setMd(null))
    }
  }, [symbol])
  const cellRow = (label, value) => (
    <div class="flex justify-between gap-3 px-3 py-[4px] border-b border-line last:border-0">
      <span class="font-anth text-muted text-[11px]">{label}</span>
      <span class="font-mono text-[11px] text-ink">{value ?? '—'}</span>
    </div>
  )
  return (
    <div class="flex flex-col gap-2 max-w-2xl">
      <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
        <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Dividends')} — {symbol}</h2>
        </header>
        {f == null ? (
          <div class="px-3 py-2 font-mono text-[11px] text-muted animate-pulse">{tl('loading…')}</div>
        ) : (
          <>
            {cellRow('Yield', (f.dividendYield ?? f.yield) != null ? fmtFracPct(f.dividendYield ?? f.yield) : '—')}
            {cellRow('Rate (annual)', f.dividendRate != null ? fmtPrice(f.dividendRate) : '—')}
            {cellRow('Payout ratio', f.payoutRatio != null ? fmtFracPct(f.payoutRatio) : '—')}
            {cellRow('Ex-div date', f.exDividendDate
              ? new Date(f.exDividendDate * 1000).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')}
          </>
        )}
      </section>
      {hist != null && hist.length > 0 && (() => {
        // Annual sums, oldest → newest. The 5y monthly chart pull means the
        // first year is usually partial — label it so the short bar doesn't
        // read as a cut.
        const byYear = new Map()
        for (const d of hist) {
          const y = new Date(d.date * 1000).getUTCFullYear()
          byYear.set(y, (byYear.get(y) || 0) + d.amount)
        }
        const years = [...byYear.entries()].sort((a, b) => a[0] - b[0])
        const max = Math.max(...years.map(([, v]) => v), 0.0001)
        const firstYear = years[0]?.[0]
        const recent = hist.slice(0, 8)
        return (
          <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
            <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
              <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Payment history')}</h2>
            </header>
            <div class="flex items-end gap-2 px-3 pt-3 pb-1 h-24">
              {years.map(([y, v]) => (
                <div key={y} class="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span class="font-mono text-[9px] text-ink-2">{fmtPrice(v)}</span>
                  <div class="w-full rounded-t-sm bg-accent/60"
                    style={{ height: `${Math.max(3, Math.round((v / max) * 52))}px` }} />
                  <span class="font-mono text-[9px] text-muted">{y}{y === firstYear ? '*' : ''}</span>
                </div>
              ))}
            </div>
            {firstYear != null && (
              <p class="px-3 pb-1 font-mono text-[9px] text-muted">* {tl('partial year — 5y window')}</p>
            )}
            <table class="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr class="text-[9px] text-muted uppercase tracking-wider bg-surface-2/60">
                  <th class="px-3 py-1 text-left">{tl('Ex-date')}</th>
                  <th class="px-3 py-1 text-right">{tl('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.date} class="border-t border-line">
                    <td class="px-3 py-[3px] text-ink-2">
                      {new Date(d.date * 1000).toISOString().slice(0, 10)}
                    </td>
                    <td class="px-3 py-[3px] text-right text-ink">{fmtPrice(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })()}
      {splits != null && splits.length > 0 && (
        <p class="px-1 font-mono text-[10.5px] text-muted">
          {tl('Splits')}: {splits.map((s) => `${s.ratio} (${new Date(s.date * 1000).toISOString().slice(0, 10)})`).join(' · ')}
        </p>
      )}
      {md && md.trim() && !/^no dividend/i.test(md.trim()) && (
        <section class="bg-surface-1 border border-line rounded-xl px-3 py-2 font-anth text-[12.5px] leading-relaxed text-ink-2">
          <MdLite text={md} />
        </section>
      )}
      {f != null && (f.dividendYield ?? f.yield) == null && (hist == null || hist.length === 0) && (
        <p class="px-1 font-mono text-[10.5px] text-muted">{symbol} pays no dividend — growth name, the yield is the thesis.</p>
      )}
    </div>
  )
}
