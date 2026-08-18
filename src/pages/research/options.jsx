import { useState, useEffect } from 'preact/hooks'
import { fetchOptions } from '../../lib/options.js'
import { bsDelta } from '../../lib/bs.js'
import { fmtPrice, fmtVol, fmtFracPct } from '../../lib/format.js'
import { tl, t as tt } from '../../lib/i18n.js'
import { consumePrefill } from './useResearchChart.js'

/** Mid price; falls back to last when the book is empty (after hours). */
function optMid(c) {
  if (c?.bid != null && c?.ask != null && (c.bid || c.ask)) return (c.bid + c.ask) / 2
  return c?.last ?? null
}

/** ATM straddle at the strike nearest spot — the market's own move estimate. */
function straddleSummary(chain) {
  if (chain?.spot == null) return null
  const strikes = chain.calls
    .map((c) => c.strike)
    .filter((k) => chain.puts.some((p) => p.strike === k))
  if (!strikes.length) return null
  const k = strikes.reduce((a, b) =>
    Math.abs(b - chain.spot) < Math.abs(a - chain.spot) ? b : a)
  const cm = optMid(chain.calls.find((c) => c.strike === k))
  const pm = optMid(chain.puts.find((p) => p.strike === k))
  if (cm == null || pm == null) return null
  return { strike: k, price: cm + pm, movePct: ((cm + pm) / chain.spot) * 100 }
}

function ExpiryPills({ expirations, active, onPick }) {
  const now = Date.now()
  return (
    <div class="flex gap-1 overflow-x-auto no-scrollbar min-w-0">
      {expirations.map((x) => {
        const dte = Math.max(0, Math.round((x * 1000 - now) / 86_400_000))
        const iso = new Date(x * 1000).toISOString()
        return (
          <button
            key={x}
            onClick={() => onPick(x)}
            class={x === active
              ? 'shrink-0 px-2 py-0.5 rounded-md border font-mono text-[10px] leading-tight border-accent-2 text-accent-2 bg-accent-2-soft'
              : 'shrink-0 px-2 py-0.5 rounded-md border font-mono text-[10px] leading-tight border-white/25 text-muted hover:text-ink hover:bg-surface-3'}
          >
            {/* month-day carries near expiries; LEAPs need the year */}
            {dte > 300 ? iso.slice(2, 10) : iso.slice(5, 10)}
            <span class="ml-1 text-[8.5px] opacity-70">{dte}d</span>
          </button>
        )
      })}
    </div>
  )
}

/** One butterfly ladder: calls mirrored on the left, puts on the right, the
 *  strike column as the shared spine. Rows join by strike so the eye reads
 *  one market instead of two tables that happen to be siblings. */
function OptionsLadder({ chain, t }) {
  const spot = chain.spot
  const byStrike = new Map()
  for (const c of chain.calls) byStrike.set(c.strike, { strike: c.strike, call: c })
  for (const p of chain.puts) {
    const row = byStrike.get(p.strike) || { strike: p.strike }
    row.put = p
    byStrike.set(p.strike, row)
  }
  let rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike)
  // ±12 strikes around spot keeps the ladder one screen tall
  if (spot != null) {
    const idx = rows.findIndex((r) => r.strike >= spot)
    const lo = Math.max(0, (idx === -1 ? rows.length : idx) - 12)
    rows = rows.slice(lo, lo + 24)
  }
  const crossIdx = spot != null ? rows.findIndex((r) => r.strike >= spot) : -1
  // Relative IV heat per side: hot = top quartile in view. A static threshold
  // can't work across names — 40% IV is sleepy on some, wild on others.
  const heat = (side) => {
    const ivs = rows.map((r) => r[side]?.iv).filter((v) => v != null).sort((a, b) => a - b)
    return ivs.length >= 8 ? ivs[Math.floor(ivs.length * 0.75)] : null
  }
  const ivHot = { call: heat('call'), put: heat('put') }
  const maxOi = Math.max(...rows.flatMap((r) => [r.call?.oi || 0, r.put?.oi || 0]), 1)

  const sideTds = (row, side) => {
    const c = row[side]
    const itm = spot != null
      && (side === 'call' ? row.strike < spot : row.strike > spot)
    const wash = itm ? 'bg-accent-soft/30' : ''
    const delta = c ? bsDelta({ spot, strike: row.strike, t, iv: c.iv, type: side }) : null
    const ad = delta != null ? Math.abs(delta) : null
    // Hierarchy by tradability: the 0.35–0.65 belly pops, deep ITM reads
    // solid, far OTM recedes.
    const deltaCls =
      ad == null ? 'text-muted'
      : ad >= 0.35 && ad <= 0.65 ? 'text-accent'
      : ad > 0.85 ? 'text-ink' : 'text-muted'
    const hotIv = ivHot[side] != null && c?.iv != null && c.iv >= ivHot[side]
    const unusual = c?.volume != null && c?.oi > 0 && c.volume > c.oi
    const oiPct = Math.round(((c?.oi || 0) / maxOi) * 100)
    // OI depth grows outward from the strike spine, mirrored per side.
    // rgba is --color-accent at 0.10; inline because a per-row percent
    // can't be a Tailwind class.
    const oiFill = c?.oi
      ? { background: `linear-gradient(to ${side === 'call' ? 'left' : 'right'}, rgba(245,158,11,0.10) ${oiPct}%, transparent ${oiPct}%)` }
      : undefined
    const cells = [
      <td key="oi" class={`px-2 py-[2px] text-right text-muted max-lg:hidden ${wash}`} style={oiFill}>{c?.oi ?? '—'}</td>,
      <td key="vol" class={`px-2 py-[2px] text-right max-lg:hidden ${unusual ? 'text-accent font-bold' : 'text-muted'} ${wash}`}>{c?.volume ?? '—'}</td>,
      <td key="delta" class={`px-2 py-[2px] text-right ${deltaCls} ${wash}`}>{delta != null ? delta.toFixed(2) : '—'}</td>,
      <td key="iv" class={`px-2 py-[2px] text-right max-sm:hidden ${hotIv ? 'text-accent' : 'text-ink-2'} ${wash}`}>{fmtFracPct(c?.iv, 0)}</td>,
      <td key="bid" class={`px-2 py-[2px] text-right text-up/90 ${wash}`}>{c?.bid != null ? fmtPrice(c.bid) : '—'}</td>,
      <td key="ask" class={`px-2 py-[2px] text-right text-down/90 ${wash}`}>{c?.ask != null ? fmtPrice(c.ask) : '—'}</td>,
    ]
    return side === 'call' ? cells : cells.reverse()
  }

  const head = (side) => {
    const cells = [
      <th key="oi" class="px-2 py-1.5 text-right max-lg:hidden">{tl('OI')}</th>,
      <th key="vol" class="px-2 py-1.5 text-right max-lg:hidden">{tl('Vol')}</th>,
      <th key="delta" class="px-2 py-1.5 text-right">Δ</th>,
      <th key="iv" class="px-2 py-1.5 text-right max-sm:hidden">{tl('IV')}</th>,
      <th key="bid" class="px-2 py-1.5 text-right">{tl('Bid')}</th>,
      <th key="ask" class="px-2 py-1.5 text-right">{tl('Ask')}</th>,
    ]
    return side === 'call' ? cells : cells.reverse()
  }

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
      <header class="flex items-center justify-between px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-up uppercase">{tl('Calls')}</h2>
        {spot != null && (
          <span class="font-mono text-[10px] text-muted">{tl('spot')} {fmtPrice(spot)}</span>
        )}
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-down uppercase">{tl('Puts')}</h2>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse font-mono text-[10.5px]">
          <thead>
            <tr class="text-[9px] text-muted uppercase tracking-wider bg-surface-2/60">
              {head('call')}
              <th class="px-2.5 py-1.5 text-center text-ink bg-surface-2">{tl('Strike')}</th>
              {head('put')}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <>
                {i === crossIdx && i > 0 && (
                  <tr key={`spot-${row.strike}`}>
                    <td colSpan={13} class="p-0 border-0">
                      <div class="relative h-[13px]">
                        <div class="absolute inset-x-0 top-1/2 border-t border-accent/60" />
                        <span class="absolute left-1/2 -translate-x-1/2 top-0 px-1.5 bg-surface-1 font-mono text-[9px] leading-[13px] text-accent">
                          {fmtPrice(spot)}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                <tr key={row.strike} class="border-t border-line hover:bg-surface-3">
                  {sideTds(row, 'call')}
                  <td class="px-2.5 py-[2px] text-center font-bold text-ink bg-surface-2/60 border-x border-line-2">
                    {fmtPrice(row.strike)}
                  </td>
                  {sideTds(row, 'put')}
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function OptionsView({ symbol }) {
  const [expiration, setExpiration] = useState(null)
  const [chain, setChain] = useState(null)
  const [err, setErr] = useState(null)
  // `opt SYM 2026-09-18` from the command bar: hold the wanted date until the
  // chain arrives, then snap to the exact expiry or the first one after it.
  const [wantDate, setWantDate] = useState(() => consumePrefill('opt_expiry'))
  useEffect(() => {
    const onExpiry = (e) => { setWantDate(e.detail); sessionStorage.removeItem('opt_expiry') }
    window.addEventListener('tape:opt-expiry', onExpiry)
    return () => window.removeEventListener('tape:opt-expiry', onExpiry)
  }, [])

  useEffect(() => {
    setChain(null)
    setErr(null)
    fetchOptions(symbol, expiration)
      .then(setChain)
      .catch((e) => setErr(String(e.message || e)))
  }, [symbol, expiration])

  useEffect(() => {
    if (!chain || !wantDate || !chain.expirations?.length) return
    const iso = (x) => new Date(x * 1000).toISOString().slice(0, 10)
    const hit = chain.expirations.find((x) => iso(x) >= wantDate)
      || chain.expirations[chain.expirations.length - 1]
    setWantDate(null)
    if (hit !== chain.expiration) setExpiration(hit)
  }, [chain])

  if (err) {
    return (
      <div class="mx-1 px-3 py-2 bg-surface-1 border border-down/40 rounded-lg font-mono text-[11px] text-down">
        {tt('research.no_options_chain', { error: err })}
      </div>
    )
  }
  if (!chain) return <div class="px-2 font-mono text-[11px] text-muted">{tl('loading chain…')}</div>

  const t = Math.max((chain.expiration * 1000 - Date.now()) / (365 * 86_400_000), 1 / 365)
  const straddle = straddleSummary(chain)

  return (
    <div class="min-w-0">
      <div class="px-1 pb-2 min-w-0">
        <ExpiryPills
          expirations={chain.expirations}
          active={chain.expiration}
          onPick={setExpiration}
        />
      </div>
      {straddle && (
        <div class="px-1 pb-2 font-mono text-[10.5px] text-ink-2">
          {tl('ATM')} {fmtPrice(straddle.strike)} {tl('straddle')}{' '}
          <span class="text-ink font-semibold">{fmtPrice(straddle.price)}</span>
          {' '}· {tl('market prices a')}{' '}
          <span class="text-accent font-semibold">±{straddle.movePct.toFixed(1)}%</span>{' '}
          {tl('move by')} {new Date(chain.expiration * 1000).toISOString().slice(5, 10)}
        </div>
      )}
      <OptionsLadder chain={chain} t={t} />
    </div>
  )
}
