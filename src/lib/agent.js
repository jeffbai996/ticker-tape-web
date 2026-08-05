// Agentic chat loop: stream a completion with tools attached; when the model
// calls tools, execute them client-side, append the results, and go around
// again. The final (tool-free) answer streams to the UI like a plain chat
// turn. Each round is a separate worker request, so the daily spend cap
// pre-charges every round — an agentic turn can't slip past accounting.

import { streamChat } from './chatClient.js'
import { TOOL_DEFS, executeTool } from './tools.js'
import {
  parseToolCall, toolProtocol, wireChatAvailable, wireComplete, wireStream,
} from './wirechat.js'

const MAX_ROUNDS = 6

/**
 * Trim chat history to at most `max` entries without orphaning tool messages:
 * the cut can only land on a user message, so an assistant tool-call and its
 * results are never separated (providers reject a tool result whose call is
 * missing). Exported for tests.
 */
export function trimHistory(history, max) {
  if (history.length <= max) return history
  for (let i = history.length - max; i < history.length; i++) {
    if (history[i].role === 'user' && !history[i].toolCalls) {
      return history.slice(i)
    }
  }
  // No user boundary in range (pathological) — keep just the tail turn.
  const lastUser = history.map((m) => m.role).lastIndexOf('user')
  return lastUser >= 0 ? history.slice(lastUser) : history.slice(-1)
}

/**
 * Run one agentic turn. `messages` is the neutral-shape transcript ending
 * with the new user message. Callbacks:
 *  - onDelta(text): streamed text of whichever round is running
 *  - onRound(entries): transcript grew — entries appended so far this turn
 * Resolves with the full list of new entries (assistant/tool messages).
 */
/**
 * Same loop, but over fragwire's subscription router. No native tool-calling
 * on that path, so tools ride the JSON protocol in wirechat.js — the model
 * answers with one JSON object to call a tool and prose to answer.
 */
function receiveFollowUps(takeFollowUps, added, onRound) {
  const followUps = takeFollowUps?.() || []
  if (!followUps.length) return
  added.push(...followUps)
  onRound?.([...added])
}

async function runAgenticOverWire({
  model, effort, system, messages, onDelta, onThinking, onRound, onTrace,
  takeFollowUps, signal,
}) {
  const added = []
  const sys = `${system}\n\n${toolProtocol()}`
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // A follow-up is a polite queue, not a barge-in: only splice it into the
    // transcript between provider rounds, when no request is in flight.
    receiveFollowUps(takeFollowUps, added, onRound)
    const convo = [...messages, ...added]
      .filter((m) => m.role !== 'tool' || m.content)
      .map((m) => (m.role === 'tool'
        ? { role: 'user', content: `TOOL_RESULT ${m.name}: ${m.content}` }
        : { role: m.role, content: m.content }))
    const last = round === MAX_ROUNDS - 1
    const roundSystem = last ? `${system}\n\nAnswer now with what you have.` : sys
    onTrace?.({ type: 'model_start', round })
    // Stream when the wire supports it — a tool-call round streams JSON, so
    // the UI-side paint filters that out (chat.jsx showLive). Fall back to
    // the one-shot endpoint on any pre-output failure (older fragwire).
    let text = ''
    try {
      ;({ text } = await wireStream({
        model, effort, system: roundSystem, messages: convo,
        onDelta,
        onThinking: (delta) => {
          onThinking?.(delta)
          onTrace?.({ type: 'thinking', round, delta })
        },
        signal,
      }))
    } catch (err) {
      if (signal?.aborted) throw err        // a user stop is not a fallback case
      ;({ text } = await wireComplete({
        model, effort, system: roundSystem, messages: convo,
      }))
    }
    if (signal?.aborted) throw new DOMException('stopped', 'AbortError')
    const call = last ? null : parseToolCall(text)
    if (!call) {
      onTrace?.({ type: 'model_done', round, outcome: 'answer' })
      added.push({ role: 'assistant', content: text })
      onRound?.([...added])
      return added
    }
    const id = `w${round}`
    onTrace?.({ type: 'model_done', round, outcome: 'tool' })
    added.push({ role: 'assistant', content: '', toolCalls: [{ id, name: call.name, args: call.args }] })
    onRound?.([...added])
    onTrace?.({ type: 'tool_start', round, id, name: call.name, args: call.args })
    let result
    try {
      result = await executeTool(call.name, call.args)
    } catch (err) {
      onTrace?.({
        type: 'tool_error', round, id, name: call.name,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
    onTrace?.({ type: 'tool_done', round, id, name: call.name })
    added.push({ role: 'tool', id, name: call.name, content: result })
    onRound?.([...added])
  }
  return added
}

export async function runAgentic({
  model, effort, system, messages, onDelta, onThinking, onRound, onTrace,
  takeFollowUps, signal,
}) {
  // Private build talks to the user's own router; the metered API is the
  // fallback for anyone without one.
  if (wireChatAvailable()) {
    return runAgenticOverWire({
      model, effort, system, messages, onDelta, onThinking, onRound, onTrace,
      takeFollowUps, signal,
    })
  }
  const added = []
  const convo = () => [...messages, ...added]

  for (let round = 0; round < MAX_ROUNDS; round++) {
    receiveFollowUps(takeFollowUps, added, onRound)
    // Last chance: drop the tools so the model must answer with what it has.
    const finalRound = round === MAX_ROUNDS - 1
    let text = ''
    onTrace?.({ type: 'model_start', round })
    const { toolCalls } = await streamChat({
      effort,
      model,
      system,
      messages: convo(),
      tools: finalRound ? undefined : TOOL_DEFS,
      onDelta: (d) => {
        text += d
        onDelta?.(d)
      },
    })

    if (!toolCalls.length) {
      onTrace?.({ type: 'model_done', round, outcome: 'answer' })
      added.push({ role: 'assistant', content: text })
      onRound?.([...added])
      return added
    }

    onTrace?.({ type: 'model_done', round, outcome: 'tool' })
    added.push({ role: 'assistant', content: text, toolCalls })
    onRound?.([...added])
    for (const tc of toolCalls) {
      onTrace?.({ type: 'tool_start', round, id: tc.id, name: tc.name, args: tc.args })
      let result
      try {
        result = await executeTool(tc.name, tc.args)
      } catch (err) {
        onTrace?.({
          type: 'tool_error', round, id: tc.id, name: tc.name,
          error: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
      onTrace?.({ type: 'tool_done', round, id: tc.id, name: tc.name })
      added.push({ role: 'tool', id: tc.id, name: tc.name, content: result })
      onRound?.([...added])
    }
  }
  return added
}
