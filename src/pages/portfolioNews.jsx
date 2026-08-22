import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { fetchNews } from '../lib/history.js'
import { fetchCnArticle, fetchCnNews, readableCnUrl } from '../lib/cnData.js'
import { loadZhTable, onZhTable, zhName } from '../lib/zhNames.js'
import { getLocale, tl } from '../lib/i18n.js'

// 新闻 — a reader, not a list (Jeff 2026-08-22: "improve the whole reader
// experience"). Three zones: a ticker rail (a column from lg up, one
// scrolling row on a phone), the feed grouped by day, and a reading pane
// that pulls the article text through the worker so a story opens HERE.
// The picked ticker loads first; everything else trickles behind it with
// provider spacing. A zh reader's names the table knows get Chinese
// coverage by company name; the rest ride the provider's English feed and
// open in a new tab (no extractor for them — honesty over a blank pane).

const TTL_MS = 10 * 60 * 1000
const PAGE = 30
const cache = new Map()                 // key -> { ts, items }
const inflight = new Map()              // symbol -> promise

async function newsFor(symbol) {
  if (inflight.has(symbol)) return inflight.get(symbol)
  const p = (async () => {
    const zh = getLocale() === 'zh'
    let name = null
    if (zh) { await loadZhTable(); name = zhName(symbol) }
    const key = zh && name ? `cn:${name}` : `yf:${symbol}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.ts < TTL_MS) return hit.items
    const items = zh && name
      ? (await fetchCnNews(name, { n: 10 })).map((r) => ({ title: r.title, publisher: r.source, link: r.url, time: r.ts, summary: r.summary }))
      : (await fetchNews(symbol)).map((r) => ({ ...r, summary: '' }))
    cache.set(key, { ts: Date.now(), items })
    return items
  })().finally(() => inflight.delete(symbol))
  inflight.set(symbol, p)
  return p
}

const loc = () => (getLocale() === 'zh' ? 'zh-CN' : 'en-US')
function dayKey(ts) { return ts ? new Date(ts).toDateString() : '' }
function dayLabel(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date(); const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return tl('Today')
  if (d.toDateString() === yest.toDateString()) return tl('Yesterday')
  return d.toLocaleDateString(loc(), { month: 'long', day: 'numeric', weekday: 'short' })
}
const clock = (ts) => (ts ? new Date(ts).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }) : '')

function Reader({ item, onClose }) {
  const [art, setArt] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    setArt(null); setErr(false)
    if (!item || !readableCnUrl(item.link)) return undefined
    let live = true
    fetchCnArticle(item.link).then((a) => { if (live) setArt(a) }).catch(() => { if (live) setErr(true) })
    return () => { live = false }
  }, [item?.link])
  if (!item) {
    return <div class="hidden lg:flex h-full items-center justify-center px-6 text-center font-anth text-[11px] text-muted">{tl('Pick a story to read it here.')}</div>
  }
  const readable = readableCnUrl(item.link)
  return (
    <article class="flex h-full min-h-0 flex-col">
      <header class="flex items-start gap-2 border-b border-line-2 px-4 py-3">
        <div class="min-w-0 flex-1">
          <h2 class="font-anth text-[16px] font-semibold leading-snug tracking-tight text-ink">{art?.title || item.title}</h2>
          <div class="mt-1 font-mono text-[10px] text-muted">
            <span class="font-bold text-accent">{item.symbol}</span>
            {(art?.source || item.publisher) && <span> · {art?.source || item.publisher}</span>}
            {(art?.time || item.time) && <span> · {art?.time || `${dayLabel(item.time)} ${clock(item.time)}`}</span>}
          </div>
        </div>
        <a href={item.link} target="_blank" rel="noopener noreferrer" class="shrink-0 rounded border border-line-2 px-2 py-1 font-anth text-[10px] text-muted hover:text-accent">{tl('Open original')} ↗</a>
        <button type="button" onClick={onClose} aria-label={tl('Close')} class="shrink-0 rounded border border-line-2 px-2 py-1 font-mono text-[11px] text-muted hover:text-ink lg:hidden">✕</button>
      </header>
      <div class="reader-prose min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {readable && !art && !err && <div class="font-anth text-[11px] text-muted">{tl('Reading')}…</div>}
        {readable && err && <div class="font-anth text-[11px] text-down">{tl('Could not load the story — open the original instead.')}</div>}
        {art?.paras?.map((p, i) => (
          <p key={i} class="mb-3 font-anth text-[13.5px] leading-[1.85] text-ink-2">{p}</p>
        ))}
        {!readable && (
          <div class="font-anth text-[12px] leading-relaxed text-ink-2">
            {item.summary && <p class="mb-3">{item.summary}</p>}
            <a href={item.link} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">{tl('Open original')} ↗</a>
          </div>
        )}
      </div>
    </article>
  )
}

export function BookNews({ portfolio, quotes }) {
  const symbols = (portfolio.holdings || []).map((h) => h.symbol)
  const key = symbols.join(',')
  const [news, setNews] = useState({})      // symbol -> items | 'error'
  const [done, setDone] = useState(false)
  const [pick, setPick] = useState(null)     // null = all
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState(null)     // the story in the reader
  const [, zhTick] = useState(0)
  const zh = getLocale() === 'zh'
  const liveRef = useRef(true)

  useEffect(() => {
    if (!zh) return undefined
    loadZhTable()
    return onZhTable(() => zhTick((t) => t + 1))
  }, [zh])

  const load = async (sym) => {
    try {
      const items = await newsFor(sym)
      if (liveRef.current) setNews((m) => (m[sym] === items ? m : { ...m, [sym]: items }))
    } catch { if (liveRef.current) setNews((m) => ({ ...m, [sym]: 'error' })) }
  }

  useEffect(() => {
    liveRef.current = true
    setNews({}); setDone(false); setPick(null); setLimit(PAGE); setOpen(null)
    ;(async () => {
      for (const sym of symbols) {
        if (!liveRef.current) return
        await load(sym)
        await new Promise((r) => setTimeout(r, 400))
      }
      if (liveRef.current) setDone(true)
    })()
    return () => { liveRef.current = false }
  }, [key])

  // the ticker the reader asked for jumps the queue
  const choose = (sym) => {
    const next = pick === sym ? null : sym
    setPick(next); setLimit(PAGE)
    if (next && news[next] === undefined) load(next)
  }

  const label = (sym) => (zh && zhName(sym)) || quotes?.[sym]?.name || ''
  const merged = useMemo(() => symbols.flatMap((s) => (Array.isArray(news[s]) ? news[s].map((n) => ({ ...n, symbol: s })) : []))
    .sort((a, b) => (b.time || 0) - (a.time || 0)), [news, key])
  const needle = q.trim().toLowerCase()
  const shown = merged.filter((n) => (!pick || n.symbol === pick) && (!needle || `${n.title} ${n.summary || ''} ${n.publisher || ''}`.toLowerCase().includes(needle)))
  const fetched = Object.keys(news).length

  if (!symbols.length) {
    return <div class="rounded-xl border border-line bg-surface-1 px-4 py-6 text-center font-anth text-[11px] text-muted">{tl('Add holdings to see their news here.')}</div>
  }

  const railItem = (sym, active, count, name) => (
    <button key={sym || 'all'} type="button" onClick={() => (sym ? choose(sym) : (setPick(null), setLimit(PAGE)))}
      data-active={active ? '1' : '0'}
      class={`rail-item flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-2 py-1 text-left font-mono text-[10.5px] transition-colors md:w-full md:whitespace-normal md:rounded-none md:border-0 md:border-b md:border-line-2 md:px-2.5 md:py-1.5 ${
        active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-transparent text-ink-2 hover:bg-surface-3 hover:text-ink max-md:border-line-2 max-md:bg-surface-2'}`}>
      <span class="flex min-w-0 flex-col md:gap-px">
        <span class={`min-w-0 ${active ? 'font-semibold' : 'font-medium'}`}>{sym || tl('All')}</span>
        {name && <span class="min-w-0 truncate font-anth text-[9.5px] text-muted max-md:hidden">{name}</span>}
      </span>
      {name && <span class="min-w-0 truncate font-anth text-[9.5px] text-muted md:hidden">{name}</span>}
      <span class="ml-auto font-mono text-[9.5px] text-muted">{count}</span>
    </button>
  )

  // group the visible slice by day
  const groups = []
  for (const n of shown.slice(0, limit)) {
    const k = dayKey(n.time)
    const g = groups[groups.length - 1]
    if (g && g.key === k) g.items.push(n); else groups.push({ key: k, label: dayLabel(n.time), items: [n] })
  }

  return (
    <div class="grid gap-2 md:grid-cols-[172px_minmax(0,1fr)] xl:grid-cols-[172px_minmax(0,1fr)_minmax(360px,0.9fr)] md:items-start">
      {/* rail: a column of tickers from tablet width up, chips on a phone */}
      <nav aria-label={tl('News')} class="flex gap-1.5 overflow-x-auto no-scrollbar md:sticky md:top-2 md:flex-col md:gap-0 md:overflow-hidden md:rounded-xl md:border md:border-line md:bg-surface-1 md:[&>*:last-child]:border-b-0">
        {railItem(null, !pick, merged.length, '')}
        {symbols.map((s) => railItem(s, pick === s, news[s] === undefined ? '…' : news[s] === 'error' ? '!' : news[s].length, label(s)))}
      </nav>

      {/* feed */}
      <section class="min-w-0">
        <div class="flex items-center gap-2 pb-2">
          <input value={q} onInput={(e) => { setQ(e.currentTarget.value); setLimit(PAGE) }} placeholder={tl('Search news')} aria-label={tl('Search news')}
            data-1p-ignore data-lpignore="true"
            class="min-w-0 flex-1 rounded border border-line bg-surface-2 px-2 py-1 font-anth text-[11px] text-ink outline-none placeholder:text-muted focus:border-accent/60" />
          <span class="shrink-0 font-mono text-[9.5px] text-muted">{shown.length}{!done && ` · ${tl('loading')} ${fetched}/${symbols.length}`}</span>
        </div>
        <div class="rounded-xl border border-line bg-surface-1 overflow-hidden">
          {shown.length === 0 && (
            <div class="px-3 py-6 text-center font-anth text-[10.5px] text-muted">{done || (pick && news[pick] !== undefined) ? tl('No matching headlines.') : `${tl('loading')}…`}</div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div class="book-eyebrow sticky top-0 z-[1] border-b border-line-2 bg-surface-2/95 px-3 py-1 font-anth text-[9px] uppercase tracking-[.14em] text-muted backdrop-blur">{g.label}</div>
              {g.items.map((n) => {
                const active = open && open.link === n.link && open.symbol === n.symbol
                return (
                  <a key={`${n.symbol}:${n.link}`} href={n.link} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => { e.preventDefault(); setOpen(n) }}
                    class={`flex gap-3 border-b border-line px-3 py-2.5 last:border-0 hover:bg-surface-3 ${active ? 'bg-accent/5' : ''}`}>
                    <div class="w-12 shrink-0 pt-0.5 font-mono text-[9.5px] text-muted">{clock(n.time)}</div>
                    <div class="min-w-0 flex-1">
                      <div class={`font-anth text-[13px] leading-snug ${active ? 'text-accent' : 'text-ink'}`}>{n.title}</div>
                      {n.summary && <div class="mt-0.5 line-clamp-2 font-anth text-[11px] leading-snug text-ink-2">{n.summary}</div>}
                      <div class="mt-1 flex items-center gap-2 font-mono text-[9.5px] text-muted">
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); choose(n.symbol) }} class="font-bold text-accent hover:underline">{n.symbol}</button>
                        {!pick && label(n.symbol) && <span class="font-anth">{label(n.symbol)}</span>}
                        {n.publisher && <span>· {n.publisher}</span>}
                        {!readableCnUrl(n.link) && <span>↗</span>}
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          ))}
          {shown.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} class="w-full border-t border-line px-3 py-2 font-anth text-[11px] text-accent hover:bg-surface-3">
              {tl('Show more')} · {shown.length - limit}
            </button>
          )}
        </div>
      </section>

      {/* reader: a pane from xl up, a sheet below */}
      <aside class="hidden xl:block xl:sticky xl:top-2 xl:h-[calc(100vh-6rem)] rounded-xl border border-line bg-surface-1 overflow-hidden">
        <Reader item={open} onClose={() => setOpen(null)} />
      </aside>
      {open && (
        <div class="xl:hidden fixed inset-0 z-40 flex flex-col bg-surface-0/98 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div class="flex-1 min-h-0"><Reader item={open} onClose={() => setOpen(null)} /></div>
        </div>
      )}
    </div>
  )
}
