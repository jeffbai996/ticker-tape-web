import { useState, useEffect } from 'preact/hooks'
import { tl, t as tt } from '../../lib/i18n.js'
import { fetchFinancials, statementRows } from '../../lib/financials.js'
import { fetchCnFinancials } from '../../lib/cnFinancials.js'
import { isCnListing } from '../../lib/cnData.js'
import { fetchDividends as fetchDivHistory, fetchHistory, fetchSplits } from '../../lib/history.js'
import { fetchFundamentals } from '../../lib/fundamentals.js'
import { BUCKETS } from '../../lib/symbols.js'
import { fmtBig, fmtPctPlain, fmtRatio, fmtFracPct } from '../../lib/format.js'
import { Loading } from '../../components/Loading.jsx'
import { SectionCard } from './shared.jsx'

/** FA: statement tables (quarterly + annual), corporate actions, and the
 *  peer comp — the sweep's items 1/2/4 in one numbered tab. */
function StatementTable({ title, periods }) {
  const rows = statementRows(periods)
  if (!rows.length) return null
  const fmtCell = (kind, v) => v == null ? '—'
    : kind === 'money' ? fmtBig(v)
    : kind === 'pct' ? fmtPctPlain(v)
    : v >= 100 ? v.toFixed(0) : v.toFixed(2)
  const short = (end) => end ? `${end.slice(2, 4)}'${end.slice(5, 7)}` : '—'
  return (
    <SectionCard title={title}>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse font-mono text-[11px] whitespace-nowrap">
          <thead>
            <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
              <th class="px-3 py-2 text-left"></th>
              {periods.map((per) => (
                <th key={per.ts} class="px-2 py-2 text-right">{short(per.end)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} class="border-t border-line hover:bg-surface-3">
                <td class="px-3 py-[4px] text-muted">{tl(row.label)}</td>
                {row.cells.map((cell, i) => (
                  <td key={i} class="px-2 py-[4px] text-right">
                    <span class="text-ink">{fmtCell(row.kind, cell.v)}</span>
                    {cell.growth != null && (
                      <span class={`ml-1.5 text-[9.5px] ${cell.growth >= 0 ? 'text-up' : 'text-down'}`}>
                        {cell.growth >= 0 ? '+' : ''}{Math.round(cell.growth)}%
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function PeerComp({ symbol }) {
  const bucket = BUCKETS.find((b) => b.symbols.includes(symbol))
  const peers = (bucket?.symbols || []).slice(0, 14)
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let dead = false
    setRows(null)
    if (!peers.length) { setRows([]); return }
    Promise.all(peers.map((sym) =>
      Promise.all([fetchFundamentals(sym).catch(() => null), fetchHistory(sym, '1Y').catch(() => null)])
        .then(([f, h]) => {
          const closes = h?.bars?.map((b) => b.close) || []
          const last = closes[closes.length - 1]
          const high = closes.length ? Math.max(...closes) : null
          return { sym, f, last, offHigh: last && high ? ((last / high) - 1) * 100 : null }
        })))
      .then((out) => !dead && setRows(out.filter((r) => r.f)))
    return () => { dead = true }
  }, [symbol])
  if (!bucket) return null
  return (
    <SectionCard title={`${tl('Relative value')} · ${tl(bucket.name)}`}>
      {rows === null ? (
        <Loading label={tt('common.loading')} minH={160} />
      ) : (
        <div class="overflow-x-auto">
          <table class="w-full border-collapse font-mono text-[11px] whitespace-nowrap">
            <thead>
              <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
                <th class="px-3 py-2 text-left">{tl('Ticker')}</th>
                <th class="px-2 py-2 text-right">P/E fwd</th>
                <th class="px-2 py-2 text-right">EV/EBITDA</th>
                <th class="px-2 py-2 text-right">PEG</th>
                <th class="px-2 py-2 text-right">P/S</th>
                <th class="px-2 py-2 text-right">{tl('Gross margin')}</th>
                <th class="px-2 py-2 text-right">{tl('Rev growth')}</th>
                <th class="px-3 py-2 text-right">%{tl('off high')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sym, f, offHigh }) => (
                <tr key={sym}
                  class={`border-t border-line ${sym === symbol ? 'bg-accent-soft' : 'hover:bg-surface-3'}`}>
                  <td class="px-3 py-[4px]">
                    <a href={`#/research/${sym.toLowerCase()}/financials`}
                       class={`hover:text-accent hover:no-underline ${sym === symbol ? 'text-accent font-bold' : 'text-ink'}`}>{sym}</a>
                  </td>
                  {/* ADR/foreign listings sometimes mix reporting currency into
                      these ratios (ASML EV/EBITDA "2654") — a screen full of
                      garbage beats a dash, so absurd values render as none */}
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.forwardPE != null && f.forwardPE < 500 ? fmtRatio(f.forwardPE) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.enterpriseToEbitda != null && f.enterpriseToEbitda < 500 ? fmtRatio(f.enterpriseToEbitda) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.pegRatio != null ? fmtRatio(f.pegRatio) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.priceToSalesTrailing12Months != null ? fmtRatio(f.priceToSalesTrailing12Months) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.grossMargins != null ? fmtFracPct(f.grossMargins) : '—'}</td>
                  <td class={`px-2 py-[4px] text-right ${(f.revenueGrowth ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>{f.revenueGrowth != null ? fmtFracPct(f.revenueGrowth) : '—'}</td>
                  <td class={`px-3 py-[4px] text-right ${offHigh != null && offHigh <= -15 ? 'text-down' : 'text-ink-2'}`}>{offHigh != null ? `${Math.round(offHigh)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

function CorporateActions({ symbol }) {
  const [divs, setDivs] = useState(null)
  const [splits, setSplits] = useState(null)
  useEffect(() => {
    setDivs(null); setSplits(null)
    fetchDivHistory(symbol).then(setDivs).catch(() => setDivs([]))
    fetchSplits(symbol).then(setSplits).catch(() => setSplits([]))
  }, [symbol])
  if (divs === null || splits === null) return null
  if (!divs.length && !splits.length) return null
  return (
    <SectionCard title={tl('Corporate actions')}>
      <div class="p-3 pt-2 font-mono text-[11px] flex flex-col gap-1">
        {splits.map((sp) => (
          <div key={sp.date} class="flex gap-3">
            <span class="text-muted w-20">{new Date(sp.date * 1000).toISOString().slice(0, 10)}</span>
            <span class="text-accent">{tl('split')} {sp.ratio}</span>
          </div>
        ))}
        {divs.slice(0, 8).map((d) => (
          <div key={d.date} class="flex gap-3">
            <span class="text-muted w-20">{new Date(d.date * 1000).toISOString().slice(0, 10)}</span>
            <span class="text-up">{tl('dividend')} ${+d.amount.toFixed(4)}</span>
          </div>
        ))}
        {divs.length > 8 && <span class="text-muted text-[10px]">… {divs.length - 8} {tl('more in the last 5y')}</span>}
      </div>
    </SectionCard>
  )
}

export function FinancialsView({ symbol }) {
  const [fa, setFa] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setFa(null); setErr('')
    // Hong Kong / mainland names: the exchange-filed statements through the
    // worker (Yahoo carries four annual points and one quarter for 0700.HK —
    // not a table). Same period shape, same rows, same growth math.
    ;(isCnListing(symbol) ? fetchCnFinancials(symbol) : fetchFinancials(symbol)).then(setFa).catch((e) => setErr(String(e.message || e)))
  }, [symbol])
  if (err) return <div class="px-1 font-mono text-[11px] text-down">{err}</div>
  if (fa === null) return <Loading label={tt('common.loading')} minH={320} />
  return (
    <div class="flex flex-col gap-3 max-w-6xl">
      <StatementTable title={`${tl('Quarterly')} · ${symbol}`} periods={fa.quarterly} />
      <StatementTable title={`${tl('Annual')} · ${symbol}`} periods={fa.annual} />
      <div class="grid gap-3 xl:grid-cols-[1fr_320px] items-start">
        <PeerComp symbol={symbol} />
        <CorporateActions symbol={symbol} />
      </div>
    </div>
  )
}
