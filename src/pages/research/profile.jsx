import { useState, useEffect } from 'preact/hooks'
import { getLocale, tl, t as tt } from '../../lib/i18n.js'
import { fetchCnProfile, isCnListing } from '../../lib/cnData.js'
import { fetchHistory } from '../../lib/history.js'
import { fetchProfile, fetchFundamentals } from '../../lib/fundamentals.js'
import { fmtPriceBare, fmtBig } from '../../lib/format.js'
import { SectionCard, useFetched } from './shared.jsx'

function DesSpark({ symbol }) {
  const [hist, setHist] = useState(null)
  useEffect(() => {
    setHist(null)
    fetchHistory(symbol, '1Y').then(setHist).catch(() => setHist({ bars: [] }))
  }, [symbol])
  const closes = hist?.bars?.map((b) => b.close) || []
  if (!closes.length) return <div class="h-[92px]" />
  const lo = Math.min(...closes)
  const hi = Math.max(...closes)
  const W = 200
  const H = 72
  const x = (i) => (i / (closes.length - 1)) * W
  const y = (v) => H - ((v - lo) / (hi - lo || 1)) * (H - 4) - 2
  const path = closes.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const up = closes[closes.length - 1] >= closes[0]
  const tone = up ? 'var(--color-up)' : 'var(--color-down)'
  return (
    <div class="flex flex-col gap-0.5">
      <div class="flex justify-between font-mono text-[8.5px] text-muted uppercase tracking-wider">
        <span>1Y</span><span>{fmtPriceBare(lo)} – {fmtPriceBare(hi)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} class="w-full h-[72px]" preserveAspectRatio="none">
        <path d={`${path} L${W},${H} L0,${H} Z`} fill={tone} opacity="0.08" />
        <path d={path} fill="none" stroke={tone} stroke-width="1.4" />
      </svg>
    </div>
  )
}

export function ProfileView({ symbol }) {
  const [p, failed] = useFetched(symbol, fetchProfile)
  const [f, setF] = useState(null)
  useEffect(() => {
    setF(null)
    fetchFundamentals(symbol).then(setF).catch(() => {})
  }, [symbol])
  // A zh reader's Hong Kong / mainland name gets the exchange-filed Chinese
  // profile (East Money via /cn/profile) in place of Yahoo's English prose;
  // the provider facts rail stays as the fallback for everything else
  const [cn, setCn] = useState(null)
  useEffect(() => {
    setCn(null)
    if (getLocale() !== 'zh' || !isCnListing(symbol)) return undefined
    let live = true
    fetchCnProfile(symbol).then((v) => { if (live) setCn(v) }).catch(() => {})
    return () => { live = false }
  }, [symbol])
  const summary = cn?.profile || p?.summary
  const business = cn?.business || ''
  if (failed || (p === null && failed)) {
    return <div class="px-1 font-mono text-[11px] text-muted">no profile for {symbol}</div>
  }
  if (p === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!p) return <div class="px-1 font-mono text-[11px] text-muted">no profile for {symbol}</div>
  return (
    <div class="max-w-5xl">
      {/* one DES card, bloomberg-style: prose column + facts rail beside it —
          two stacked cards left a dead column right of the text
          (Jeff 2026-08-05) */}
      <SectionCard title={tl('Description')}>
        <div class="p-4 pt-3 flex gap-6 max-md:flex-col">
          <div class="flex-1 min-w-0 flex flex-col gap-4 pl-1.5">
            {summary && (
              <p class="font-anth text-[12.5px] leading-[1.85] text-ink-2">{summary}</p>
            )}
            {business && (
              <div>
                <h3 class="font-anth font-bold text-[10px] tracking-wider text-muted uppercase pb-1">{tl('Business scope')}</h3>
                <p class="font-anth text-[11.5px] leading-[1.8] text-ink-2">{business}</p>
              </div>
            )}
            {/* management rides under the prose — a two-line description used
                to leave the whole column hollow (Jeff 2026-08-05) */}
            {p.officers.length > 0 && (
              <div>
                <h3 class="font-anth font-bold text-[10px] tracking-wider text-muted uppercase pb-1">{tl('Officers')}</h3>
                <table class="w-full border-collapse font-mono text-[11.5px]">
                  <tbody>
                    {p.officers.map((o) => (
                      <tr key={o.name} class="border-t border-line first:border-0">
                        <td class="py-[5px] pr-2 text-ink whitespace-nowrap">{o.name}</td>
                        <td class="px-2 py-[5px] text-muted">{o.title}</td>
                        <td class="py-[5px] pl-2 text-right text-ink-2 whitespace-nowrap">{o.pay != null ? fmtBig(o.pay) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div class="shrink-0 w-60 max-md:w-full flex flex-col gap-3 border-l border-line pl-4 max-md:border-l-0 max-md:pl-0 max-md:pt-3 max-md:border-t">
            <DesSpark symbol={symbol} />
            <dl class="font-mono text-[11.5px] flex flex-col gap-2">
              {[
                [tl('Sector'), p.sector, 'text-ink'],
                [tl('Industry'), cn?.industry || p.industry, 'text-ink-2'],
                [tl('Mkt cap'), f?.marketCap != null ? fmtBig(f.marketCap) : null, 'text-ink'],
                [tl('Employees'), p.employees ? p.employees.toLocaleString() : null, 'text-ink-2'],
              ].map(([label, value, toneCls]) => (
                <div key={label} class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">{label}</dt>
                  <dd class={toneCls}>{value || '—'}</dd>
                </div>
              ))}
              {(p.address || p.city) && (
                <div class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">{tl('HQ')}</dt>
                  {p.address && <dd class="text-ink-2">{p.address}</dd>}
                  <dd class="text-ink-2">{[p.city, p.state].filter(Boolean).join(', ')}{p.zip ? ` ${p.zip}` : ''}</dd>
                  {/* country reads as its own line, not run into the city */}
                  {p.country && <dd class="text-ink-2">{p.country}</dd>}
                </div>
              )}
              {p.phone && (
                <div class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">{tl('Phone')}</dt>
                  <dd class="text-ink-2">{p.phone}</dd>
                </div>
              )}
              {p.website && (
                <div class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">{tl('Website')}</dt>
                  <dd><a class="text-accent hover:underline" href={p.website} target="_blank" rel="noopener">{p.website.replace(/^https?:\/\//, '')}</a></dd>
                </div>
              )}
              {p.irWebsite && (
                <div class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">IR</dt>
                  <dd><a class="text-accent hover:underline" href={p.irWebsite} target="_blank" rel="noopener">{p.irWebsite.replace(/^https?:\/\//, '').slice(0, 34)}</a></dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
