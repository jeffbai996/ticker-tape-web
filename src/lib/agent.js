import {temporaryToolAllowed,temporaryToolError,temporaryTools} from './chatPrivacy.js'
import {IS_FAMILY_AI} from './nav.js'
// Agentic chat loop: stream a completion with tools attached; when the model
// calls tools, execute them client-side, append the results, and go around
// again. The final (tool-free) answer streams to the UI like a plain chat
// turn. Each round is a separate worker request, so the daily spend cap
// pre-charges every round — an agentic turn can't slip past accounting.

import { contextualMessages } from './chatHandoff.js'
import { streamChat } from './chatClient.js'
import { TOOL_DEFS, executeTool, APP_READ_TOOLS, VISUAL_TOOLS } from './tools.js'
import {
  isPlanningStub, parseToolCall, toolProtocol, wireChatAvailable, wireComplete,
  wireStream, newTurnId,
} from './wirechat.js'

const MAX_ROUNDS = 12
const MAX_TOOL_CALLS = 12
const ANALYSIS_TOOLS = new Set([...APP_READ_TOOLS,...VISUAL_TOOLS,'wire_search','get_quotes','get_technicals','get_earnings','get_market_pulse','get_watchlist','get_calendar','journal_search'])
const analysisRequest = messages => !!messages.findLast(m=>m.role==='user')?.context
const analysisResult = () => JSON.stringify({error:'This contextual analysis can only read data. Request changes in a separate chat message.'})
const INITIAL_TOOLS=new Set([...APP_READ_TOOLS,...VISUAL_TOOLS])
/** A tool run yields the model-facing text and, for chart tools, a block for the transcript. */
const toolOutcome = (result) => (result && typeof result === 'object' && typeof result.content === 'string'
  ? result : { content: typeof result === 'string' ? result : JSON.stringify(result ?? null) })
const toolRecord = (id, name, outcome) => ({ role: 'tool', id, name, content: outcome.content, ...(outcome.block ? { block: outcome.block } : {}) })

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
  takeFollowUps, signal, initialTools = [], temporary = false,
}, services = {}) {
  const streamTurn = services.wireStream || wireStream
  const completeTurn = services.wireComplete || wireComplete
  const execute = services.executeTool || executeTool
  const definitions=temporary ? temporaryTools(TOOL_DEFS) : TOOL_DEFS
  let effectiveModel=model, effectiveEffort=effort, effectiveLabel=''
  let toolCalls=0
  const runTool=(...args)=>{
    if(toolCalls>=MAX_TOOL_CALLS)throw new Error('This prompt reached its tool-call limit. Please narrow the request.')
    toolCalls++;return temporary && !temporaryToolAllowed(args[0],args[1]) ? temporaryToolError() : execute(args[0],args[1],{rich:true})
  }
  const turnId=newTurnId(),sendIds=[turnId]
  const added = []
  // Full provider transcript, including hidden corrective nudges. `added` is
  // only what belongs in the user's visible/persisted conversation.
  const contextAdded = []
  let readOnly = analysisRequest(messages)
  // Refresh visible state after historical replies so earlier access claims
  // cannot masquerade as the current browser's capabilities.
  for(const [index,call] of initialTools.entries()) {
    if(!INITIAL_TOOLS.has(call.name))throw new Error('Initial context tools must be read-only.')
    const id=`context-${index}`
    onTrace?.({type:'tool_start',round:-1,id,name:call.name,args:call.args||{}})
    const outcome=toolOutcome(await runTool(call.name,call.args||{}))
    const entries=[{role:'assistant',content:'',toolCalls:[{id,name:call.name,args:call.args||{}}]},
      toolRecord(id,call.name,outcome)]
    added.push(...entries);contextAdded.push(...entries)
    onTrace?.({type:'tool_done',round:-1,id,name:call.name,result:outcome.content})
    onRound?.([...added])
  }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // A follow-up is a polite queue, not a barge-in: only splice it into the
    // transcript between provider rounds, when no request is in flight.
    const beforeFollowUps = added.length
    receiveFollowUps(takeFollowUps, added, onRound)
    if (added.length > beforeFollowUps) {
      const followUps=added.slice(beforeFollowUps)
      contextAdded.push(...followUps)
      sendIds.push(...followUps.filter(m=>m.role==='user').map(()=>newTurnId()))
    }
    readOnly ||= analysisRequest(added)
    const sys = `${system}\n\n${toolProtocol(readOnly ? definitions.filter(t=>ANALYSIS_TOOLS.has(t.name)) : definitions)}`
    const convo = [...messages, ...contextAdded]
      .filter((m) => m.role !== 'tool' || m.content)
      .map((m) => (m.role === 'tool'
        ? { role: 'user', content: `TOOL_RESULT ${m.name}: ${m.content}` }
        : { role: m.role, content: m.content,context:m.context }))
    const last = round === MAX_ROUNDS - 1 || toolCalls>=MAX_TOOL_CALLS
    const roundSystem = last ? `${system}\n\nAnswer now with what you have.` : sys
    onTrace?.({ type: 'model_start', round })
    // Stream when the wire supports it — a tool-call round streams JSON, so
    // the UI-side paint filters that out (chat.jsx showLive). Fall back to
    // the one-shot endpoint on any pre-output failure (older newsservice).
    let text = ''
    try {
      ;({ text } = await streamTurn({
        model:effectiveModel, effort:effectiveEffort,
        system:effectiveModel===model ? roundSystem : `${roundSystem}\n\nACTIVE MODEL UPDATE: The actual model for this response is ${effectiveLabel}, with ${effectiveEffort} reasoning effort. This replaces earlier selected-model metadata.`, messages: contextualMessages(convo),turnId,sendIds:[...sendIds],
        onDelta,
        onModel: (selection) => {
          effectiveModel=selection.key;effectiveEffort=selection.effort;effectiveLabel=selection.label
          onTrace?.({type:'model',round,...selection})
        },
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
        model:effectiveModel, effort:effectiveEffort, system: roundSystem, messages: contextualMessages(convo),turnId,sendIds:[...sendIds],
      })
      text = completed.text
      if(completed.fallback_from) {
        effectiveModel=completed.backend;effectiveEffort=completed.effort;effectiveLabel=completed.model_label
        onTrace?.({type:'model',round,key:effectiveModel,label:effectiveLabel,effort:effectiveEffort,fallback_from:completed.fallback_from,reason:'provider_limit'})
      }
      if (completed.usage) onTrace?.({type:'usage',round,usage:completed.usage})
    }
    if (signal?.aborted) throw new DOMException('stopped', 'AbortError')
    const parsedCall = parseToolCall(text)
    if(last && parsedCall)throw new Error('This prompt reached its tool-call limit. Please narrow the request.')
    const call = last ? null : parsedCall
    if (!call) {
      const needsAnotherRound = !last
        && contextAdded.some((entry) => entry.role === 'tool')
        && isPlanningStub(text)
      onTrace?.({
        type: 'model_done', round,
        outcome: needsAnotherRound ? 'continue' : 'answer',
        ...(needsAnotherRound ? { commentary: text } : {}),
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
    let outcome
    try {
      outcome = toolOutcome(readOnly && !ANALYSIS_TOOLS.has(call.name) ? analysisResult() : await runTool(call.name, call.args))
    } catch (err) {
      onTrace?.({
        type: 'tool_error', round, id, name: call.name,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
    onTrace?.({ type: 'tool_done', round, id, name: call.name, result: outcome.content })
    const resultEntry = toolRecord(id, call.name, outcome)
    added.push(resultEntry)
    contextAdded.push(resultEntry)
    onRound?.([...added])
  }
  return added
}

export async function runAgentic({
  model, effort, system, messages, onDelta, onThinking, onRound, onTrace,
  takeFollowUps, signal, initialTools = [], temporary = false,
}) {
  // Private build talks to the user's own router; the metered API is the
  // fallback for anyone without one.
  if (wireChatAvailable()) {
    return runAgenticOverWire({
      model, effort, system, messages, onDelta, onThinking, onRound, onTrace,
      takeFollowUps, signal, initialTools, temporary,
    })
  }
  const added = []
  const convo = () => [...messages, ...added]
  const definitions=temporary ? temporaryTools(TOOL_DEFS) : TOOL_DEFS
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
      tools: finalRound ? undefined : readOnly ? definitions.filter(t=>ANALYSIS_TOOLS.has(t.name)) : definitions,
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
      let outcome
      try {
        outcome = toolOutcome(temporary && !temporaryToolAllowed(tc.name,tc.args) ? temporaryToolError() : readOnly && !ANALYSIS_TOOLS.has(tc.name) ? analysisResult() : await executeTool(tc.name, tc.args, { rich: true }))
      } catch (err) {
        onTrace?.({
          type: 'tool_error', round, id: tc.id, name: tc.name,
          error: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
      onTrace?.({ type: 'tool_done', round, id: tc.id, name: tc.name, result: outcome.content })
      added.push(toolRecord(tc.id, tc.name, outcome))
      onRound?.([...added])
    }
  }
  return added
}
