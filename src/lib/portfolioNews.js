import { createPCache } from './pcache.js'
import { eventLanguage, isMirrorBase, pubDisplayName, srcCred } from './wire.js'
import { fetchCnArticle, readableCnUrl } from './cnData.js'
import { cleanArticleText } from './articleText.js'

const cache = createPCache('portfolio_wire_news_v1', { max: 2 })
const pending = new Map()
const TTL = 60_000
const READER_TOKEN = import.meta.env.VITE_READER_CAPABILITY || ''
const WEAK_SOURCE = /fool\.com|motley fool|zacks|investorplace|tipranks|gurufocus|insider ?monkey|247wallst|simplywall|stocktwits|quiver ?quant|marketbeat|barchart/i
const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function peekPortfolioWire(base) {
  return cache.peek(base)
}

/** Holdings stay in the browser: fetch one source pool, then match locally. */
export async function loadPortfolioWire(base, { fetchImpl = fetch, refresh = false } = {}) {
  if (!base) throw new Error('News service unavailable')
  const hit = cache.peek(base)
  if (!refresh && hit && Date.now() - hit.ts < TTL) return hit.events
  if (pending.has(base)) return pending.get(base)
  const job = (async () => {
    const response = await fetchImpl(`${base.replace(/\/$/, '')}/api/events?newest=1&limit=500`,
      { signal: AbortSignal.timeout(8_000) })
    if (!response.ok) throw new Error('News service unavailable')
    const out = await response.json()
    if (!out.ok || !Array.isArray(out.events)) throw new Error('Invalid news response')
    // Keep the persisted cache bounded; full article bodies remain on demand.
    const events = out.events.slice(-500).map(e => ({ id:e.id, type:e.type,
      headline:e.headline, url:e.url, ts_event:e.ts_event || e.ts, ts_seen:e.ts_seen,
      symbols:e.symbols || [], publisher:pubDisplayName(e), language:eventLanguage(e),
      body:cleanArticleText(e.body).slice(0, 500) }))
    cache.set(base, { events, ts:Date.now() })
    return events
  })().finally(() => pending.delete(base))
  pending.set(base, job)
  return job
}

function matches(event, holding) {
  const symbol = String(holding.symbol).toUpperCase()
  if ((event.symbols || []).some(s => String(s).toUpperCase() === symbol)) return true
  const text = `${event.headline || ''} ${event.body || ''}`
  const quoted = escape(symbol)
  if ((symbol.length >= 3 && /[A-Z]/.test(symbol) && new RegExp(`\\b${quoted}\\b`, 'i').test(text))
      || new RegExp(`\\$${quoted}\\b|(?:NYSE|NASDAQ)\\s*:\\s*${quoted}\\b`, 'i').test(text)) return true
  for (const name of holding.names || []) {
    const value = String(name).trim()
      .replace(/[-－](?:SW|W|B|S|R)$/i, '')
      .replace(/(?:股份有限公司|有限公司|公司)$/, '')
      .replace(/\s+(?:inc\.?|corp\.?|corporation|ltd\.?|limited|plc)$/i, '').trim()
    if (/[\u3400-\u9fff]/.test(value)) {
      if (value.length >= 2 && text.includes(value)) return true
    } else if (value.length >= 4 && new RegExp(`\\b${escape(value)}\\b`, 'i').test(text)) return true
  }
  return false
}

export function portfolioStories(events, holdings, base = '') {
  const stories = new Map()
  for (const event of [...events].sort((a,b) => (b.ts_event || 0) - (a.ts_event || 0))) {
    if (!['headline','earnings_release','filing'].includes(event.type) || srcCred(event) < 1) continue
    let link
    try {
      link = new URL(event.url)
      if (!['http:', 'https:'].includes(link.protocol)) continue
      // A headline mentioning Reuters must not promote a content mill.
      if (WEAK_SOURCE.test(`${link.hostname} ${pubDisplayName(event)}`)) continue
      link.hash = ''
      for (const key of [...link.searchParams.keys()]) if (/^utm_|^(?:fbclid|gclid)$/.test(key)) link.searchParams.delete(key)
    } catch { continue }
    const symbols = holdings.filter(h => matches(event,h)).map(h => h.symbol)
    if (!symbols.length) continue
    const old = stories.get(link.href)
    if (old) { old.symbols = [...new Set([...old.symbols,...symbols])]; continue }
    stories.set(link.href, { title:event.headline, summary:event.body || '',
      publisher:pubDisplayName(event), link:link.href, time:Number(event.ts_event || 0)*1000,
      symbol:symbols[0], symbols, language:eventLanguage(event), wireId:event.id, wireBase:base })
  }
  return [...stories.values()]
}

export function canReadPortfolioArticle(item) {
  return !!item && (readableCnUrl(item.link)
    || !!(item.wireId && item.wireBase && (!isMirrorBase(item.wireBase) || READER_TOKEN)))
}

export async function readPortfolioArticle(item, { fetchImpl = fetch } = {}) {
  if (readableCnUrl(item.link)) {
    const out = await fetchCnArticle(item.link, { fetchImpl })
    return { ...out, paras:cleanArticleText(out.paras.join('\n\n')).split(/\n{2,}/).filter(Boolean) }
  }
  if (!canReadPortfolioArticle(item)) throw new Error('Article reader unavailable')
  const response = await fetchImpl(`${item.wireBase.replace(/\/$/,'')}/api/read?id=${item.wireId}&body=1&fast=1`,
    { signal:AbortSignal.timeout(20_000), headers:isMirrorBase(item.wireBase) ? { Authorization:`Bearer ${READER_TOKEN}` } : {} })
  const out = await response.json()
  const text = cleanArticleText(out.text || '')
  if (!response.ok || !out.ok || !text) throw new Error('Article unavailable')
  return { title:item.title, source:item.publisher, paras:text.split(/\n{2,}/).filter(Boolean), truncated:out.truncated }
}
