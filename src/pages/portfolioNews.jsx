import { useEffect, useState } from 'preact/hooks'
import { fetchNews } from '../lib/history.js'
import { fetchCnNews, isCnListing } from '../lib/cnData.js'
import { loadZhTable, zhName } from '../lib/zhNames.js'
import { getLocale, tl } from '../lib/i18n.js'

// News for every name in a hand-built book, one page (Jeff 2026-08-22: "a
// news page that grabs news relating to his tickers"). A zh reader's Hong
// Kong / mainland names get Chinese coverage by company name through the
// worker's /cn/news; everything else rides the provider's English feed.
// Symbols are fetched one at a time with provider spacing and painted as
// they land — a 20-name book fills in over ~8s rather than all at once.

const TTL_MS = 10 * 60 * 1000
const cache = new Map()                 // key -> { ts, items }

async function newsFor(symbol) {
  const zh = getLocale() === 'zh' && isCnListing(symbol)
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
  return new Date(ts).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
}

export function BookNews({ portfolio, quotes }) {
  const symbols = (portfolio.holdings || []).map((h) => h.symbol)
  const key = symbols.join(',')
  const [news, setNews] = useState({})      // symbol -> items | 'error'
  const [done, setDone] = useState(false)

  useEffect(() => {
    let live = true
    setNews({}); setDone(false)
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

  const label = (sym) => (getLocale() === 'zh' && zhName(sym)) || quotes?.[sym]?.name || ''
  const fetched = Object.keys(news).length

  if (!symbols.length) {
    return (
      <div class="rounded-xl border border-line bg-surface-1 px-4 py-6 text-center font-anth text-[11px] text-muted">
        {tl('Add holdings to see their news here.')}
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-baseline gap-2 px-0.5 font-anth text-[9px] uppercase tracking-wider text-muted">
        {tl('News')} · {symbols.length}
        {!done && <span class="normal-case tracking-normal">{tl('loading')} {fetched}/{symbols.length}…</span>}
      </div>
      {symbols.map((sym) => {
        const items = news[sym]
        return (
          <section key={sym} class="rounded-xl border border-line bg-surface-1 min-w-0 overflow-hidden">
            <header class="flex items-baseline gap-2 px-3 py-1.5 border-b border-line-2 bg-surface-2">
              <a href={`#/research/${sym.toLowerCase()}`} class="font-mono text-[11px] font-bold text-accent hover:underline">{sym}</a>
              <span class="min-w-0 truncate font-anth text-[10.5px] text-ink-2">{label(sym)}</span>
              {Array.isArray(items) && <span class="ml-auto font-mono text-[9px] text-muted">{items.length}</span>}
            </header>
            {items === undefined && <div class="px-3 py-2 font-anth text-[10.5px] text-muted">…</div>}
            {items === 'error' && <div class="px-3 py-2 font-anth text-[10.5px] text-down">{tl('news unavailable')}</div>}
            {Array.isArray(items) && items.length === 0 && (
              <div class="px-3 py-2 font-anth text-[10.5px] text-muted">{tl('no headlines')}</div>
            )}
            {Array.isArray(items) && items.slice(0, 6).map((n) => (
              <a key={n.link} href={n.link} target="_blank" rel="noopener noreferrer"
                 class="block px-3 py-1.5 border-b border-line last:border-0 hover:bg-surface-3">
                <div class="font-anth text-[12px] leading-snug text-ink">{n.title}</div>
                {n.summary && <div class="mt-0.5 line-clamp-2 font-anth text-[10.5px] leading-snug text-ink-2">{n.summary}</div>}
                <div class="mt-0.5 font-mono text-[9.5px] text-muted">{n.publisher}{n.time ? ` · ${when(n.time)}` : ''}</div>
              </a>
            ))}
          </section>
        )
      })}
    </div>
  )
}
