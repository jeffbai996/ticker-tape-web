import { useEffect, useRef, useState } from 'preact/hooks'
import {
  wireUrl, setWireUrl, fragwireHome, fetchEvents, fetchUpdates, fetchToday, fetchMeta,
  demoBackfill, demoEvent, demoToday, rankEvents, collapseSessions, clusterStories,
  srcCred, evHeadline, evBody, matchesWireQuery,
} from '../lib/wire.js'
import { IS_PRIVATE_BUILD } from '../lib/nav.js'
import { prefetchSymbol } from '../lib/history.js'
import { useEscape } from '../hooks.js'
import { Empty, Loading } from '../components/Loading.jsx'
import { getLocale, t as tt, tl } from '../lib/i18n.js'

// fragwire's relevance ramp, same colors as its pills: T1 sector (blue),
// T2 core thesis (amber), T3 thesis on a name you hold (red).
function tierOf(ev, watchset) {
  const th = (ev.meta || {}).thesis || 0
  const onBook = (ev.symbols || []).some((s) => watchset.has(s))
    || ev.type === 'price_move'
  const t = th >= 2 && onBook ? 3 : th
  // content mills never make T3 — directional dogshit stays T2 at best
  // (Jeff 2026-08-09: "dont allow shitty red dot news like motley fool
  // to be marked a T3")
  return srcCred(ev) < 1 ? Math.min(t, 2) : t
}

const TIER_CLS = {
  1: 'text-[#58a6ff] border-[#58a6ff]/50',
  2: 'bg-accent text-black border-accent',
  3: 'bg-[#f85149] text-black border-[#f85149]',
}

function TierBadge({ tier }) {
  if (!tier) return null
  return (
    <span class={`inline-block align-middle mr-1.5 border rounded-[2px] px-1 font-mono font-bold text-[8.5px] tracking-wider leading-[1.6] ${TIER_CLS[tier]}`}
      title={tl(tier === 3 ? 'T3 — thesis story on a name you hold'
        : tier === 2 ? 'T2 — core thesis story' : 'T1 — touches the sector')}>
      T{tier}
    </span>
  )
}

/** A tagged symbol is a route into research, not decoration. The row itself
 *  toggles open on click, so each link has to stop the event escaping. */
function SymbolLink({ sym }) {
  return (
    <a href={`#/research/${sym.toLowerCase()}`}
       onClick={(e) => e.stopPropagation()}
       onMouseEnter={() => prefetchSymbol(sym)}
       class="hover:no-underline">
      {sym}
    </a>
  )
}

const FILTERS = [
  { id: '', label: 'all' },
  { id: 'earnings_release', label: 'earnings' },
  { id: 'filing', label: 'filings' },
  { id: 'headline', label: 'headlines' },
  { id: 'fed_speech,fed_headline,macro_print', label: 'macro + fed' },
  { id: 'transcript_chunk,digest', label: 'live audio' },
]

const hhmmss = (ts) =>
  new Date(ts * 1000).toLocaleTimeString('en-US', { hour12: false })

// under 24h → clock time (fresh even if yesterday); older → the date
const rowTime = (ts) => Date.now() / 1000 - ts < 86400
  ? hhmmss(ts)
  : new Date(ts * 1000).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })

const countdown = (sec) => {
  if (getLocale() === 'zh') {
    if (sec <= 0) return '现在'
    if (sec < 3600) return `${Math.round(sec / 60)}分钟后`
    if (sec < 86400) return `${(sec / 3600).toFixed(1)}小时后`
    return `${Math.round(sec / 86400)}天后`
  }
  if (sec <= 0) return 'now'
  if (sec < 3600) return `in ${Math.round(sec / 60)}m`
  if (sec < 86400) return `in ${(sec / 3600).toFixed(1)}h`
  return `in ${Math.round(sec / 86400)}d`
}

// tier → left edge: the ramp reads at a glance without reading the badge
const TIER_EDGE = {
  1: 'border-l-[#58a6ff]/70', 2: 'border-l-accent', 3: 'border-l-[#f85149]',
}

/** Extracted article text for an expanded row — fragwire's /api/read does
 *  the fetching/extraction server-side (fast=1: text now, no summarizer).
 *  Only fires on wire events that have a URL but shipped no body. */
function ReadBody({ ev }) {
  const [state, setState] = useState({ status: 'loading', paras: [] })
  useEffect(() => {
    let dead = false
    const base = wireUrl()
    if (!base || ev.demo) { setState({ status: 'off', paras: [] }); return }
    fetch(`${base.replace(/\/$/, '')}/api/read?id=${ev.id}&fast=1`,
      { signal: AbortSignal.timeout(20_000) })
      .then((r) => r.json())
      .then((out) => {
        if (dead) return
        const text = out.ok ? (out.text || out.summary || '') : ''
        const paras = String(text).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)
        setState({ status: paras.length ? 'ok' : 'empty', paras })
      })
      .catch(() => !dead && setState({ status: 'empty', paras: [] }))
    return () => { dead = true }
  }, [ev.id])
  if (state.status === 'off') return null
  if (state.status === 'loading') {
    return <Loading label={tl('pulling the story…')} />
  }
  if (state.status === 'empty') {
    return (
      <p class="text-[10.5px] font-mono text-muted pt-1">
        {tl("source wouldn't give up its text —")}{' '}
        <a href={ev.url} target="_blank" rel="noopener"
           class="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          {tl('open the page ↗')}
        </a>
      </p>
    )
  }
  return (
    <div class="flex flex-col gap-1.5 pt-1 max-w-[74ch]">
      {state.paras.slice(0, 14).map((para, i) => (
        <p key={i} class="text-[11.5px] leading-relaxed text-ink-2 font-anth">{para}</p>
      ))}
      {state.paras.length > 14 && (
        <p class="text-[10px] font-mono text-muted">
          …{' '}
          <a href={ev.url} target="_blank" rel="noopener"
             class="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
            {tl('full text at the source ↗')}
          </a>
        </p>
      )}
    </div>
  )
}

/** Short source tag ("wsj", "reuters") for rows with no tagged symbol —
 *  a column of dashes says nothing. Aggregator rows use the headline tail. */
const SOURCE_ALIAS = {
  prnewswire: 'prn', globenewswire: 'gnw', businesswire: 'bw',
  seekingalpha: 'sa', marketwatch: 'mw', bloomberg: 'bbg', barrons: 'barrons',
  investors: 'ibd', finance: 'yahoo',
}

function sourceTag(ev) {
  try {
    const host = new URL(ev.url).hostname.replace(/^www\./, '')
    if (host === 'news.google.com') {
      const m = ev.headline.match(/ [-–] ([^-–]{2,40})$/)
      if (m) return m[1].trim().split(/\s+/)[0].toLowerCase().slice(0, 8)
    }
    const stem = host.split('.')[0]
    return SOURCE_ALIAS[stem] || stem.slice(0, 8)
  } catch { return ev.source ? String(ev.source).slice(0, 8) : '' }
}

/** fragwire's source-credibility pips: ●●● wires/majors (green), ●● standard
 *  (amber), ● SEO content mill (red). Self-made rows carry no source to rate. */
function CredPips({ ev, hot }) {
  const selfMade = ['prices', 'brief', 'wrap'].includes(ev.source)
    || ['price_move', 'brief', 'digest', 'transcript_chunk'].includes(ev.type)
  if (selfMade) return null
  const c = srcCred(ev)
  return (
    <span
      class={`inline-block align-middle mr-1.5 font-mono text-[6.5px] tracking-[0.5px] ${
        hot ? 'text-black/60' : c >= 1.25 ? 'text-up' : c < 1 ? 'text-down opacity-75' : 'text-accent'}`}
      title={tl(c >= 1.25 ? 'source: top tier (wires/majors)'
        : c < 1 ? 'source: low tier (SEO/content mill)' : 'source: standard')}
    >
      {c >= 1.25 ? '●●●' : c < 1 ? '●' : '●●'}
    </span>
  )
}

function Row({ ev, hot, open, onToggle, tier = 0 }) {
  const lat = ev.ts_seen - ev.ts_event
  const latTxt = lat > 0.5 && lat < 600 ? `+${lat.toFixed(1)}s` : ''
  const loc = getLocale()
  const hl = evHeadline(ev, loc)
  const body = evBody(ev, loc)
  return (
    <div
      id={`ev-${ev.id}`}
      class={`border-b border-line/30 border-l-2 font-mono transition-colors cursor-pointer ${
        hot ? 'duration-1000 bg-accent text-black border-l-transparent'
          : `duration-100 ${TIER_EDGE[tier] || 'border-l-transparent'} ${open ? 'bg-surface-1' : 'hover:bg-accent-soft'}`
      }`}
      onClick={onToggle}
    >
      {/* Phone width: meta on line 1, headline unclipped on line 2 — a 10-char
          truncated headline defeats the point of a wire. */}
      {/* Lag column is a fixed narrow track, not `auto`. As auto it sized to
            the widest string in view and sat hard against the right edge with
            the 1fr headline pushing it there, so it read as a wide empty column
            (Jeff 2026-08-07). 58px fits "+3m 11s" with a hair either side. */}
      <div class="grid grid-cols-[64px_56px_36px_1fr_58px] max-sm:grid-cols-[64px_auto_auto_1fr] gap-x-2.5 items-baseline px-2.5 py-[3px] text-[12px] leading-[1.55]">
        <span class={hot ? '' : 'text-muted'}>{rowTime(ev.ts_event)}</span>
        {(ev.symbols || []).length ? (
          <span class={`truncate ${hot ? 'font-semibold' : 'text-accent font-medium'}`}>
            {/* array, not a fragment: the key has to ride the link itself */}
            {ev.symbols.map((sym, i) => [i > 0 ? ' ' : null, <SymbolLink key={sym} sym={sym} />])}
          </span>
        ) : (
          <span class={`truncate text-[10.5px] ${hot ? '' : 'text-muted'}`}>{sourceTag(ev)}</span>
        )}
        <span data-wire-credibility class="flex items-center h-full" title={tl('source credibility')}>
          <CredPips ev={ev} hot={hot} />
        </span>
        <span
          class={`truncate max-sm:whitespace-normal max-sm:line-clamp-2 max-sm:col-span-full max-sm:row-start-2 ${hot ? '' : ev.type === 'earnings_release' ? 'text-ink font-semibold' : 'text-ink-2'}`}
          title={hl}
        >
          {!hot && <TierBadge tier={tier} />}
          <span class={tier === 3 && !hot ? 'text-ink font-semibold' : ''}>{hl}</span>
          {ev.story_cluster && <span class="text-accent font-bold"> ×{ev.story_cluster.count}</span>}
          {ev.url && (
            <a href={ev.url} target="_blank" rel="noopener"
              onClick={(e) => e.stopPropagation()}
              title={(() => { try { return new URL(ev.url).hostname.replace('www.', '') } catch { return tl('open source') } })()}
              class={`inline-grid place-items-center align-middle ml-1.5 w-[15px] h-[15px] rounded-[3px] border text-[9px] leading-none hover:no-underline ${
                hot ? 'border-black/40 text-black' : 'border-line-2 text-muted hover:text-accent hover:border-accent/60'}`}>↗</a>
          )}
        </span>
        <span class={`text-[10.5px] text-right px-0.5 tabular-nums max-sm:row-start-1 max-sm:col-start-4 max-sm:justify-self-end ${hot ? '' : lat < 60 ? 'text-up' : 'text-muted'}`}>{latTxt}</span>
      </div>
      {open && ev.story_cluster && (
        <div class="px-2.5 pb-2 pl-[168px] max-sm:pl-2.5 flex flex-col gap-0.5">
          <p class="text-[8.5px] uppercase tracking-wider text-muted">{tt('wire.story_outlets', { count: ev.story_cluster.count })}</p>
          {ev.story_cluster.members.map((m) => (
            <p key={m.id} class="text-[11.5px] font-mono truncate">
              <span class="text-muted text-[9.5px] mr-1.5">{(() => { try { return new URL(m.url).hostname.replace('www.', '') } catch { return m.source } })()}</span>
              <a href={m.url} target="_blank" rel="noopener" class="text-ink-2 hover:text-accent" onClick={(e) => e.stopPropagation()}>{m.headline}</a>
            </p>
          ))}
        </div>
      )}
      {open && ev.live_call && (
        <div class="px-2.5 pb-2 pl-[168px] max-sm:pl-2.5 flex flex-col gap-1.5">
          {ev.live_call.digests.map((dg) => (
            <p key={dg.id} class="text-[11.5px] leading-relaxed text-ink-2 max-w-[72ch] border-l-2 border-accent pl-2.5">
              <span class="text-[8.5px] uppercase tracking-wider text-muted mr-1.5">{tt('wire.digest_number', { number: (dg.meta || {}).digest_n || '' })}</span>
              {dg.body}
            </p>
          ))}
          {ev.live_call.tail.length > 0 && (
            <div>
              <p class="text-[8.5px] uppercase tracking-wider text-muted">{tl('latest audio')}</p>
              {ev.live_call.tail.map((c) => (
                <p key={c.id} class="text-[11px] leading-relaxed text-muted max-w-[72ch]">{c.body}</p>
              ))}
            </div>
          )}
        </div>
      )}
      {open && !ev.live_call && (
        <div class="px-2.5 pb-2 mx-auto w-full max-w-[78ch]">
          <h3 class="font-anth font-semibold text-[15px] leading-snug text-ink pt-1.5 pb-1">{hl}</h3>
          {Object.keys(ev.numbers || {}).length > 0 && (
            <div class="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
              {Object.entries(ev.numbers).map(([k, v]) => (
                <span key={k} class="border border-line rounded px-2 py-0.5">
                  <span class="block text-[8.5px] uppercase tracking-wider text-muted">{k.replace(/_/g, ' ')}</span>
                  <span class="text-[11.5px] font-semibold text-accent">{v}</span>
                </span>
              ))}
            </div>
          )}
          {body && <p class="text-[11.5px] leading-relaxed text-ink-2 max-w-[72ch] whitespace-pre-wrap">{body}</p>}
          {!ev.body && !ev.story_cluster && ev.url && <ReadBody ev={ev} />}
          {/* info reads dim, clickable reads amber — everything grey made the
              links invisible (Jeff 2026-08-05) */}
          <p class="text-[9.5px] font-mono pt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line/40 mt-1.5">
            <span class="text-ink-2">{new Date(ev.ts_event * 1000).toLocaleString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
            {latTxt && <span class="text-muted">{tl('tape latency')}{' '}<span class="text-ink-2">{latTxt}</span></span>}
            <span class="uppercase tracking-wider text-muted">{String(ev.type).replace(/_/g, ' ')}</span>
            {ev.url && (() => {
              try {
                const host = new URL(ev.url).hostname.replace('www.', '')
                // aggregator links carry the true source in the headline tail
                const m = host === 'news.google.com' && ev.headline.match(/ [-–] ([^-–]{2,40})$/)
                const label = m ? m[1].trim() : host
                return (
                  <a href={ev.url} target="_blank" rel="noopener"
                     class="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                    {label} ↗
                  </a>
                )
              } catch { return null }
            })()}
          </p>
        </div>
      )}
    </div>
  )
}

const FragwireLogo = () => (
  <svg class="w-[20px] h-[15px]" viewBox="0 0 82 64" aria-hidden="true"><g fill="#f59e0b"><circle cx="52.78" cy="44.00" r="2.6"/><circle cx="48.97" cy="48.97" r="2.6"/><circle cx="44.00" cy="52.78" r="2.6"/><circle cx="38.21" cy="55.18" r="2.6"/><circle cx="32.00" cy="56.00" r="2.6"/><circle cx="25.79" cy="55.18" r="2.6"/><circle cx="20.00" cy="52.78" r="2.6"/><circle cx="15.03" cy="48.97" r="2.6"/><circle cx="11.22" cy="44.00" r="2.6"/><circle cx="8.82" cy="38.21" r="2.6"/><circle cx="8.00" cy="32.00" r="2.6"/><circle cx="8.82" cy="25.79" r="2.6"/><circle cx="11.22" cy="20.00" r="2.6"/><circle cx="15.03" cy="15.03" r="2.6"/><circle cx="20.00" cy="11.22" r="2.6"/><circle cx="25.79" cy="8.82" r="2.6"/><circle cx="32.00" cy="8.00" r="2.6"/><circle cx="38.21" cy="8.82" r="2.6"/><circle cx="44.00" cy="11.22" r="2.6"/><circle cx="48.97" cy="15.03" r="2.6"/><circle cx="52.78" cy="20.00" r="2.6"/><circle cx="62" cy="32" r="2.6"/><circle cx="70" cy="32" r="2.1"/><circle cx="77" cy="32" r="1.6"/><circle cx="32" cy="32" r="4.2"/></g></svg>
)

function Panel({ title, children, action = null }) {
  return (
    <section class="border border-line rounded-lg bg-surface overflow-hidden">
      <h3 class="flex items-center px-2.5 py-1 border-b border-line font-mono text-[9.5px] uppercase tracking-[.12em] text-muted">
        {title}
        {action && <span class="ml-auto">{action}</span>}
      </h3>
      <div class="px-2.5 py-1.5">{children}</div>
    </section>
  )
}

function Rail({ today, now, events, watchset, onHide }) {
  const sessions = (today?.sessions || []).filter((s) => s.status !== 'failed')
  const live = sessions.filter((s) => ['armed', 'capturing'].includes(s.status))

  // last-hour tape reads, computed off the buffer the page already holds
  const hourAgo = now - 3600
  const lastHour = events.filter((e) => e.ts_event >= hourAgo)
  const symCount = new Map()
  for (const e of events) {
    for (const sym of e.symbols || []) symCount.set(sym, (symCount.get(sym) || 0) + 1)
  }
  const hotSyms = [...symCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const srcCount = new Map()
  for (const e of events) {
    if (!e.url) continue
    try {
      const h = new URL(e.url).hostname.replace('www.', '')
      srcCount.set(h, (srcCount.get(h) || 0) + 1)
    } catch { /* bad url */ }
  }
  const topSrc = [...srcCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <aside data-wire-rail class="flex flex-col gap-2 w-[clamp(260px,24vw,340px)] shrink-0 min-w-0 min-h-0 overflow-y-auto overscroll-contain max-lg:w-full max-lg:overflow-visible">
      <Panel title={tl('tape')} action={
        <button onClick={onHide} title={tl('hide the side panels')}
          class="text-muted hover:text-accent leading-none px-1 -mr-1 font-mono text-[11px]">
          »
        </button>
      }>
        <div class="grid grid-cols-3 gap-1 py-0.5 font-mono text-center">
          <div><div class="text-[15px] font-semibold text-ink">{events.length}</div>
            <div class="text-[8.5px] uppercase tracking-wider text-muted">{tl('buffered')}</div></div>
          <div><div class="text-[15px] font-semibold text-accent">{lastHour.length}</div>
            <div class="text-[8.5px] uppercase tracking-wider text-muted">{tl('last hour')}</div></div>
          <div><div class="text-[15px] font-semibold text-ink">{symCount.size}</div>
            <div class="text-[8.5px] uppercase tracking-wider text-muted">{tl('symbols')}</div></div>
        </div>
      </Panel>
      {hotSyms.length > 0 && (
        <Panel title={tl('most mentioned')}>
          <div class="flex flex-wrap gap-1 py-0.5">
            {hotSyms.map(([sym, n]) => (
              <a key={sym} href={`#/research/${sym.toLowerCase()}`}
                class={`border rounded px-1.5 py-0.5 font-mono text-[10.5px] hover:no-underline hover:border-accent/60 ${
                  watchset.has(sym) ? 'border-accent/40 text-accent' : 'border-line text-ink-2'}`}>
                {sym} <b class="text-ink">{n}</b>
              </a>
            ))}
          </div>
        </Panel>
      )}
      <Panel title={tl('today')}>
        {(today?.calendar || []).length === 0 && (
          <Empty label={tl('nothing on the sheet')} />
        )}
        {(today?.calendar || []).map((row) => (
          <div key={row.id} class="py-[3px] font-mono">
            <div class="flex justify-between gap-2 text-[11.5px]">
              <span class="text-ink truncate" title={row.label}>{row.label}</span>
              <span class="text-accent whitespace-nowrap">{countdown(row.ts - now)}</span>
            </div>
            <div class="text-[9.5px] uppercase tracking-wider text-muted">
              {row.kind}
              {row.symbol && <> · <SymbolLink sym={row.symbol} /></>}
              {' · '}{hhmmss(row.ts).slice(0, 5)}
            </div>
          </div>
        ))}
      </Panel>
      <Panel title={tl('coming up')}>
        {(today?.upcoming || []).length === 0 && (
          <Empty label={tl('nothing on the horizon')} />
        )}
        {(today?.upcoming || []).slice(0, 8).map((row) => (
          <div key={row.id} class="flex justify-between gap-2 py-[2.5px] font-mono text-[11px]">
            <span class="text-ink-2 truncate" title={row.label}>{row.label}</span>
            <span class="text-muted whitespace-nowrap">{countdown(row.ts - now)}</span>
          </div>
        ))}
      </Panel>
      {sessions.length > 0 && (
        <Panel title={`${tl('sessions')}${live.length ? ` · ${live.length} ${tl('live')}` : ''}`}>
          {sessions.slice(0, 6).map((s) => (
            <div key={s.id} class="flex items-baseline gap-2 py-[2.5px] font-mono text-[11px]">
              <span class={`text-[9px] uppercase tracking-wider whitespace-nowrap ${
                s.status === 'capturing' ? 'text-accent' : s.status === 'done' ? 'text-up' : 'text-muted'
              }`}>{tl(s.status)}</span>
              <span class="text-ink-2 truncate" title={s.label}>
                {s.symbol ? <SymbolLink sym={s.symbol} /> : null}{s.label ? ` · ${s.label}` : ''}
              </span>
            </div>
          ))}
        </Panel>
      )}
      <Panel title={tl('captured today')}>
        <div class="flex flex-wrap gap-1.5">
          {Object.entries(today?.captured || {}).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
            <span key={type} class="border border-line rounded px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">
              <b class="text-ink">{n}</b> {type.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </Panel>
      {topSrc.length > 0 && (
        <Panel title={tl('loudest sources')}>
          {topSrc.map(([h, n]) => (
            <div key={h} class="flex justify-between gap-2 py-[2px] font-mono text-[10.5px]">
              <span class="text-ink-2 truncate">{h}</span>
              <span class="text-muted">{n}</span>
            </div>
          ))}
        </Panel>
      )}
    </aside>
  )
}

// Expanded rows are session state, not component state: leaving the wire for a
// research page and coming back used to collapse whatever you were reading
// (2026-08-10). Module-level, so it dies with the tab and not before.
const openStore = new Set()

export function Wire({ route }) {
  const [endpoint, setEndpoint] = useState(() => wireUrl())
  const [draft, setDraft] = useState(() => wireUrl())
  const [events, setEvents] = useState([])
  const [hotIds, setHotIds] = useState(new Set())
  const [openIds, setOpenIdsRaw] = useState(() => new Set(openStore))
  const [filter, setFilterRaw] = useState(() => localStorage.getItem('tape-wire-filter') || '')
  const [query, setQueryRaw] = useState(() => localStorage.getItem('tape-wire-filter-text') || '')
  const [mode, setMode] = useState(() => localStorage.getItem('tape-wire-mode') || 'top')
  // rail off = full-width reading; sticky, it's a layout preference
  const [rail, setRail] = useState(() => localStorage.getItem('tape-wire-rail') !== '0')
  const [state, setState] = useState('demo')   // demo | connecting | live | error
  const [error, setError] = useState('')
  const [today, setToday] = useState(null)
  const [watchset, setWatchset] = useState(new Set())
  const [now, setNow] = useState(Date.now() / 1000)
  const esRef = useRef(null)
  // #/wire/<id> — a tape headline links at its own story, not the page
  const targetId = route?.sub ? Number(route.sub) : null
  const landedRef = useRef(null)
  // one archive read per missed deep link, whatever the SSE feed does after
  const missRef = useRef(null)
  const [missing, setMissing] = useState(null)

  // Same shape as the raw setters (value or updater), so callers below read as
  // plain state — they just also write through to the store / localStorage.
  const setOpenIds = (next) => {
    const value = typeof next === 'function' ? next(new Set(openStore)) : next
    openStore.clear()
    for (const k of value) openStore.add(k)
    setOpenIdsRaw(value)
  }
  const setFilter = (f) => {
    setFilterRaw(f)
    localStorage.setItem('tape-wire-filter', f)
  }
  const setQuery = (q) => {
    setQueryRaw(q)
    localStorage.setItem('tape-wire-filter-text', q)
  }

  useEscape(() => setOpenIds(new Set()), openIds.size > 0)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 30_000)
    return () => clearInterval(t)
  }, [])

  const markHot = (id) => {
    setHotIds((cur) => new Set(cur).add(id))
    setTimeout(() => setHotIds((cur) => {
      const next = new Set(cur); next.delete(id); return next
    }), 8000)
  }

  useEffect(() => {
    let cancelled = false
    let revisionTimer = null
    let revisionSince = 0
    if (esRef.current) { esRef.current.close(); esRef.current = null }

    if (!endpoint) {
      setState('demo')
      setEvents(demoBackfill())
      setToday(demoToday())
      setWatchset(new Set(['AAPL', 'MSFT', 'NVDA', 'GOOG', 'AMZN', 'TSLA']))
      let nextId = 41
      const timer = setInterval(() => {
        const ev = demoEvent(nextId++, Date.now() / 1000)
        ev.ts_event = Date.now() / 1000 - 2
        ev.ts_seen = Date.now() / 1000
        setEvents((cur) => [...cur.slice(-199), ev])
        markHot(ev.id)
      }, 15000)
      return () => { cancelled = true; clearInterval(timer) }
    }

    setState('connecting')
    setError('')
    const pollRail = () => {
      fetchToday(endpoint).then((out) => !cancelled && setToday(out)).catch(() => {})
    }
    const pollRevisions = () => {
      if (!revisionSince) return
      fetchUpdates(endpoint, revisionSince)
        .then((out) => {
          if (cancelled) return
          const revisions = out.events || []
          if (revisions.length) {
            setEvents((cur) => {
              const next = cur.slice()
              revisions.forEach((ev) => {
                const i = next.findIndex((row) => row.id === ev.id)
                if (i >= 0) next[i] = ev
                else next.push(ev)
              })
              return next.slice(-400)
            })
            revisions.forEach((ev) => markHot(ev.id))
          }
          revisionSince = out.server_ts || revisionSince
        })
        .catch(() => {})              // SSE still owns connection state
    }
    fetchMeta(endpoint)
      .then((out) => !cancelled && setWatchset(new Set(out.watchlist || [])))
      .catch(() => {})
    fetchEvents(endpoint, { limit: 300, newest: true })
      .then((out) => {
        if (cancelled) return
        setEvents(out.events || [])
        revisionSince = out.server_ts || Date.now() / 1000
        revisionTimer = setInterval(pollRevisions, 2000)
        pollRail()
        const es = new EventSource(`${endpoint}/api/stream?since_id=${out.latest_id || 0}`)
        esRef.current = es
        es.onopen = () => setState('live')
        es.onerror = () => setState('error')
        es.addEventListener('wire', (msg) => {
          const ev = JSON.parse(msg.data)
          setEvents((cur) => [...cur.slice(-399), ev])
          markHot(ev.id)
        })
      })
      .catch((err) => {
        if (cancelled) return
        setState('error')
        setError(String(err.message || err))
      })
    const railTimer = setInterval(pollRail, 30_000)
    return () => {
      cancelled = true
      clearInterval(railTimer)
      if (revisionTimer) clearInterval(revisionTimer)
      if (esRef.current) { esRef.current.close(); esRef.current = null }
    }
  }, [endpoint])

  const wanted = filter ? filter.split(',') : null
  // a session card answers for its audio contents on the type filter
  const typeOf = (ev) => (ev.type === 'live_call' ? 'digest' : ev.type)
  const filtered = clusterStories(collapseSessions(events, now), now)
    .filter((ev) => !wanted || wanted.includes(typeOf(ev)) || wanted.includes(ev.type))
    .filter((ev) => matchesWireQuery(ev, query))
  const shown = mode === 'top'
    ? rankEvents(filtered, watchset, now)
    : filtered.slice().sort((a, b) => (b.is_live ? 1 : 0) - (a.is_live ? 1 : 0) || b.id - a.id)

  const applyEndpoint = (e) => {
    e.preventDefault()
    try {
      setEndpoint(setWireUrl(draft))
    } catch (err) {
      setError(String(err.message || err))
    }
  }

  const toggleOpen = (id) => setOpenIds((cur) => {
    const next = new Set(cur)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // Land on the linked story: unfilter so it can't be hidden, expand it, and
  // scroll it into view. Once per id — re-renders from the SSE feed must not
  // yank the page back after the reader has scrolled away.
  useEffect(() => {
    if (targetId == null) {
      setMissing((cur) => (cur == null ? cur : null))   // back to the plain feed
      return
    }
    if (landedRef.current === targetId) return
    if (events.some((ev) => ev.id === targetId)) {
      landedRef.current = targetId
      setMissing((cur) => (cur === targetId ? null : cur))
      setFilter('')
      setQuery('')
      setMode('all')
      setOpenIds((cur) => new Set(cur).add(targetId))
      requestAnimationFrame(() => {
        document.getElementById(`ev-${targetId}`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
      return
    }
    // Older than the 300-row buffer isn't gone, it's just not loaded. since_id
    // answers with the first row ABOVE it, so since_id = target-1 lands exactly
    // on the story when it still exists (verified against the API 2026-08-10);
    // anything else back means it was purged, and the reader gets told.
    if (!events.length || !endpoint || missRef.current === targetId) return
    missRef.current = targetId
    fetchEvents(endpoint, { sinceId: targetId - 1, limit: 1 })
      .then((out) => {
        const row = (out.events || [])[0]
        if (row && row.id === targetId) {
          setEvents((cur) => (cur.some((ev) => ev.id === targetId) ? cur : [...cur, row]))
        } else {
          setMissing(targetId)
        }
      })
      .catch(() => setMissing(targetId))
  }, [targetId, events, endpoint])

  const setModePersist = (m) => {
    setMode(m)
    localStorage.setItem('tape-wire-mode', m)
  }

  const stateTone = { demo: 'text-muted', connecting: 'text-muted', live: 'text-accent', error: 'text-down' }
  const wireHome = fragwireHome()      // re-reads on endpoint change via `endpoint` state

  const connState = state === 'live' ? 'live' : state === 'error' ? 'down'
    : state === 'connecting' ? 'connecting' : 'demo'
  const CONN_TONE = {
    live: 'text-up', connecting: 'text-accent', down: 'text-down', demo: 'text-muted',
  }
  // Solid dots, no glow (Jeff 2026-08-07). The colour already carries the
  // state; a halo on top of a 6px dot just reads as a smudge at this size.
  const CONN_DOT = {
    live: 'bg-up',
    connecting: 'bg-accent',
    down: 'bg-down',
    demo: 'bg-muted',
  }

  return (
    <div data-wire-workbench class="flex flex-col gap-2 flex-1 min-w-0 h-full min-h-0 overflow-hidden max-lg:overflow-y-auto p-3 pt-0">
      {/* fragwire's own brow, ported: brand, segmented top|wire, conn dot,
          board links — one bar, not a row of floating chips (Jeff 2026-08-05) */}
      <div class="flex items-center gap-3 h-9 shrink-0 -mx-3 px-3 border-b border-line bg-surface-1 min-w-0 overflow-x-auto no-scrollbar">
        <a href={wireHome || '#/wire'} target={wireHome ? '_blank' : undefined} rel="noopener"
           class="inline-flex items-center gap-2.5 shrink-0 hover:no-underline group/brand">
          <FragwireLogo />
          <span class="font-sans font-bold text-[14px] tracking-[-0.02em] text-ink group-hover/brand:text-accent transition-colors">fragwire</span>
        </a>
        <nav class="inline-flex border border-line rounded-lg overflow-hidden shrink-0">
          {['top', 'wire'].map((m) => (
            <button
              key={m}
              class={`px-2.5 py-0.5 font-sans font-semibold text-[11px] whitespace-nowrap transition-colors ${
                mode === m
                  ? m === 'wire' ? 'bg-[#30d158] text-black' : 'bg-accent text-black'
                  : 'text-ink-2 hover:text-ink'
              } ${m === 'wire' ? 'border-l border-line' : ''}`}
              onClick={() => setModePersist(m)}
            >
              {tl(m)}
            </button>
          ))}
        </nav>
        <span class={`inline-flex items-center gap-1.5 shrink-0 font-sans font-semibold text-[10.5px] uppercase tracking-[.1em] ${CONN_TONE[connState]}`}
              title={tl('wire connection')}>
          <i class={`w-1.5 h-1.5 rounded-full ${CONN_DOT[connState]}`} />
          {tl(state === 'demo' ? 'demo' : state)}
        </span>
        {wireHome && (
          <nav class="inline-flex gap-1 shrink-0">
            {[['board', ''], ['calendar', '/today'], ['week', '/week'], ['stats', '/stats']].map(([label, path]) => (
              <a key={label} href={`${wireHome}${path}`} target="_blank" rel="noopener"
                 class="px-2 py-0.5 rounded-md font-sans font-semibold text-[11px] text-ink-2 hover:text-ink hover:bg-surface-2 hover:no-underline">
                {tl(label)}
              </a>
            ))}
          </nav>
        )}
        {error && <span class="font-mono text-[11px] text-down truncate">{error}</span>}
        <span class="ml-auto" />
        {/* Private build has exactly one wire and it's auto-configured —
            the connect affordance only exists for public demo viewers. */}
        {!IS_PRIVATE_BUILD && (
          <form class="flex gap-2 ml-auto" onSubmit={applyEndpoint}>
            <input
              class="bg-surface-2 border border-line rounded-md px-2 py-1 font-mono text-[11.5px] text-ink outline-none focus:border-accent w-64"
              placeholder={tl('your wire URL (optional)')}
              value={draft}
              onInput={(e) => setDraft(e.currentTarget.value)}
            />
            <button class="border border-line rounded-md px-3 py-1 text-[11.5px] font-semibold text-ink-2 hover:text-ink hover:border-ink-2">
              {tl('connect')}
            </button>
          </form>
        )}
      </div>
      <div class="flex gap-1.5 flex-wrap items-center">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            class={`border rounded-md px-2.5 py-0.5 text-[11px] font-semibold ${
              filter === f.id
                ? 'bg-accent border-accent text-black'
                : 'border-line text-ink-2 hover:text-ink'
            }`}
            onClick={() => setFilter(f.id)}
          >
            {tl(f.label)}
          </button>
        ))}
        <input
          data-wire-query
          class="bg-surface-2 border border-line rounded-md px-2 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-accent w-36"
          placeholder={tl('filter…')}
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      {missing != null && (
        <p class="font-mono text-[10.5px] text-muted px-1">
          {tt('wire.story_outside_buffer', { id: missing })}
        </p>
      )}
      <div class="flex flex-1 min-h-0 gap-2 items-stretch max-lg:flex-col max-lg:flex-none">
        <div data-wire-feed class="flex-1 min-w-0 min-h-0 border border-line rounded-lg overflow-y-auto overscroll-contain bg-surface max-lg:h-[55vh] max-lg:min-h-[360px] max-lg:flex-none">
          {shown.length === 0 && (
            <div class="px-3 py-6 font-mono text-[12px] text-muted">{tl('no events')}</div>
          )}
          {shown.slice(0, 250).map((ev) => {
            // a session card's identity must survive id churn as chunks land
            const key = ev.live_call ? `s${ev.live_call.sid}` : ev.id
            return (
              <Row key={key} ev={ev} hot={hotIds.has(ev.id)} tier={tierOf(ev, watchset)}
                   open={openIds.has(key)} onToggle={() => toggleOpen(key)} />
            )
          })}
        </div>
        {rail ? (
          <Rail today={today} now={now} events={events} watchset={watchset}
            onHide={() => { setRail(false); localStorage.setItem('tape-wire-rail', '0') }} />
        ) : (
          <button
            onClick={() => { setRail(true); localStorage.setItem('tape-wire-rail', '1') }}
            title={tl('show the side panels')}
            class="max-lg:hidden self-stretch w-4 shrink-0 rounded-lg border border-line text-muted
                   hover:text-accent hover:border-accent/50 font-mono text-[11px] leading-none"
          >
            «
          </button>
        )}
      </div>
      {!IS_PRIVATE_BUILD && (
        <p class="font-mono text-[10.5px] text-muted max-w-[74ch]">
          {tt('wire.byo_note')}
        </p>
      )}
    </div>
  )
}
