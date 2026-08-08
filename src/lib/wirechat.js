// Chat over the user's own fragwire, so the assistant runs on their Claude /
// agy subscription instead of a metered API. The router's legs are plain
// text-in/text-out, so tool use rides a JSON protocol rather than the API's
// native tool-calling: the model answers with a single JSON object when it
// wants a tool, and prose otherwise.

import { TOOL_DEFS } from './tools.js'
import { wireUrl } from './wire.js'

/** Is the private, subscription-backed path available in this browser? */
export function wireChatAvailable() {
  return !!wireUrl()
}

/** Fetch the selectable subscription models from the live router. */
export async function fetchWireChatModels() {
  const base = wireUrl().replace(/\/$/, '')
  const resp = await fetch(`${base}/api/chat/models`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!resp.ok) throw new Error(`wire chat models ${resp.status}`)
  const out = await resp.json()
  if (!out.ok || !Array.isArray(out.models)) throw new Error('invalid wire chat models')
  return out.models
}

/** The tool contract, spelled out for a model with no tool-calling API. */
export function toolProtocol(defs = TOOL_DEFS) {
  const lines = defs.map((d) => {
    const props = Object.entries(d.parameters?.properties || {})
      .map(([k, v]) => `${k}${(d.parameters.required || []).includes(k) ? '' : '?'}: ${v.type}`)
      .join(', ')
    return `- ${d.name}(${props}) — ${d.description}`
  })
  return [
    'TOOLS. When you need live data or want to act, reply with ONE JSON object',
    'and nothing else: {"tool": "<name>", "args": {…}}. You will then receive a',
    'line beginning TOOL_RESULT and may either call another tool or answer.',
    'When you are answering the user, reply in plain prose with no JSON.',
    '',
    ...lines,
  ].join('\n')
}

/**
 * Pull a tool call out of a model turn. Tolerates fenced code blocks and
 * leading prose, and refuses anything that isn't a known tool so ordinary
 * sentences containing braces don't get mistaken for a call.
 */
export function parseToolCall(text, defs = TOOL_DEFS) {
  if (!text) return null
  const names = new Set(defs.map((d) => d.name))
  const body = text.replace(/```(?:json)?/gi, '').trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed.tool !== 'string' || !names.has(parsed.tool)) return null
  return {
    name: parsed.tool,
    args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {},
  }
}

/**
 * Streaming turn against fragwire's SSE twin. Calls onDelta(text) and
 * onThinking(text) as chunks land; resolves with the full text. Throws before
 * any output if the endpoint is missing so callers can fall back to
 * wireComplete.
 */
export async function wireStream({ model, effort, system, messages, onDelta, onThinking,
                                  onThinkingTokens, onUsage, signal }) {
  const base = wireUrl().replace(/\/$/, '')
  const resp = await fetch(`${base}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, effort, system, messages }),
    signal,
  })
  if (!resp.ok || !resp.body) throw new Error(`wire stream ${resp.status}`)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let backend = ''
  let failed = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // SSE frames are blank-line separated; keep the trailing partial in buf
    const frames = buf.split('\n\n')
    buf = frames.pop()
    for (const frame of frames) {
      let event = 'message'
      let data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        else if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (!data) continue
      let payload
      try { payload = JSON.parse(data) } catch { continue }
      if (event === 'delta') {
        if (payload.t === 'text') { text += payload.d; onDelta?.(payload.d) }
        else if (payload.t === 'thinking') onThinking?.(payload.d)
        // Claude 5's adaptive thinking omits the text and reports depth only —
        // the running token estimate is the honest stand-in (2026-08-07)
        else if (payload.t === 'thinking_tokens') onThinkingTokens?.(Number(payload.d) || 0)
        // live token usage — {in, out}, re-sent as output grows, so the header
        // can count up the way the CLI does instead of only knowing at the end
        else if (payload.t === 'usage') {
          try { onUsage?.(JSON.parse(payload.d)) } catch { /* malformed frame */ }
        }
      } else if (event === 'done') {
        backend = payload.backend || ''
      } else if (event === 'error') {
        failed = new Error(payload.error || 'wire stream failed')
      }
    }
  }
  if (failed && !text) throw failed
  return { text, backend }
}

/** One turn against fragwire's router. Returns the assistant's raw text. */
export async function wireComplete({ model, effort, system, messages, signal }) {
  const base = wireUrl().replace(/\/$/, '')
  const resp = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, effort, system, messages }),
    signal: signal || AbortSignal.timeout(180_000),
  })
  const out = await resp.json().catch(() => ({}))
  if (!out.ok) throw new Error(out.error || `wire chat ${resp.status}`)
  return { text: out.text || '', backend: out.backend || '' }
}
