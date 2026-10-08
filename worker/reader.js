import { parseHTML } from 'linkedom'
import { constantTimeEqual } from './capdoc.js'
import { WIRE_KEY } from './wire.js'

// Only public publishers, never the private Fragwire server or a client URL.
const PUBLISHERS = ['reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'barrons.com',
  'cnbc.com', 'marketwatch.com', 'investing.com', 'yahoo.com', 'prnewswire.com',
  'globenewswire.com', 'businesswire.com', 'koreaherald.com', 'digitimes.com',
  'rthk.hk', 'hkma.gov.hk', 'stats.gov.cn', 'hkex.com.hk', 'sec.gov', 'federalreserve.gov',
  'ecb.europa.eu', 'seekingalpha.com', 'nasdaq.com', 'fortune.com', 'bbc.com',
  'bbc.co.uk', 'theguardian.com', 'businessinsider.com', 'techcrunch.com',
  'tomshardware.com', 'theregister.com', 'semianalysis.com', 'nextplatform.com',
  'servethehome.com', 'wccftech.com', 'oilprice.com', 'datacenterdynamics.com',
  'scmp.com', 'cna.com.tw', 'nikkei.com', 'yicai.com', 'cninfo.com.cn']
const MAX_BYTES = 1_500_000
const MAX_TEXT = 80_000
export function publicArticleUrl(value) {
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return null
    return PUBLISHERS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`)) ? u.href : null
  } catch { return null }
}

export function extractArticle(html) {
  const { document } = parseHTML(html)
  let structured = ''
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12) return
    if (typeof value.articleBody === 'string' && value.articleBody.length > structured.length) structured = value.articleBody
    for (const child of Object.values(value)) if (typeof child === 'object') visit(child, depth + 1)
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent)) } catch { /* malformed publisher metadata */ }
  }
  document.querySelectorAll('script,style,nav,header,footer,aside,form,noscript,svg,button').forEach(e => e.remove())
  const candidates = [...document.querySelectorAll('article,main,[itemprop="articleBody"],[role="main"]')]
  if (!candidates.length) candidates.push(...document.querySelectorAll('section,div'))
  let best = ''
  for (const container of candidates) {
    const paras = [...container.querySelectorAll('p,h2,h3,li')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(p => p.length > 15)
    const text = [...new Set(paras)].join('\n\n')
    if (text.length > best.length) best = text
  }
  const text = (structured.length > best.length ? structured : best).trim()
  return { text: text.slice(0, MAX_TEXT), truncated: text.length < 400 || text.length > MAX_TEXT }
}

async function fetchArticle(url, fetcher) {
  const signal = AbortSignal.timeout(15_000)
  for (let n = 0; n < 4; n++) {
    if (!publicArticleUrl(url)) throw Error('unsupported publisher')
    const response = await fetcher(url, { redirect: 'manual', signal,
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'FragwireReader/1.0' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      url = new URL(response.headers.get('location') || '', url).href
      continue
    }
    if (!response.ok || !/text\/html|application\/xhtml/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel(); throw Error('publisher unavailable')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0, html = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_BYTES) throw Error('article too large')
        html += decoder.decode(value, { stream: true })
      }
      html += decoder.decode()
    } finally { await reader.cancel() }
    return { ...extractArticle(html), resolved_url: url }
  }
  throw Error('too many redirects')
}

// A global, serialized quota bounds damage even when the shared link leaks.
export class ReaderQuota {
  constructor(state) { this.state = state }
  async fetch() {
    const now = Date.now()
    const ok = await this.state.storage.transaction(async storage => {
      let v = await storage.get('quota') || {}
      const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000)
      v = { minute, day, m: v.minute === minute ? v.m : 0, d: v.day === day ? v.d : 0 }
      if (v.m >= 20 || v.d >= 500) return false
      v.m++; v.d++; await storage.put('quota', v); return true
    })
    return new Response(null, { status: ok ? 204 : 429 })
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
  const key = `reader:v1:${event.id}`
  const cached = await env.SPEND.get(key, 'json')
  if (cached?.source_url === url) return out(cached)
  try {
    const result = { ok: true, ...await fetchArticle(url, fetcher), source_url: url }
    await env.SPEND.put(key, JSON.stringify(result), { expirationTtl: result.text ? 21600 : 300 })
    return out(result)
  } catch { return out({ ok: false, error: 'publisher did not provide readable text' }, 502) }
}
