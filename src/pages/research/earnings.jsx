import { useState, useEffect } from 'preact/hooks'
import { tl, t as tt } from '../../lib/i18n.js'
import { fetchEarningsImpact, reconcileQuarters } from '../../lib/earnings.js'
import { fmtPct } from '../../lib/format.js'
import { Loading } from '../../components/Loading.jsx'

function SummaryStat({ label, value, tone }) {
  return (
    <div class="flex flex-col gap-0.5 px-3 py-2">
      <span class="text-[9px] text-muted uppercase tracking-wider">{label}</span>
      <span class={`font-mono text-[13px] ${tone || 'text-ink'}`}>{value}</span>
    </div>
  )
}

export function EarningsView({ symbol }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let dead = false
    setData(null)
    setFailed(false)
    fetchEarningsImpact(symbol)
      .then((d) => { if (!dead) setData(d) })
      .catch(() => { if (!dead) setFailed(true) })
    return () => { dead = true }
  }, [symbol])

  if (failed) {
    return (
      <div class="px-1 font-mono text-[11px] text-muted">
        {tt('research.no_earnings', { sym: symbol })}
      </div>
    )
  }
  if (!data) return <Loading label={tt('common.loading')} minH={240} />
  if (!data.events.length) {
    return <div class="px-1 font-mono text-[11px] text-muted">no reported quarters for {symbol}</div>
  }

  const s = data.summary
  const pctTone = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')
  const rows = reconcileQuarters(data.events)
  const anyPeers = rows.some((e) => e.peers?.length)

  return (
    <div class="flex flex-col gap-3">
      <section class="bg-surface-1 border border-line rounded-xl flex flex-wrap divide-x divide-line">
        <SummaryStat
          label={tl('Beat rate')}
          value={s.beatRate != null ? `${Math.round(s.beatRate * 100)}% (${s.beats}/${s.total})` : '—'}
        />
        <SummaryStat label={tl('Beat streak')} value={`${s.beatStreak}q`} />
        <SummaryStat
          label={tl('Avg surprise')}
          value={s.avgSurprise != null ? fmtPct(s.avgSurprise * 100) : '—'}
          tone={pctTone(s.avgSurprise)}
        />
        <SummaryStat
          label={tl('Avg reaction')}
          value={s.avgMove != null ? fmtPct(s.avgMove) : '—'}
          tone={pctTone(s.avgMove)}
        />
      </section>

      <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto">
        <table class="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
              <th class="px-3 py-2 text-left">{tl('Quarter')}</th>
              <th class="px-2 py-2 text-left">{tl('Reported')}</th>
              <th class="px-2 py-2 text-right">{tl('EPS est')}</th>
              <th class="px-2 py-2 text-right">{tl('EPS act')}</th>
              <th class="px-2 py-2 text-right">{tl('Surprise')}</th>
              <th class="px-2 py-2 text-right">{tl('Reaction')}</th>
              {anyPeers && <th class="px-3 py-2 text-left">{tl('Peers')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={`${e.quarter ?? ''}-${e.report ?? ''}`} class="border-t border-line hover:bg-surface-3">
                <td class={`px-3 py-[3px] whitespace-nowrap ${e.quarterInferred ? 'text-muted italic' : 'text-ink-2'}`}
                    title={e.quarterInferred ? 'fiscal quarter inferred from the report date' : undefined}>
                  {e.quarter ? new Date(e.quarter).toISOString().slice(0, 10) : '—'}
                </td>
                <td class={`px-2 py-[3px] whitespace-nowrap ${e.reportInferred ? 'text-muted italic' : 'text-muted'}`}
                    title={e.reportInferred ? 'estimated from this name’s typical reporting lag' : undefined}>
                  {e.report
                    ? `${e.reportInferred ? '~' : ''}${new Date(e.report).toISOString().slice(0, 10)}`
                    : '—'}
                </td>
                <td class="px-2 py-[3px] text-right text-ink-2">{e.epsEstimate != null ? e.epsEstimate.toFixed(2) : '—'}</td>
                <td class="px-2 py-[3px] text-right text-ink">{e.epsActual.toFixed(2)}</td>
                <td class={`px-2 py-[3px] text-right ${pctTone(e.surprisePct)}`}>
                  {e.surprisePct != null ? fmtPct(e.surprisePct * 100) : '—'}
                </td>
                <td class={`px-2 py-[3px] text-right ${pctTone(e.priceMove)}`}>
                  {e.priceMove != null ? fmtPct(e.priceMove) : '—'}
                </td>
                {anyPeers && (
                  <td class="px-3 py-[3px] whitespace-nowrap">
                    {e.peers?.length
                      ? e.peers.map((p) => (
                          <span key={p.sym} class="mr-2">
                            <span class="text-muted">{p.sym}</span>{' '}
                            <span class={pctTone(p.move)}>{fmtPct(p.move)}</span>
                          </span>
                        ))
                      : ''}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div class="px-3 py-1.5 border-t border-line text-[9px] text-muted">
          {tt('earn.note')}
        </div>
      </section>
    </div>
  )
}
