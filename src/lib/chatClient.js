// Optional client for an explicitly configured private chat proxy. The public
// market-data Worker has no /chat route; normal tailnet use goes through
// Fragwire's wirechat client instead.

function chatBase() {
  return String(import.meta.env.VITE_CHAT_PROXY || '').replace(/\/$/, '')
}

function chatUrl(path) {
  const base = chatBase()
  if (!base) throw new Error('AI requires the private service')
  return `${base}${path}`
}

export async function fetchChatModels() {
  const resp = await fetch(chatUrl('/chat/models'), { signal: AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`models: HTTP ${resp.status}`)
  return resp.json()
}

export async function fetchSpend() {
  const resp = await fetch(chatUrl('/chat/spend'), { signal: AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`spend: HTTP ${resp.status}`)
  return resp.json()
}

/** Parse one SSE chunk buffer; returns [deltas, done, rest, toolCalls].
 *  Exported for tests. */
export function parseSSE(buf) {
  const deltas = []
  const toolCalls = []
  let done = false
  const lines = buf.split('\n')
  const rest = lines.pop() // partial tail stays buffered
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') {
      done = true
      continue
    }
    try {
      const d = JSON.parse(payload)
      if (d.d) deltas.push(d.d)
      if (Array.isArray(d.tc)) toolCalls.push(...d.tc)
    } catch { /* skip malformed line */ }
  }
  return [deltas, done, rest, toolCalls]
}

/**
 * Stream one completion. Calls onDelta(text) per chunk; resolves with
 * {text, toolCalls} when the stream ends (toolCalls is [] unless the model
 * called tools). Throws with the server's error message on cap/rate/provider
 * failures.
 */
export async function streamChat({ model, effort, messages, system, tools, onDelta }) {
  const resp = await fetch(chatUrl('/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, system,
      ...(effort && effort !== 'auto' ? { effort } : {}),
      ...(tools?.length ? { tools } : {}) }),
  })
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try {
      msg = (await resp.json()).error || msg
    } catch { /* keep the status text */ }
    throw new Error(msg)
  }

  const reader = resp.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  const calls = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const [deltas, , rest, tcs] = parseSSE(buf)
    buf = rest
    calls.push(...tcs)
    for (const d of deltas) {
      full += d
      onDelta?.(d)
    }
  }
  return { text: full, toolCalls: calls }
}
