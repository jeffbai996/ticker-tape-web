import { useEffect, useMemo, useState } from 'preact/hooks'
import { fetchNews } from '../lib/history.js'
import { fetchCnNews } from '../lib/cnData.js'
import { loadZhTable, onZhTable, zhName } from '../lib/zhNames.js'
import { getLocale, tl } from '../lib/i18n.js'

// News for every name in a hand-built book — as an explorer, not a stack
// (Jeff 2026-08-22: "if u have too many its a scrollfest"). One merged feed,
// newest first, each item tagged with its ticker; a rail of tickers with
// counts filters it; a search box narrows it; the feed pages in 25s. A zh
// reader's names the table knows get Chinese coverage by company name;
// everything else rides the provider's English feed. Symbols are fetched
// one at a time with provider spacing and merged in as they land.

const TTL_MS = 10 * 60 * 1000
const PAGE = 25
const cache = new Map()                 // key -> { ts, items }

async function newsFor(symbol) {
  const zh = getLocale() === 'zh'
  let name = null
  if (zh) { await loadZhTable(); name = zhName(symbol) }
  const key = zh && name ? `cn:${name}` : `yf:${symbol}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.items
  const items = zh && name
    ? (await fetchCnNews(name, { n: 8 })).map((r) => ({ title: r.title, publisher: r.source, link: r.url, time: r.ts, summary: r.summary }))
    : (await fetchNews(symbol)).map((r) => ({ ...r, summary: '' }))
  cache.set(key, { ts: Date.now(), items })
  return items
}

function when(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const sameDay = new Date().toDateString() === d.toDateString()
  const loc = getLocale() === 'zh' ? 'zh-CN' : 'en-US'
  return sameDay ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(loc, { month: 'short', day: 'numeric' })
}

export function BookNews({ portfolio, quotes }) {
  const symbols = (portfolio.holdings || []).map((h) => h.symbol)
  const key = symbols.join(',')
  const [news, setNews] = useState({})      // symbol -> items | 'error'
  const [done, setDone] = useState(false)
  const [pick, setPick] = useState(null)     // null = all
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [, zhTick] = useState(0)
  const zh = getLocale() === 'zh'

  useEffect(() => {
    if (!zh) return undefined
    loadZhTable()
    return onZhTable(() => zhTick((t) => t + 1))
  }, [zh])

  useEffect(() => {
    let live = true
    setNews({}); setDone(false); setPick(null); setLimit(PAGE)
    ;(async () => {
      for (const sym of symbols) {
        try {
          const items = await newsFor(sym)
          if (!live) return
          setNews((m) => ({ ...m, [sym]: items }))
        } catch {
          if (!live) return
          setNews((m) => ({ ...m, [sym]: 'error' }))
        }
        await new Promise((r) => setTimeout(r, 400))
      }
      if (live) setDone(true)
    })()
    return () => { live = false }
  }, [key])

  const label = (sym) => (zh && zhName(sym)) || quotes?.[sym]?.name || ''
  const counts = useMemo(() => Object.fromEntries(symbols.map((s) => [s, Array.isArray(news[s]) ? news[s].length : 0])), [news, key])
  const merged = useMemo(() => symbols.flatMap((s) => (Array.isArray(news[s]) ? news[s].map((n) => ({ ...n, symbol: s })) : []))
    .sort((a, b) => (b.time || 0) - (a.time || 0)), [news, key])
  const needle = q.trim().toLowerCase()
  const shown = merged.filter((n) => (!pick || n.symbol === pick) && (!needle || `${n.title} ${n.summary || ''} ${n.publisher || ''}`.toLowerCase().includes(needle)))
  const fetched = Object.keys(news).length

  if (!symbols.length) {
    return (
      <div class="rounded-xl border border-line bg-surface-1 px-4 py-6 text-center font-anth text-[11px] text-muted">
        {tl('Add holdings to see their news here.')}
      </div>
    )
  }

  const chip = (active) => `shrink-0 whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[10.5px] transition-colors ${
    active ? 'border-accent/50 bg-accent/10 text-accent font-semibold' : 'border-line-2 bg-surface-2 text-ink-2 hover:border-line hover:text-ink'}`

  return (
    <div class="flex flex-col gap-2">
      {/* ticker rail: one row, scrolls sideways on a phone, wraps wide */}
      <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap">
        <button type="button" onClick={() => { setPick(null); setLimit(PAGE) }} class={chip(!pick)}>
          {tl('All')} <span class="opacity-70">{merged.length}</span>
        </button>
        {symbols.map((s) => (
          <button key={s} type="button" onClick={() => { setPick(pick === s ? null : s); setLimit(PAGE) }} class={chip(pick === s)}
            title={label(s)}>
            {s}{label(s) && <span class="ml-1 font-anth text-[9.5px] opacity-80">{label(s).slice(0, 6)}</span>}
            <span class={`ml-1 ${news[s] === undefined ? 'opacity-40' : 'opacity-70'}`}>{news[s] === undefined ? '…' : news[s] === 'error' ? '!' : counts[s]}</span>
          </button>
        ))}
      </div>
      <div class="flex items-center gap-2">
        <input value={q} onInput={(e) => { setQ(e.currentTarget.value); setLimit(PAGE) }} placeholder={tl('Search news')} aria-label={tl('Search news')}
          data-1p-ignore data-lpignore="true"
          class="min-w-0 flex-1 rounded border border-line bg-surface-2 px-2 py-1 font-anth text-[11px] text-ink outline-none placeholder:text-muted focus:border-accent/60" />
        <span class="shrink-0 font-mono text-[9.5px] text-muted">{shown.length}{!done && ` · ${tl('loading')} ${fetched}/${symbols.length}`}</span>
      </div>

      <section class="rounded-xl border border-line bg-surface-1 overflow-hidden">
        {shown.length === 0 && (
          <div class="px-3 py-4 text-center font-anth text-[10.5px] text-muted">{done ? tl('No matching headlines.') : '…'}</div>
        )}
        {shown.slice(0, limit).map((n) => (
          <a key={`${n.symbol}:${n.link}`} href={n.link} target="_blank" rel="noopener noreferrer"
             class="flex gap-3 px-3 py-2 border-b border-line last:border-0 hover:bg-surface-3">
            <div class="w-14 shrink-0 pt-0.5">
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPick(n.symbol); setLimit(PAGE) }}
                class="font-mono text-[10px] font-bold text-accent hover:underline">{n.symbol}</button>
              <div class="font-mono text-[9px] text-muted">{when(n.time)}</div>
            </div>
            <div class="min-w-0 flex-1">
              <div class="font-anth text-[12px] leading-snug text-ink">{n.title}</div>
              {n.summary && <div class="mt-0.5 line-clamp-2 font-anth text-[10.5px] leading-snug text-ink-2">{n.summary}</div>}
              <div class="mt-0.5 font-mono text-[9.5px] text-muted">{n.publisher}{!pick && label(n.symbol) ? ` · ${label(n.symbol)}` : ''}</div>
            </div>
          </a>
        ))}
        {shown.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)}
            class="w-full border-t border-line px-3 py-2 font-anth text-[11px] text-accent hover:bg-surface-3">
            {tl('Show more')} · {shown.length - limit}
          </button>
        )}
      </section>
    </div>
  )
}
