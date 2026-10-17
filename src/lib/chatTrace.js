/** Remove lightweight Markdown emphasis from provider reasoning/status text.
 * Final answers still go through the Markdown renderer; this is only for the
 * compact execution trace, where literal ** plumbing looks broken. */
export function plainTraceText(text) {
  return String(text || '')
    .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
    .replace(/__([\s\S]*?)__/g, '$1')
}

/** A streamed trace replaces the older tool-call messages in the same turn. */
export function hasTurnActivity(history, index, liveSteps = []) {
  for (let i = index + 1; i < history.length; i++) {
    if (history[i].role === 'user') return false
    if (history[i].trace?.length) return true
  }
  return liveSteps.length > 0
}

/** Preserve model rounds, with the tools each round requested nested below. */
export function activityGroups(steps) {
  const groups = []
  for (const step of steps) {
    if (step.kind === 'model') groups.push({model:step, tools:[]})
    else {
      if (!groups.length) groups.push({model:null, tools:[]})
      groups[groups.length-1].tools.push(step)
    }
  }
  return groups
}
