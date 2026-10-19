import { fetchGatewayArticle } from './article_gateway.js'
import { readArticleResponse } from './article_fetch.js'
import { googleArticleId, resolveGoogleArticle } from './google_news.js'
import { parseHTML } from 'linkedom'
import { constantTimeEqual } from './capdoc.js'
import { WIRE_KEY } from './wire.js'
import { cleanArticleText } from '../src/lib/articleText.js'

// Only public publishers, never the private newsservice server or a client URL.
const PUBLISHERS = ['reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'barrons.com',
  'cnbc.com', 'marketwatch.com', 'investing.com', 'yahoo.com', 'prnewswire.com',
  'globenewswire.com', 'businesswire.com', 'koreaherald.com', 'digitimes.com',
  'rthk.hk', 'hkma.gov.hk', 'stats.gov.cn', 'hkex.com.hk', 'sec.gov', 'federalreserve.gov',
  'ecb.europa.eu', 'seekingalpha.com', 'nasdaq.com', 'fortune.com', 'bbc.com',
  'bbc.co.uk', 'theguardian.com', 'businessinsider.com', 'techcrunch.com',
  'tomshardware.com', 'theregister.com', 'semianalysis.com', 'nextplatform.com',
  'servethehome.com', 'wccftech.com', 'oilprice.com', 'datacenterdynamics.com',
  'scmp.com', 'cna.com.tw', 'nikkei.com', 'yicai.com', 'cninfo.com.cn']
const CHINESE_PUBLISHERS = ['etnet.com.hk','hket.com','moneydj.com','eettaiwan.com',
  'ithome.com.tw','ithome.com','ftchinese.com','technews.tw','hkej.com','finet.hk',
  'cnyes.com','ctee.com.tw','wealth.com.tw','businessweekly.com.tw','businesstoday.com.tw',
  'bnext.com.tw','mingpao.com','tmtpost.com','geekpark.net','leiphone.com']
const matchesHost = (host, suffix) => host === suffix || host.endsWith(`.${suffix}`)
const MAX_TEXT = 80_000
export function publicArticleUrl(value) {
  try {
    const u = new URL(value)
    if (u.port || u.username || u.password) return null
    if (u.protocol === 'http:' && CHINESE_PUBLISHERS.some(h => matchesHost(u.hostname,h))) u.protocol = 'https:'
    if (u.protocol !== 'https:') return null
    return googleArticleId(u.href) || [...PUBLISHERS,...CHINESE_PUBLISHERS].some(h => matchesHost(u.hostname,h)) ? u.href : null
  } catch { return null }
}

const BODY_SELECTORS = [
  '[itemprop="articleBody"]', '#ContentBody', '#article-container', '#paragraph',
  '.entry-content', '.lph-article-comView', '#highlight', '.article-content',
  '.field-name-body', '.field--name-body', '.story-body', '#news_detail_wrapper',
  '#article-detail-wrapper', '#article-body', '.paragraph',
]
const CHROME = 'script,style,nav,header,footer,aside,form,noscript,svg,button,'
  + '.related-posts,.related-articles,.realted-article,.article-function,.share-tools,.social-share,.advertisement'
const BLOCKS = new Set(['P','DIV','SECTION','H1','H2','H3','H4','LI','TR','BLOCKQUOTE','BR'])
function articleBlocks(element) {
  const parts = []
  const walk = node => {
    if (node.nodeType === 3) { parts.push(node.textContent); return }
    if (BLOCKS.has(node.tagName)) parts.push('\n')
    for (const child of node.childNodes || []) walk(child)
    if (BLOCKS.has(node.tagName)) parts.push('\n')
  }
  walk(element)
  return cleanArticleText(parts.join('').split(/\n+/).map(p => p.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n\n'))
}

export function extractArticle(html) {
  const { document } = parseHTML(html)
  let structured = '', locked = false
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12) return
    if (typeof value.articleBody === 'string' && value.articleBody.length > structured.length) structured = value.articleBody
    if (value.isAccessibleForFree === false || value.isAccessibleForFree === 'false') locked = true
    for (const child of Object.values(value)) if (typeof child === 'object') visit(child, depth + 1)
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent)) } catch { /* malformed publisher metadata */ }
  }
  document.querySelectorAll(CHROME).forEach(e => e.remove())
  let best = '', specific = false
  for (const selector of BODY_SELECTORS) {
    const nodes = [...document.querySelectorAll(selector)]
    if (!nodes.length) continue
    specific = true
    best = nodes.map(articleBlocks).sort((a,b) => b.length-a.length)[0] || ''
    break
  }
  if (!specific) {
    const candidates = [...document.querySelectorAll('article,main,[role="main"]')]
    if (!candidates.length) candidates.push(...document.querySelectorAll('section,div'))
    for (const container of candidates) {
      const paras = [...container.querySelectorAll('p,h2,h3,li')].map(e => e.textContent.replace(/\s+/g,' ').trim()).filter(p => p.length > 15)
      const text = cleanArticleText([...new Set(paras)].join('\n\n'))
      if (text.length > best.length) best = text
    }
  }
  let cleanStructured = ''
  if (structured) {
    const node = parseHTML('<div>' + structured + '</div>').document.querySelector('div')
    node.querySelectorAll(CHROME).forEach(e => e.remove())
    cleanStructured = articleBlocks(node)
  }
  const text = cleanStructured.length > best.length ? cleanStructured : best
  const excerpt = /[（(]節錄[）)]|[（(]节录[）)]|訂閱全文|订阅全文|登入後閱讀|登录后阅读/.test(text)
  return { text:text.slice(0,MAX_TEXT), truncated:locked || excerpt || text.length < 400 || text.length > MAX_TEXT }
}

async function fetchDirectArticle(url, fetcher) {
  const signal = AbortSignal.timeout(15_000)
  if (googleArticleId(url)) {
    let stage = 'google_unresolved'
    url = await resolveGoogleArticle(url, fetcher, { signal, allowed:publicArticleUrl,
      onStage:(name,status) => { stage = status ? `${name}_${status}` : name },
    })
    if (!url) throw Error(stage)
  }
  for (let n = 0; n < 4; n++) {
    if (!publicArticleUrl(url)) throw Error('unsupported publisher')
    const response = await fetcher(url, { redirect: 'manual', signal,
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 (compatible; MarketNewsReader/1.0)' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      url = new URL(response.headers.get('location') || '', url).href
      continue
    }
    if (!response.ok || !/text\/html|application\/xhtml/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel(); throw Error('publisher unavailable')
    }
    const html = await readArticleResponse(response)
    return { ...extractArticle(html), resolved_url: url }
  }
  throw Error('too many redirects')
}

async function fetchArticle(url, fetcher, env) {
  const google = !!googleArticleId(url)
  if (google) {
    const article = await fetchGatewayArticle(url,env,fetcher,publicArticleUrl)
    if (article) return article
  }
  try { return await fetchDirectArticle(url,fetcher) }
  catch (error) {
    const host = new URL(url).hostname
    if (!google && [...CHINESE_PUBLISHERS,'cna.com.tw','investing.com'].some(h => matchesHost(host,h))) {
      const article = await fetchGatewayArticle(url,env,fetcher,publicArticleUrl)
      if (article) return article
    }
    throw error
  }
}

// A global, serialized quota bounds damage even when the shared link leaks.
export class ReaderQuota {
  constructor(state) { this.state = state }
  async fetch(request) {
    const family=request && new URL(typeof request==='string'?request:request.url).pathname==='/family-ai'
    const limits=family?{minute:30,day:2400}:{minute:20,day:500}
    const now = Date.now()
    const wait = await this.state.storage.transaction(async storage => {
      let v = await storage.get('quota') || {}
      const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000)
      v = { minute, day, m: v.minute === minute ? v.m : 0, d: v.day === day ? v.d : 0 }
      const retry=Math.max(v.m>=limits.minute?(minute+1)*60000-now:0,v.d>=limits.day?(day+1)*86400000-now:0)
      if(retry>0)return Math.ceil(retry/1000)
      v.m++; v.d++; await storage.put('quota', v); return 0
    })
    return wait?Response.json({retry_after:wait},{status:429,headers:{'Retry-After':String(wait)}}):new Response(null,{status:204})
  }
}

export async function handleReader(request, env, fetcher = fetch) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,OPTIONS' }
  const out = (value, status = 200) => new Response(JSON.stringify(value), { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'GET') return out({ ok: false, error: 'method not allowed' }, 405)
  if (!env.WIRE_READER_TOKEN || !constantTimeEqual(request.headers.get('Authorization'), `Bearer ${env.WIRE_READER_TOKEN}`)) return out({ ok: false, error: 'unauthorized' }, 401)
  const query = new URL(request.url).searchParams
  if ([...query.keys()].some(k => !['id', 'body', 'fast', 'refresh'].includes(k)) || !/^\d{1,15}$/.test(query.get('id') || '')) return out({ ok: false, error: 'invalid article' }, 400)
  if (!env.SPEND || !env.READER_QUOTA) return out({ ok: false, error: 'reader unavailable' }, 503)
  const quota = await env.READER_QUOTA.get(env.READER_QUOTA.idFromName('family-reader')).fetch('https://quota/')
  if (quota.status !== 204) return out({ ok: false, error: 'reader limit reached' }, 429)
  const snap = await env.SPEND.get(WIRE_KEY, 'json')
  const event = snap?.events?.find(e => String(e.id) === query.get('id'))
  if (!event) return out({ ok: false, error: 'article outside retained feed' }, 404)
  const url = publicArticleUrl(event.url)
  if (!url) return out({ ok: false, error: 'publisher requires opening the source', unsupported: true }, 422)
  const key = `reader:v2:${event.id}`
  const cached = await env.SPEND.get(key, 'json')
  if (query.get('refresh') !== '1' && cached?.source_url === url) return out({ ...cached, text: cleanArticleText(cached.text) })
  try {
    const result = { ok: true, ...await fetchArticle(url, fetcher, env), source_url: url }
    await env.SPEND.put(key, JSON.stringify(result), { expirationTtl: result.text && !result.truncated ? 21600 : 300 })
    return out(result)
  } catch (error) {
    const stage = /^google_[a-z_]+(?:_\d{3})?$/.test(error?.message || '') ? error.message : 'publisher_fetch'
    console.warn(JSON.stringify({type:'reader_failure',stage}))
    return out({ ok:false,error:'publisher did not provide readable text' },502)
  }
}
