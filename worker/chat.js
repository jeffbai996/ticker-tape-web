// AI chat proxy — keys live here as Worker secrets, never in the browser.
//
// Spend control is worst-case up-front: each request is charged its full
// input estimate plus the max-output allowance BEFORE the provider is called,
// into a per-day KV counter. Overcharges a little, but the daily cap can't be
// raced past by parallel streams, and no provider stream parsing is needed
// for accounting. The stream itself is translated to one uniform SSE shape
// (`data: {"d":"…"}` … `data: [DONE]`) so the client is provider-agnostic.

export const DAILY_CAP_USD = 10
const MAX_OUT_TOKENS = 2048
const MAX_INPUT_CHARS = 32_000
const RATE_LIMIT_PER_HOUR = 30

// Web mirror of the CLI's MODELS registry (chat.py). cost per 1M tokens.
export const MODELS = {
  flash: { id: 'gemini-3-flash-preview', label: 'Flash 3', provider: 'gemini', costIn: 0.30, costOut: 2.50 },
  'flash+': { id: 'gemini-3.5-flash', label: 'Flash 3.5', provider: 'gemini', costIn: 1.50, costOut: 9.00 },
  pro: { id: 'gemini-3.1-pro-preview', label: 'Pro 3.1', provider: 'gemini', costIn: 2.00, costOut: 12.00 },
  sonnet: { id: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'anthropic', costIn: 3.00, costOut: 15.00 },
  opus: { id: 'claude-opus-4-8', label: 'Opus 4.8', provider: 'anthropic', costIn: 5.00, costOut: 25.00 },
  fable: { id: 'claude-fable-5', label: 'Fable 5', provider: 'anthropic', costIn: 10.00, costOut: 50.00 },
  gpt: { id: 'gpt-5.5', label: 'GPT-5.5', provider: 'openai', costIn: 5.00, costOut: 30.00 },
  'gpt-mini': { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', provider: 'openai', costIn: 0.75, costOut: 4.50 },
}

const KEY_ENV = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }

// Chat responses can be read by the page but only from our own origins.
const ALLOWED_ORIGINS = new Set([
  'https://jeffbai996.github.io',
  'http://localhost:5199',
  'http://localhost:5173',
])

function corsFor(request) {
  const origin = request.headers.get('Origin')
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://jeffbai996.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsFor(request), 'Content-Type': 'application/json' },
  })
}

const dayKey = () => `spend:${new Date().toISOString().slice(0, 10)}`

/** Estimated worst-case cost of one request in USD (chars/4 ≈ tokens). */
export function estimateCost(model, inputChars) {
  const inTokens = inputChars / 4
  return (inTokens / 1e6) * model.costIn + (MAX_OUT_TOKENS / 1e6) * model.costOut
}

export async function handleChat(request, env, path) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsFor(request) })
  }

  if (path === '/chat/models' && request.method === 'GET') {
    const models = Object.entries(MODELS).map(([key, m]) => ({
      key, label: m.label, provider: m.provider, costIn: m.costIn, costOut: m.costOut,
    }))
    return json(request, { models, cap: DAILY_CAP_USD, maxOutTokens: MAX_OUT_TOKENS })
  }

  if (path === '/chat/spend' && request.method === 'GET') {
    const spent = Number(await env.SPEND.get(dayKey())) || 0
    return json(request, { spent, cap: DAILY_CAP_USD })
  }

  if (path === '/chat' && request.method === 'POST') {
    return handleCompletion(request, env)
  }

  return json(request, { error: 'Not found' }, 404)
}

async function handleCompletion(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json(request, { error: 'Bad JSON' }, 400)
  }

  const model = MODELS[body.model]
  if (!model) return json(request, { error: `Unknown model: ${body.model}` }, 400)

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) return json(request, { error: 'No messages' }, 400)
  const system = typeof body.system === 'string' ? body.system : ''
  const ok = messages.every(
    (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
  )
  if (!ok) return json(request, { error: 'Bad message shape' }, 400)

  const inputChars = system.length + messages.reduce((s, m) => s + m.content.length, 0)
  if (inputChars > MAX_INPUT_CHARS) {
    return json(request, { error: `Input too long (${inputChars} chars, max ${MAX_INPUT_CHARS})` }, 413)
  }

  // Per-IP hourly rate limit (KV is eventually consistent — soft limit).
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const rlKey = `rl:${ip}:${new Date().toISOString().slice(0, 13)}`
  const used = Number(await env.SPEND.get(rlKey)) || 0
  if (used >= RATE_LIMIT_PER_HOUR) {
    return json(request, { error: 'Rate limit: try again next hour' }, 429)
  }
  await env.SPEND.put(rlKey, String(used + 1), { expirationTtl: 7200 })

  // Daily cap — charge worst case before calling the provider.
  const cost = estimateCost(model, inputChars)
  const spent = Number(await env.SPEND.get(dayKey())) || 0
  if (spent + cost > DAILY_CAP_USD) {
    return json(request, { error: `Daily cap reached ($${DAILY_CAP_USD}) — resets at midnight UTC` }, 429)
  }
  await env.SPEND.put(dayKey(), String(spent + cost), { expirationTtl: 3 * 86400 })

  const apiKey = env[KEY_ENV[model.provider]]
  if (!apiKey) return json(request, { error: `${model.provider} key not configured` }, 502)

  try {
    const upstream = await callProvider(model, apiKey, system, messages)
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 300)
      return json(request, { error: `${model.provider} ${upstream.status}: ${detail}` }, 502)
    }
    return new Response(translateStream(upstream.body, model.provider), {
      status: 200,
      headers: {
        ...corsFor(request),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return json(request, { error: `Provider error: ${err.message}` }, 502)
  }
}

function callProvider(model, apiKey, system, messages) {
  if (model.provider === 'anthropic') {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        max_tokens: MAX_OUT_TOKENS,
        stream: true,
        ...(system ? { system } : {}),
        messages,
      }),
    })
  }

  if (model.provider === 'gemini') {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { maxOutputTokens: MAX_OUT_TOKENS },
        }),
      },
    )
  }

  // openai
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      stream: true,
      max_completion_tokens: MAX_OUT_TOKENS,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    }),
  })
}

/** Extract the text delta from one provider SSE `data:` payload, or null. */
export function deltaFrom(provider, payload) {
  try {
    const d = JSON.parse(payload)
    if (provider === 'anthropic') {
      return d.type === 'content_block_delta' && d.delta?.type === 'text_delta' ? d.delta.text : null
    }
    if (provider === 'gemini') {
      const parts = d.candidates?.[0]?.content?.parts || []
      const text = parts.map((p) => p.text || '').join('')
      return text || null
    }
    return d.choices?.[0]?.delta?.content || null
  } catch {
    return null
  }
}

/** Provider SSE → uniform SSE: `data: {"d":"text"}` chunks, `data: [DONE]` end. */
function translateStream(upstream, provider) {
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  let buf = ''

  return upstream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buf += dec.decode(chunk, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() // keep the partial tail
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          const text = deltaFrom(provider, payload)
          if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ d: text })}\n\n`))
        }
      },
      flush(controller) {
        controller.enqueue(enc.encode('data: [DONE]\n\n'))
      },
    }),
  )
}
