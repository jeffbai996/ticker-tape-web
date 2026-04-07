// Streaming AI chat providers: Anthropic, Google (Gemini), OpenAI.
// Direct browser-to-API calls. Keys stored in localStorage.

const MODELS = {
  haiku:    { provider: 'anthropic', id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',    thinking: 0 },
  sonnet:   { provider: 'anthropic', id: 'claude-sonnet-4-6-20250414', label: 'Sonnet 4.6',   thinking: 4096 },
  opus:     { provider: 'anthropic', id: 'claude-opus-4-6-20250414',   label: 'Opus 4.6',     thinking: 8192 },
  flash:    { provider: 'google',    id: 'gemini-2.5-flash',           label: 'Gemini Flash',  thinking: 0 },
  pro:      { provider: 'google',    id: 'gemini-2.5-pro',             label: 'Gemini Pro',    thinking: 2048 },
  gpt:      { provider: 'openai',    id: 'gpt-5.4',                    label: 'GPT-5.4',       thinking: 0 },
  'gpt-mini': { provider: 'openai',  id: 'gpt-5.4-mini',              label: 'GPT-5.4 Mini', thinking: 0 },
}

export function getModels() { return MODELS }
export function getModelList() {
  return Object.entries(MODELS).map(([key, m]) => ({
    key, ...m,
    available: !!getKey(m.provider),
  }))
}

function getKey(provider) {
  const map = { anthropic: 'anthropic_key', google: 'google_key', openai: 'openai_key' }
  return localStorage.getItem(map[provider]) || ''
}

// Stream a chat message. Yields { type: 'text'|'thinking'|'done'|'error', content: string }
export async function* streamChat(modelKey, messages, systemPrompt) {
  const model = MODELS[modelKey]
  if (!model) { yield { type: 'error', content: `Unknown model: ${modelKey}` }; return }

  const key = getKey(model.provider)
  if (!key) { yield { type: 'error', content: `No API key set for ${model.provider}. Open Settings to add one.` }; return }

  try {
    if (model.provider === 'anthropic') {
      yield* streamAnthropic(model, key, messages, systemPrompt)
    } else if (model.provider === 'google') {
      yield* streamGoogle(model, key, messages, systemPrompt)
    } else if (model.provider === 'openai') {
      yield* streamOpenAI(model, key, messages, systemPrompt)
    }
  } catch (err) {
    yield { type: 'error', content: err.message }
  }
}

// ── Anthropic ─────────────────────────────────────────
async function* streamAnthropic(model, key, messages, systemPrompt) {
  const body = {
    model: model.id,
    max_tokens: 4096,
    stream: true,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  }

  if (systemPrompt) {
    body.system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
  }

  if (model.thinking > 0) {
    body.thinking = { type: 'enabled', budget_tokens: model.thinking }
    body.max_tokens = body.max_tokens + model.thinking
    body.temperature = 1 // required for extended thinking
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    yield { type: 'error', content: `Anthropic ${res.status}: ${err}` }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data)
        if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'thinking_delta') {
            yield { type: 'thinking', content: event.delta.thinking }
          } else if (event.delta?.type === 'text_delta') {
            yield { type: 'text', content: event.delta.text }
          }
        }
      } catch {}
    }
  }
  yield { type: 'done', content: '' }
}

// ── Google Gemini ─────────────────────────────────────
async function* streamGoogle(model, key, messages, systemPrompt) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const body = { contents }
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:streamGenerateContent?alt=sse&key=${key}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    yield { type: 'error', content: `Gemini ${res.status}: ${err}` }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6))
        const text = event.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) yield { type: 'text', content: text }
      } catch {}
    }
  }
  yield { type: 'done', content: '' }
}

// ── OpenAI ────────────────────────────────────────────
async function* streamOpenAI(model, key, messages, systemPrompt) {
  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
  msgs.push(...messages.map(m => ({ role: m.role, content: m.content })))

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model.id,
      messages: msgs,
      stream: true,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    yield { type: 'error', content: `OpenAI ${res.status}: ${err}` }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data)
        const text = event.choices?.[0]?.delta?.content
        if (text) yield { type: 'text', content: text }
      } catch {}
    }
  }
  yield { type: 'done', content: '' }
}
