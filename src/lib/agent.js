import {IS_FAMILY_AI} from './nav.js'
// Agentic chat loop: stream a completion with tools attached; when the model
// calls tools, execute them client-side, append the results, and go around
// again. The final (tool-free) answer streams to the UI like a plain chat
// turn. Each round is a separate worker request, so the daily spend cap
// pre-charges every round — an agentic turn can't slip past accounting.

import { contextualMessages } from './chatHandoff.js'
import { streamChat } from './chatClient.js'
import { TOOL_DEFS, executeTool, APP_READ_TOOLS } from './tools.js'
import {
  isPlanningStub, parseToolCall, toolProtocol, wireChatAvailable, wireComplete,
  wireStream,
} from './wirechat.js'

const MAX_ROUNDS = 12
const ANALYSIS_TOOLS = new Set([...APP_READ_TOOLS,'wire_search','get_quotes','get_technicals','get_earnings','get_market_pulse','get_watchlist','get_calendar','journal_search'])
const analysisRequest = messages => !!messages.findLast(m=>m.role==='user')?.context
const analysisResult = () => JSON.stringify({error:'This contextual analysis can only read data. Request changes in a separate chat message.'})

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
 * Same loop, but over newsservice's subscription router. No native tool-calling
 * on that path, so tools ride the JSON protocol in wirechat.js — the model
 * answers with one JSON object to call a tool and prose to answer.
 */
function receiveFollowUps(takeFollowUps, added, onRound) {
  const followUps = takeFollowUps?.() || []
  if (!followUps.length) return
  added.push(...followUps)
  onRound?.([...added])
}

export async function runAgenticOverWire({
  model, effort, system, messages, onDelta, onThinking, onRound, onTrace,
  takeFollowUps, signal, initialTools = [],
}, services = {}) {
  const streamTurn = services.wireStream || wireStream
  const completeTurn = services.wireComplete || wireComplete
  const runTool = services.executeTool || executeTool
  const added = []
  // Full provider transcript, including hidden corrective nudges. `added` is
  // only what belongs in the user's visible/persisted conversation.
  const contextAdded = []
  let readOnly = analysisRequest(messages)
  // Refresh visible state after historical replies so earlier access claims
  // cannot masquerade as the current browser's capabilities.
  for(const [index,call] of initialTools.entries()) {
    if(!APP_READ_TOOLS.includes(call.name))throw new Error('Initial context tools must be read-only.')
    const id=`context-${index}`
    onTrace?.({type:'tool_start',round:-1,id,name:call.name,args:call.args||{}})
    const result=await runTool(call.name,call.args||{})
    const entries=[{role:'assistant',content:'',toolCalls:[{id,name:call.name,args:call.args||{}}]},
      {role:'tool',id,name:call.name,content:result}]
    added.push(...entries);contextAdded.push(...entries)
    onTrace?.({type:'tool_done',round:-1,id,name:call.name})
    onRound?.([...added])
  }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // A follow-up is a polite queue, not a barge-in: only splice it into the
    // transcript between provider rounds, when no request is in flight.
    const beforeFollowUps = added.length
    receiveFollowUps(takeFollowUps, added, onRound)
    if (added.length > beforeFollowUps) {
      contextAdded.push(...added.slice(beforeFollowUps))
    }
    readOnly ||= analysisRequest(added)
    const sys = `${system}\n\n${toolProtocol(readOnly ? TOOL_DEFS.filter(t=>ANALYSIS_TOOLS.has(t.name)) : TOOL_DEFS)}`
    const convo = [...messages, ...contextAdded]
      .filter((m) => m.role !== 'tool' || m.content)
      .map((m) => (m.role === 'tool'
        ? { role: 'user', content: `TOOL_RESULT ${m.name}: ${m.content}` }
        : { role: m.role, content: m.content,context:m.context }))
    const last = round === MAX_ROUNDS - 1
    const roundSystem = last ? `${system}\n\nAnswer now with what you have.` : sys
    onTrace?.({ type: 'model_start', round })
    // Stream when the wire supports it — a tool-call round streams JSON, so
    // the UI-side paint filters that out (chat.jsx showLive). Fall back to
    // the one-shot endpoint on any pre-output failure (older newsservice).
    let text = ''
    try {
      ;({ text } = await streamTurn({
        model, effort, system: roundSystem, messages: contextualMessages(convo),
        onDelta,
        onThinking: (delta) => {
          onThinking?.(delta)
          onTrace?.({ type: 'thinking', round, delta })
        },
        onThinkingTokens: (tokens) => onTrace?.({ type: 'thinking_tokens', round, tokens }),
        onUsage: (usage) => onTrace?.({ type: 'usage', round, usage }),
        signal,
      }))
    } catch (err) {
      if (IS_FAMILY_AI || signal?.aborted || err?.partial) throw err // never restart after visible output
      const completed = await completeTurn({
        model, effort, system: roundSystem, messages: contextualMessages(convo),
      })
      text = completed.text
      if (completed.usage) onTrace?.({type:'usage',round,usage:completed.usage})
    }
    if (signal?.aborted) throw new DOMException('stopped', 'AbortError')
    const call = last ? null : parseToolCall(text)
    if (!call) {
      const needsAnotherRound = !last
        && contextAdded.some((entry) => entry.role === 'tool')
        && isPlanningStub(text)
      onTrace?.({
        type: 'model_done', round,
        outcome: needsAnotherRound ? 'continue' : 'answer',
      })
      if (needsAnotherRound) {
        contextAdded.push(
          { role: 'assistant', content: text },
          {
            role: 'user',
            content: 'Continue the original request now. Do not narrate what you still need. Call the available tools directly, or give the complete answer if you already have enough data.',
          },
        )
        // Clears the planning stub from the live answer without persisting it.
        onRound?.([...added])
        continue
      }
      added.push({ role: 'assistant', content: text })
      onRound?.([...added])
      return added
    }
    const id = `w${round}`
    onTrace?.({ type: 'model_done', round, outcome: 'tool' })
    const callEntry = {
      role: 'assistant', content: '',
      toolCalls: [{ id, name: call.name, args: call.args }],
    }
    added.push(callEntry)
    contextAdded.push(callEntry)
    onRound?.([...added])
    onTrace?.({ type: 'tool_start', round, id, name: call.name, args: call.args })
    let result
    try {
      result = readOnly && !ANALYSIS_TOOLS.has(call.name) ? analysisResult() : await runTool(call.name, call.args)
    } catch (err) {
      onTrace?.({
        type: 'tool_error', round, id, name: call.name,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
    onTrace?.({ type: 'tool_done', round, id, name: call.name })
    const resultEntry = { role: 'tool', id, name: call.name, content: result }
    added.push(resultEntry)
    contextAdded.push(resultEntry)
    onRound?.([...added])
  }
  return added
}

export async function runAgentic({
  model, effort, system, messages, onDelta, onThinking, onRound, onTrace,
  takeFollowUps, signal, initialTools = [],
}) {
  // Private build talks to the user's own router; the metered API is the
  // fallback for anyone without one.
  if (wireChatAvailable()) {
    return runAgenticOverWire({
      model, effort, system, messages, onDelta, onThinking, onRound, onTrace,
      takeFollowUps, signal, initialTools,
    })
  }
  const added = []
  const convo = () => [...messages, ...added]
  let readOnly = analysisRequest(messages)

  for (let round = 0; round < MAX_ROUNDS; round++) {
    receiveFollowUps(takeFollowUps, added, onRound)
    readOnly ||= analysisRequest(added)
    // Last chance: drop the tools so the model must answer with what it has.
    const finalRound = round === MAX_ROUNDS - 1
    let text = ''
    onTrace?.({ type: 'model_start', round })
    const { toolCalls } = await streamChat({
      effort,
      model,
      system,
      messages: contextualMessages(convo()),
      tools: finalRound ? undefined : readOnly ? TOOL_DEFS.filter(t=>ANALYSIS_TOOLS.has(t.name)) : TOOL_DEFS,
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
        result = readOnly && !ANALYSIS_TOOLS.has(tc.name) ? analysisResult() : await executeTool(tc.name, tc.args)
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
