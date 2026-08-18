import { tl, t as tt } from '../../lib/i18n.js'
import { fetchInsider, fetchHolders } from '../../lib/fundamentals.js'
import { fmtVol, fmtBig, fmtFracPct } from '../../lib/format.js'
import { Loading } from '../../components/Loading.jsx'
import { SectionCard, useFetched } from './shared.jsx'

function InsiderView({ symbol }) {
  const [rows, failed] = useFetched(symbol, fetchInsider)

  if (failed) {
    return (
      <div class="px-1 font-mono text-[11px] text-muted">
        {tt('research.no_insider', { sym: symbol })}
      </div>
    )
  }
  if (!rows) return <Loading label={tt('common.loading')} minH={240} />

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto max-w-4xl">
      <table class="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
            <th class="px-3 py-2 text-left">{tl('Date')}</th>
            <th class="px-2 py-2 text-left">{tl('Name')}</th>
            <th class="px-2 py-2 text-left">{tl('Role')}</th>
            <th class="px-2 py-2 text-left">{tl('Transaction')}</th>
            <th class="px-2 py-2 text-right">{tl('Shares')}</th>
            <th class="px-3 py-2 text-right">{tl('Value')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const sale = /sale/i.test(t.text || '')
            const buy = /purchase|buy/i.test(t.text || '')
            return (
              <tr key={i} class="border-t border-line hover:bg-surface-3">
                <td class="px-3 py-[4px] text-ink-2 whitespace-nowrap">
                  {t.date ? new Date(t.date).toISOString().slice(0, 10) : '—'}
                </td>
                <td class="px-2 py-[4px] text-ink whitespace-nowrap">{t.name}</td>
                <td class="px-2 py-[4px] text-muted whitespace-nowrap max-w-40 truncate">{t.relation}</td>
                <td class={`px-2 py-[4px] max-w-72 truncate ${sale ? 'text-down' : buy ? 'text-up' : 'text-ink-2'}`}>
                  {t.text || '—'}
                </td>
                <td class="px-2 py-[4px] text-right text-ink-2">{fmtVol(t.shares)}</td>
                <td class="px-3 py-[4px] text-right text-ink">{t.value != null ? fmtBig(t.value) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function HoldersView({ symbol }) {
  const [h, failed] = useFetched(symbol, fetchHolders)
  if (failed) return <div class="px-1 font-mono text-[11px] text-muted">no ownership data for {symbol}</div>
  if (h === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!h) return <div class="px-1 font-mono text-[11px] text-muted">no ownership data for {symbol}</div>
  return (
    <div class="flex flex-col gap-3">
      <SectionCard title={tl('Ownership')}>
        <div class="p-4 pt-3 font-mono text-[12px] flex flex-wrap gap-x-6 gap-y-1">
          <span><span class="text-muted">{tl('Institutions')}</span> <span class="text-ink">{h.institutionsPct != null ? fmtFracPct(h.institutionsPct) : '—'}</span>{h.institutionsCount != null && <span class="text-muted"> · {h.institutionsCount.toLocaleString()} {tl('holders')}</span>}</span>
          <span><span class="text-muted">{tl('Insiders')}</span> <span class="text-ink-2">{h.insidersPct != null ? fmtFracPct(h.insidersPct) : '—'}</span></span>
        </div>
      </SectionCard>
      {h.top.length > 0 && (
        <SectionCard title={tl('Top institutional holders')}>
          <table class="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
                <th class="px-3 py-2 text-left">{tl('Holder')}</th>
                <th class="px-2 py-2 text-right">{tl('% held')}</th>
                <th class="px-2 py-2 text-right">{tl('Shares')}</th>
                <th class="px-2 py-2 text-right">{tl('Value')}</th>
                <th class="px-3 py-2 text-right">{tl('Reported')}</th>
              </tr>
            </thead>
            <tbody>
              {h.top.map((o) => (
                <tr key={o.org} class="border-t border-line hover:bg-surface-3">
                  <td class="px-3 py-[4px] text-ink whitespace-nowrap max-w-56 truncate">{o.org}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{o.pctHeld != null ? fmtFracPct(o.pctHeld) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{o.position != null ? fmtVol(o.position) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{o.value != null ? fmtBig(o.value) : '—'}</td>
                  <td class="px-3 py-[4px] text-right text-muted whitespace-nowrap">{o.reportDate ? new Date(o.reportDate).toISOString().slice(0, 10) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  )
}

/** Bloomberg OWN: insiders and institutions on one page. */
export function OwnershipView({ symbol }) {
  return (
    <div class="flex flex-col gap-3">
      <HoldersView symbol={symbol} />
      <InsiderView symbol={symbol} />
    </div>
  )
}
