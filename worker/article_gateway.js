import { readArticleResponse } from './article_fetch.js'
import { googleArticleId } from './google_news.js'

/** Public article extraction only. No private app routes or model calls. */
export async function fetchGatewayArticle(url, env, fetcher, allowed) {
  if (env.FAMILY_AI_DRAIN === '1' || !env.FAMILY_AI_GATEWAY_TOKEN) return null
  let origin
  try {
    origin = new URL(env.FAMILY_AI_ORIGIN)
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null
  } catch { return null }
  try {
    const response = await fetcher(`${origin.origin}/api/article`, {
      method:'POST',redirect:'manual',signal:AbortSignal.timeout(18_000),
      headers:{Authorization:`Bearer ${env.FAMILY_AI_GATEWAY_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify({url}),
    })
    if (!response.ok) { await response.body?.cancel(); return null }
    const result = JSON.parse(await readArticleResponse(response))
    const resolved = allowed(result.resolved_url)
    if (result.ok !== true || typeof result.text !== 'string' || !resolved || googleArticleId(resolved)) return null
    return {text:result.text.slice(0,80_000),resolved_url:resolved,
      truncated:!!result.truncated || result.text.length > 80_000}
  } catch { return null }
}
