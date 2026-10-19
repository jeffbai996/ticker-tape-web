import { parseHTML } from 'linkedom'
import { readArticleResponse } from './article_fetch.js'

export function googleArticleId(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'news.google.com' || url.port || url.username || url.password) return null
    return /^\/(?:rss\/)?(?:articles|read)\/([A-Za-z0-9_-]{20,2048})$/.exec(url.pathname)?.[1] || null
  } catch { return null }
}

function publisherUrl(value, allowed) {
  return typeof value === 'string' && !googleArticleId(value) ? allowed(value) : null
}

export function googleBatchUrl(text, allowed) {
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('[[')) continue
    try {
      for (const row of JSON.parse(line)) {
        if (!Array.isArray(row) || row[1] !== 'Fbv4je' || typeof row[2] !== 'string') continue
        const result = JSON.parse(row[2])
        if (result[0] === 'garturlres') {
          const url = publisherUrl(result[1], allowed)
          if (url) return url
        }
      }
    } catch { /* Google also emits length-prefixed/non-JSON lines. */ }
  }
  return null
}

/** Resolve retained Google News IDs; every destination still needs the publisher allowlist. */
export async function resolveGoogleArticle(url, fetcher, { signal, allowed }) {
  const id = googleArticleId(url)
  if (!id) return null
  try {
    const binary = atob(id.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - id.length % 4) % 4))
    for (const match of binary.matchAll(/https?:\/\/[\x21-\x7e]{8,}/g)) {
      const direct = publisherUrl(match[0], allowed)
      if (direct) return direct
    }
  } catch { /* Opaque current IDs need the signed resolver below. */ }
  let page
  for (let n = 0; n < 3; n++) {
    const response = await fetcher(url, { signal, redirect:'manual', headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html'} })
    if ([301,302,303,307,308].includes(response.status)) {
      const location = new URL(response.headers.get('location') || '', url).href
      await response.body?.cancel()
      const direct = publisherUrl(location, allowed)
      if (direct) return direct
      if (googleArticleId(location) !== id) return null
      url = location
      continue
    }
    if (!response.ok) { await response.body?.cancel(); return null }
    page = await readArticleResponse(response)
    break
  }
  if (!page) return null
  const node = parseHTML(page).document.querySelector('[data-n-a-sg][data-n-a-ts]')
  const signature = node?.getAttribute('data-n-a-sg')
  const timestamp = Number(node?.getAttribute('data-n-a-ts'))
  if (!signature || signature.length > 4096 || !Number.isSafeInteger(timestamp) || timestamp <= 0) return null
  const request = ['garturlreq',
    [['X','X',['en-US','US'],null,null,1,1,'US:en',null,180,null,null,null,null,null,0,null,null,[1608992183,723341000]],
      'en-US','US',1,[2,3,4,8],1,0,'655000234',0,0,null,0], id,timestamp,signature]
  const body = new URLSearchParams({'f.req':JSON.stringify([[['Fbv4je',JSON.stringify(request),null,'generic']]])})
  const response = await fetcher('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method:'POST',redirect:'manual',signal,body:body.toString(),headers:{'User-Agent':'Mozilla/5.0',
      'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
  })
  if (!response.ok) { await response.body?.cancel(); return null }
  return googleBatchUrl(await readArticleResponse(response), allowed)
}
