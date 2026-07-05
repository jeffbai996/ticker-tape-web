// AI chat proxy — keys live here as Worker secrets, never in the browser.
//
// Spend control is worst-case up-front: each request is charged its full
// input estimate plus the max-output allowance BEFORE the provider is called,
// into a per-day KV counter. Overcharges a little, but the daily cap can't be
// raced past by parallel streams, and no provider stream parsing is needed
// for accounting. The stream itself is translated to one uniform SSE shape
// (`data: {"d":"…"}` … `data: [DONE]`) so the client is provider-agnostic.
//
// Tool calling: the client may send `tools` (JSON-Schema function defs) and
// extended message shapes — assistant messages carrying `toolCalls`
// [{id,name,args}] and `{role:'tool', id, name, content}` results. Tools are
// translated per provider; tool calls the model makes are accumulated out of
// the stream and emitted as one `data: {"tc":[…]}` event before [DONE]. The
// worker never executes tools — execution is client-side, against data the
// browser already has.

export const DAILY_CAP_USD = 10
const MAX_OUT_TOKENS = 2048
const MAX_INPUT_CHARS = 32_000
const RATE_LIMIT_PER_HOUR = 30
const MAX_TOOLS = 16

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

/** One of the three message shapes the client may send. Exported for tests. */
export function validMessage(m) {
  if (!m || typeof m !== 'object') return false
  if (m.role === 'tool') {
    return typeof m.id === 'string' && typeof m.name === 'string' && typeof m.content === 'string'
  }
  if (m.role !== 'user' && m.role !== 'assistant') return false
  if (typeof m.content !== 'string') return false
  if (m.toolCalls !== undefined) {
    if (m.role !== 'assistant' || !Array.isArray(m.toolCalls)) return false
    return m.toolCalls.every(
      (tc) => tc && typeof tc.id === 'string' && typeof tc.name === 'string' &&
        tc.args !== null && typeof tc.args === 'object',
    )
  }
  return true
}

function validTool(t) {
  return t && typeof t.name === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(t.name) &&
    typeof t.description === 'string' &&
    t.parameters !== null && typeof t.parameters === 'object'
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
  if (!messages.every(validMessage)) return json(request, { error: 'Bad message shape' }, 400)

  let tools = null
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.length > MAX_TOOLS || !body.tools.every(validTool)) {
      return json(request, { error: 'Bad tools' }, 400)
    }
    tools = body.tools.length ? body.tools : null
  }

  const inputChars =
    system.length +
    (tools ? JSON.stringify(tools).length : 0) +
    messages.reduce(
      (s, m) => s + m.content.length + (m.toolCalls ? JSON.stringify(m.toolCalls).length : 0),
      0,
    )
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
    const upstream = await callProvider(model, apiKey, system, messages, tools)
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

// ---------------------------------------------------------------------------
// Neutral messages → provider wire formats. Exported for tests.

/** Anthropic: toolCalls → tool_use blocks; tool results → user tool_result
 *  blocks, consecutive results merged into ONE user message (API requirement). */
export function anthMessages(messages) {
  const out = []
  for (const m of messages) {
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.id, content: m.content }
      const last = out[out.length - 1]
      if (last?.role === 'user' && Array.isArray(last.content)) last.content.push(block)
      else out.push({ role: 'user', content: [block] })
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      const content = []
      if (m.content) content.push({ type: 'text', text: m.content })
      for (const tc of m.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
      }
      out.push({ role: 'assistant', content })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}

/** Gemini: toolCalls → functionCall parts; tool results → functionResponse
 *  parts, consecutive same-role contents merged (Gemini rejects role runs). */
export function gemContents(messages) {
  const out = []
  const push = (role, parts) => {
    const last = out[out.length - 1]
    if (last?.role === role) last.parts.push(...parts)
    else out.push({ role, parts })
  }
  for (const m of messages) {
    if (m.role === 'tool') {
      push('user', [{ functionResponse: { name: m.name, response: { result: m.content } } }])
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      const parts = m.content ? [{ text: m.content }] : []
      for (const tc of m.toolCalls) parts.push({ functionCall: { name: tc.name, args: tc.args } })
      push('model', parts)
    } else {
      push(m.role === 'assistant' ? 'model' : 'user', [{ text: m.content }])
    }
  }
  return out
}

/** OpenAI: toolCalls → tool_calls with stringified arguments; tool → role tool. */
export function oaiMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.id, content: m.content }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      }
    }
    return { role: m.role, content: m.content }
  })
}

function callProvider(model, apiKey, system, messages, tools) {
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
        ...(tools
          ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
          : {}),
        messages: anthMessages(messages),
      }),
    })
  }

  if (model.provider === 'gemini') {
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: gemContents(messages),
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          ...(tools
            ? {
                tools: [{
                  functionDeclarations: tools.map((t) => ({
                    name: t.name, description: t.description, parameters: t.parameters,
                  })),
                }],
              }
            : {}),
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
      ...(tools
        ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }
        : {}),
      messages: system
        ? [{ role: 'system', content: system }, ...oaiMessages(messages)]
        : oaiMessages(messages),
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

/**
 * Stateful per-provider accumulator for tool calls arriving in stream
 * fragments. feed() each `data:` payload; result() → [{id,name,args}].
 * Exported for tests.
 */
export function makeToolCollector(provider) {
  // keyed slots: anthropic by block index, openai by tool_calls index,
  // gemini calls arrive whole (ids synthesized).
  const slots = new Map()
  let gi = 0

  function feed(payload) {
    let d
    try {
      d = JSON.parse(payload)
    } catch {
      return
    }

    if (provider === 'anthropic') {
      if (d.type === 'content_block_start' && d.content_block?.type === 'tool_use') {
        slots.set(d.index, { id: d.content_block.id, name: d.content_block.name, argStr: '' })
      } else if (d.type === 'content_block_delta' && d.delta?.type === 'input_json_delta') {
        const slot = slots.get(d.index)
        if (slot) slot.argStr += d.delta.partial_json || ''
      }
      return
    }

    if (provider === 'gemini') {
      for (const p of d.candidates?.[0]?.content?.parts || []) {
        if (p.functionCall?.name) {
          slots.set(`g${gi}`, { id: `g${gi}`, name: p.functionCall.name, args: p.functionCall.args || {} })
          gi++
        }
      }
      return
    }

    // openai: incremental fragments keyed by index; id/name arrive on the first
    for (const tc of d.choices?.[0]?.delta?.tool_calls || []) {
      if (tc.index == null) continue
      let slot = slots.get(tc.index)
      if (!slot) {
        slot = { id: '', name: '', argStr: '' }
        slots.set(tc.index, slot)
      }
      if (tc.id) slot.id = tc.id
      if (tc.function?.name) slot.name += tc.function.name
      if (tc.function?.arguments) slot.argStr += tc.function.arguments
    }
  }

  function result() {
    const out = []
    for (const slot of slots.values()) {
      if (!slot.name) continue
      let args = slot.args
      if (args === undefined) {
        try {
          args = slot.argStr ? JSON.parse(slot.argStr) : {}
        } catch {
          continue // truncated/garbled args — drop rather than execute wrong
        }
      }
      out.push({ id: slot.id || `t${out.length}`, name: slot.name, args })
    }
    return out
  }

  return { feed, result }
}

/** Provider SSE → uniform SSE: `data: {"d":"text"}` chunks, one optional
 *  `data: {"tc":[…]}` tool-call event, then `data: [DONE]`. */
function translateStream(upstream, provider) {
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const collector = makeToolCollector(provider)
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
          collector.feed(payload)
          const text = deltaFrom(provider, payload)
          if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ d: text })}\n\n`))
        }
      },
      flush(controller) {
        const calls = collector.result()
        if (calls.length) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ tc: calls })}\n\n`))
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'))
      },
    }),
  )
}
