// Agentic chat loop: stream a completion with tools attached; when the model
// calls tools, execute them client-side, append the results, and go around
// again. The final (tool-free) answer streams to the UI like a plain chat
// turn. Each round is a separate worker request, so the daily spend cap
// pre-charges every round — an agentic turn can't slip past accounting.

import { streamChat } from './chatClient.js'
import { TOOL_DEFS, executeTool } from './tools.js'

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
export async function runAgentic({ model, system, messages, onDelta, onRound }) {
  const added = []
  const convo = () => [...messages, ...added]

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Last chance: drop the tools so the model must answer with what it has.
    const finalRound = round === MAX_ROUNDS - 1
    let text = ''
    const { toolCalls } = await streamChat({
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
      added.push({ role: 'assistant', content: text })
      onRound?.([...added])
      return added
    }

    added.push({ role: 'assistant', content: text, toolCalls })
    onRound?.([...added])
    for (const tc of toolCalls) {
      const result = await executeTool(tc.name, tc.args)
      added.push({ role: 'tool', id: tc.id, name: tc.name, content: result })
      onRound?.([...added])
    }
  }
  return added
}
