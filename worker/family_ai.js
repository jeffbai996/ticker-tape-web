import { constantTimeEqual } from './capdoc.js'

const HEADERS = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Expose-Headers':'Retry-After',
}
const MAX_BYTES = 65536
const METHODS = new Map([
  ['/api/chat/models', 'GET'], ['/api/chat', 'POST'], ['/api/chat/stream', 'POST'],
])
const out = (error, status,extra={}) => Response.json({ok:false,error,...extra}, {status,headers:{...HEADERS,...(extra.retry_after?{'Retry-After':String(extra.retry_after)}:{})}})

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
  const model=body.model || 'family-sonnet'
  const profiles={'family-sonnet':'medium','family-opus':'low','family-flash':'low'}
  if (!Object.hasOwn(profiles,model)) throw new SyntaxError()
  const effort=profiles[model]
  const legacyArgon = model==='family-flash' && body.effort==='medium'
  if (body.effort && body.effort!==effort && !legacyArgon) throw new SyntaxError()
  if(body.turn_id!==undefined || body.send_ids!==undefined){
    if(typeof body.turn_id!=='string'||!/^[a-f0-9]{32}$/.test(body.turn_id)
      ||!Array.isArray(body.send_ids)||body.send_ids.length<1||body.send_ids.length>64
      ||body.send_ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))
      ||new Set(body.send_ids).size!==body.send_ids.length||!body.send_ids.includes(body.turn_id))throw new SyntaxError()
  }
  return JSON.stringify({system:body.system,messages:body.messages,model,effort,turn_id:body.turn_id,send_ids:body.send_ids})
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
  if (request.method === 'POST' && env.FAMILY_AI_DRAIN === '1') {
    return out('Assistant is busy. Please try again.',429,{code:'assistant_busy',retry_after:2})
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
    if(request.method==='POST'){
      const quota=await env.READER_QUOTA.get(env.READER_QUOTA.idFromName('family-ai')).fetch('https://quota/family-ai')
      if(quota.status!==204)return out('Assistant request limit reached.',429,{code:'rate_limited',retry_after:Number(quota.headers.get('Retry-After'))||60})
    }
    const response = await fetcher(`${origin.origin}${path}`, {
      method: request.method, redirect: 'manual', signal: AbortSignal.timeout(95_000),
      headers: { Authorization: `Bearer ${env.FAMILY_AI_GATEWAY_TOKEN}`, 'Content-Type': 'application/json' },
      ...(body ? { body } : {}),
    })
    if (!response.ok) {
      if(response.status===400){
        const info=await response.json().catch(()=>({}))
        return info.code==='turn_limit'?out('This prompt reached its model-call limit. Please narrow the request.',400,{code:'turn_limit'}):out('Invalid request',400)
      }
      if(response.status===429){
        const info=await response.json().catch(()=>({}))
        const busy=info.code==='assistant_busy'
        const retry=Math.min(86400,Math.max(1,Number(info.retry_after)||Number(response.headers.get('Retry-After'))||(busy?2:60)))
        return out(busy?'Assistant is busy. Please try again.':'Assistant request limit reached.',429,{code:busy?'assistant_busy':'rate_limited',retry_after:retry})
      }
      await response.body?.cancel()
      return out(response.status === 429 ? 'Assistant request limit reached.' : 'Assistant unavailable. Please try again.',
        [400, 413, 429, 503].includes(response.status) ? response.status : 502)
    }
    return new Response(response.body, { headers: { ...HEADERS,
      'Content-Type': path.endsWith('/stream') ? 'text/event-stream' : 'application/json',
      ...(path.endsWith('/stream')?{'Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}:{}) } })
  } catch { return out('Assistant unavailable. Please try again.', 503) }
}
