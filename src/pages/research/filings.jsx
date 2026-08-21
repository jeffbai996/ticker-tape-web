import { useMemo, useState } from 'preact/hooks'
import { tl, t as tt } from '../../lib/i18n.js'
import { fetchFilings } from '../../lib/edgar.js'
import { SectionCard, useFetched } from './shared.jsx'

// Filings read by FAMILY, not by memorized form code — the chip color says
// "financials / event / insiders / proxy / registration" before the eye
// reaches the text (Jeff 2026-08-21: "freshen up, looks kinda borin").
const FAMILIES = [
  { key: 'periodic', label: 'Financials', match: /^(10-K|10-Q|20-F|40-F|11-K|ARS)/,
    chip: 'border-accent/50 text-accent bg-accent/10' },
  { key: 'event', label: 'Events', match: /^8-K/,
    chip: 'border-line-2 text-ink bg-surface-2' },
  { key: 'ownership', label: 'Insiders', match: /^(4|3|5)(\/|$)|^(SC 13|13F|13D|13G)/,
    chip: 'border-up/40 text-up bg-up/10' },
  { key: 'proxy', label: 'Proxy', match: /14A/,
    chip: 'border-accent-2/50 text-accent-2 bg-accent-2/10' },
  { key: 'registration', label: 'Registrations', match: /^(S-|F-|424)/,
    chip: 'border-down/30 text-down/90 bg-down/10' },
]
const OTHER = { key: 'other', label: 'Other', chip: 'border-line text-muted bg-surface-2' }

const familyOf = (form) => FAMILIES.find((f) => f.match.test(form)) || OTHER

const FRESH_DAYS = 14

export function FilingsView({ symbol }) {
  const [d, failed] = useFetched(symbol, fetchFilings)
  const [family, setFamily] = useState('all')
  const rows = d?.filings || []
  const counts = useMemo(() => {
    const c = new Map()
    for (const f of rows) {
      const k = familyOf(f.form).key
      c.set(k, (c.get(k) || 0) + 1)
    }
    return c
  }, [rows])
  if (failed) return <div class="px-1 font-mono text-[11px] text-muted">no SEC filings for {symbol}</div>
  if (d === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!rows.length) return <div class="px-1 font-mono text-[11px] text-muted">no SEC filings for {symbol}</div>

  const shown = family === 'all' ? rows : rows.filter((f) => familyOf(f.form).key === family)
  const freshCut = Date.now() - FRESH_DAYS * 86_400_000
  let lastYear = null

  return (
    <div class="flex flex-col gap-3 max-w-6xl">
      <SectionCard title={tl('SEC filings')}>
        {/* family filter doubles as the legend — the counts say at a glance
            what kind of company this is (8-K machine vs S- printer) */}
        <div class="flex flex-wrap items-center gap-1.5 px-3 pt-2 pb-1">
          <button type="button" onClick={() => setFamily('all')}
            class={`rounded-md border px-2 py-0.5 font-anth text-[10px] font-semibold transition-colors ${
              family === 'all' ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line-2 text-ink-2 hover:text-ink'}`}>
            {tl('All')} <span class="opacity-60">{rows.length}</span>
          </button>
          {[...FAMILIES, OTHER].filter((f) => counts.get(f.key)).map((f) => (
            <button key={f.key} type="button" onClick={() => setFamily(family === f.key ? 'all' : f.key)}
              class={`rounded-md border px-2 py-0.5 font-anth text-[10px] font-semibold transition-colors ${
                family === f.key ? f.chip : 'border-line-2 text-ink-2 hover:text-ink'}`}>
              {tl(f.label)} <span class="opacity-60">{counts.get(f.key)}</span>
            </button>
          ))}
        </div>
        <table class="w-full border-collapse font-mono text-[11px]">
          <tbody>
            {shown.map((f, i) => {
              const year = String(f.date || '').slice(0, 4)
              const divider = year !== lastYear
              lastYear = year
              const fam = familyOf(f.form)
              const fresh = f.date && new Date(`${f.date}T12:00:00Z`).getTime() > freshCut
              return (
                <>
                  {divider && (
                    <tr key={`y${year}`} class="border-t border-line-2">
                      <td colSpan={3} class="px-3 pt-2 pb-1 font-anth text-[9px] font-bold uppercase tracking-[0.18em] text-muted">{year}</td>
                    </tr>
                  )}
                  <tr key={i} class="border-t border-line/60 hover:bg-surface-3 group">
                    <td class="px-3 py-[5px] text-muted whitespace-nowrap w-24">
                      {f.date?.slice(5) || '—'}
                      {fresh && <span class="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" title={tl('filed in the last two weeks')} />}
                    </td>
                    <td class="px-2 py-[5px] whitespace-nowrap w-24">
                      <span class={`inline-block rounded border px-1.5 py-px font-anth text-[9.5px] font-bold ${fam.chip}`}>{f.form}</span>
                    </td>
                    <td class="px-3 py-[5px]">
                      {f.url
                        ? <a class="text-ink-2 group-hover:text-ink hover:text-accent" href={f.url} target="_blank" rel="noopener">{f.title || f.form}</a>
                        : <span class="text-ink-2">{f.title || '—'}</span>}
                      {f.exhibits.slice(0, 3).map((x) => (
                        <a key={x.url} class="ml-2 text-[9px] text-muted/70 hover:text-accent" href={x.url} target="_blank" rel="noopener">{x.type}</a>
                      ))}
                    </td>
                  </tr>
                </>
              )
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}
