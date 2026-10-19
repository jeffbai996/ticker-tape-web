import { matchesHoldingNews as matches } from './holdingNewsMatch.js'
import { createPCache } from './pcache.js'
import { eventLanguage, fetchWireArticle, isMirrorBase, pubDisplayName, srcCred } from './wire.js'
import { proxyBase } from './feed.js'
import { parseCnNews, isCnListing, readableCnUrl } from './cnData.js'
import { cleanArticleText } from './articleText.js'

const cache = createPCache('portfolio_wire_news_v1', { max: 2 })
const pending = new Map()
const TTL = 60_000
const READER_TOKEN = import.meta.env.VITE_READER_CAPABILITY || ''
const WEAK_SOURCE = /fool\.com|motley fool|zacks|investorplace|tipranks|gurufocus|insider ?monkey|247wallst|simplywall|stocktwits|quiver ?quant|marketbeat|barchart/i

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

const companyCache = createPCache('portfolio_company_news_v1', { max:80 })
const companyPending = new Map()
const companyName = name => String(name || '').trim()
  .replace(/[-－](?:SW|W|B|S|R)$/i,'').replace(/^(?:XD|XR|DR)(?=[\u3400-\u9fff])/i,'').trim()

/** Company searches supplement the independent wire; selection stays local. */
export async function loadCompanyNews(holdings, { fetchImpl=fetch, refresh=false }={}) {
  const companies=holdings.filter(h=>isCnListing(h.symbol)).map(h=>({
    ...h, query:companyName((h.names || []).find(n=>/[\u3400-\u9fff]/.test(n))) || h.symbol.split('.')[0],
  }))
  const queries=[...new Set(companies.map(h=>h.query))]
  const missing=queries.filter(q=>refresh || !companyCache.peek(q) || Date.now()-companyCache.peek(q).ts>600_000)
  const errors=new Set()
  for(let start=0;start<missing.length;start+=12) {
    const batch=missing.slice(start,start+12), key=JSON.stringify(batch)
    let job=companyPending.get(key)
    if(!job) {
      job=(async()=>{
        const response=await fetchImpl(`${proxyBase()}/cn/news-batch`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({queries:batch}),signal:AbortSignal.timeout(12_000)})
        if(!response.ok) throw Error('News service unavailable')
        const out=await response.json()
        if(!Array.isArray(out.results)) throw Error('Invalid news response')
        return out.results
      })().finally(()=>companyPending.delete(key))
      companyPending.set(key,job)
    }
    try {
      const results=await job
      for(const query of batch) {
        const result=results.find(r=>r.query===query)
        if(!Array.isArray(result?.rows)) { errors.add(query); continue }
        const events=parseCnNews({result:{cmsArticleWebOld:result.rows}}).map(row=>({
          type:'headline',headline:row.title,url:row.url,body:cleanArticleText(row.summary).slice(0,500),
          publisher:row.source,language:'zh',ts_event:row.ts/1000,
          symbols:companies.filter(h=>matches({headline:row.title,body:row.summary},h)).map(h=>h.symbol),
        }))
        companyCache.set(query,{events,ts:Date.now()})
      }
    } catch { for(const query of batch) errors.add(query) }
  }
  const events=queries.flatMap(q=>companyCache.peek(q)?.events || [])
  // Exchange names can carry temporary ex-dividend markers or differ from
  // the article's company name. A stock-code query recovers that coverage.
  const fallback=companies.filter(h=>h.query!==h.symbol.split('.')[0]
    && !events.some(e=>matches(e,h)))
  const extra=fallback.length ? await loadCompanyNews(fallback.map(h=>({...h,names:[]})),{fetchImpl,refresh}) : {events:[],failed:[]}
  return {events:[...events,...extra.events],
    failed:[...new Set([...companies.filter(h=>errors.has(h.query)).map(h=>h.symbol),...extra.failed])]}

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
  if (!canReadPortfolioArticle(item)) throw new Error('Article reader unavailable')
  const out = await fetchWireArticle(item.wireBase || '', {id:item.wireId,url:item.link}, {fetchImpl,readerToken:READER_TOKEN})
  const text = cleanArticleText(out.text || '')
  if (!out.ok || !text) throw new Error('Article unavailable')
  return { title:out.title || item.title, source:out.source || item.publisher, time:out.time,
    paras:text.split(/\n{2,}/).filter(Boolean), truncated:out.truncated }
}
