import { tl, t as tt } from '../../lib/i18n.js'
import { fetchFilings } from '../../lib/edgar.js'
import { SectionCard, useFetched } from './shared.jsx'

const FORM_TONE = (form) =>
  /^(10-K|10-Q|8-K)/.test(form) ? 'text-accent font-medium'
    : /^(4|SC 13|13F)/.test(form) ? 'text-ink' : 'text-ink-2'

export function FilingsView({ symbol }) {
  const [d, failed] = useFetched(symbol, fetchFilings)
  if (failed) return <div class="px-1 font-mono text-[11px] text-muted">no SEC filings for {symbol}</div>
  if (d === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!d.filings.length) return <div class="px-1 font-mono text-[11px] text-muted">no SEC filings for {symbol}</div>
  return (
    <div class="flex flex-col gap-3 max-w-6xl">
      <SectionCard title={tl('SEC filings')}>
        <table class="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
              <th class="px-3 py-2 text-left">{tl('Filed')}</th>
              <th class="px-2 py-2 text-left">{tl('Form')}</th>
              <th class="px-3 py-2 text-left">{tl('Title')}</th>
            </tr>
          </thead>
          <tbody>
            {d.filings.map((f, i) => (
              <tr key={i} class="border-t border-line hover:bg-surface-3">
                <td class="px-3 py-[4px] text-muted whitespace-nowrap">{f.date}</td>
                <td class={`px-2 py-[4px] whitespace-nowrap ${FORM_TONE(f.form)}`}>{f.form}</td>
                <td class="px-3 py-[4px]">
                  {f.url
                    ? <a class="text-ink-2 hover:text-accent" href={f.url} target="_blank" rel="noopener">{f.title || f.form}</a>
                    : <span class="text-ink-2">{f.title || '—'}</span>}
                  {f.exhibits.slice(0, 3).map((x) => (
                    <a key={x.url} class="ml-2 text-[10px] text-muted hover:text-accent" href={x.url} target="_blank" rel="noopener">{x.type}</a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}
