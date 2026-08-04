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

/** One turn against fragwire's router. Returns the assistant's raw text. */
export async function wireComplete({ system, messages, signal }) {
  const base = wireUrl().replace(/\/$/, '')
  const resp = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages }),
    signal: signal || AbortSignal.timeout(180_000),
  })
  const out = await resp.json().catch(() => ({}))
  if (!out.ok) throw new Error(out.error || `wire chat ${resp.status}`)
  return { text: out.text || '', backend: out.backend || '' }
}
