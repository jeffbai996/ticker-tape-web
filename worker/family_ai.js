import { constantTimeEqual } from './capdoc.js'

const HEADERS = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}
const MAX_BYTES = 65536
const METHODS = new Map([
  ['/api/chat/models', 'GET'], ['/api/chat', 'POST'], ['/api/chat/stream', 'POST'],
])
const out = (error, status) => Response.json({ ok: false, error }, { status, headers: HEADERS })

async function boundedBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) throw new RangeError()
  const reader = request.body?.getReader()
  if (!reader) throw new SyntaxError()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new RangeError()
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const body = JSON.parse(new TextDecoder().decode(bytes))
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SyntaxError()
  return JSON.stringify({ system: body.system, messages: body.messages,
    model: 'family-sonnet', effort: 'medium' })
}

/** A separate inference service, never a pass-through to the private app. */
export async function handleFamilyAI(request, env, fetcher = fetch) {
  const url = new URL(request.url)
  const path = url.pathname.slice('/family-ai'.length)
  if (!METHODS.has(path) || url.search) return out('Not found', 404)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS })
  if (request.method !== METHODS.get(path)) return out('Method not allowed', 405)
  if (!env.FAMILY_SYNC_TOKEN || !constantTimeEqual(request.headers.get('Authorization'), `Bearer ${env.FAMILY_SYNC_TOKEN}`)) {
    return out('Unauthorized', 401)
  }
  let origin
  try {
    origin = new URL(env.FAMILY_AI_ORIGIN)
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error()
    if (!env.FAMILY_AI_GATEWAY_TOKEN || !env.READER_QUOTA) throw Error()
  } catch { return out('Assistant unavailable. Please try again.', 503) }
  let body
  if (request.method === 'POST') {
    try { body = await boundedBody(request) }
    catch (error) { return out(error instanceof RangeError ? 'Request too large' : 'Invalid request', error instanceof RangeError ? 413 : 400) }
  }
  try {
    const quota = await env.READER_QUOTA.get(env.READER_QUOTA.idFromName('family-ai')).fetch('https://quota/')
    if (quota.status !== 204) return out('Assistant request limit reached.', 429)
    const response = await fetcher(`${origin.origin}${path}`, {
      method: request.method, redirect: 'manual', signal: AbortSignal.timeout(95_000),
      headers: { Authorization: `Bearer ${env.FAMILY_AI_GATEWAY_TOKEN}`, 'Content-Type': 'application/json' },
      ...(body ? { body } : {}),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return out(response.status === 429 ? 'Assistant request limit reached.' : 'Assistant unavailable. Please try again.',
        [400, 413, 429, 503].includes(response.status) ? response.status : 502)
    }
    return new Response(response.body, { headers: { ...HEADERS,
      'Content-Type': path.endsWith('/stream') ? 'text/event-stream' : 'application/json' } })
  } catch { return out('Assistant unavailable. Please try again.', 503) }
}
