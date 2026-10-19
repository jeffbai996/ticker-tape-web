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

/** Native tool identity wins; older saved traces still have their visible label. */
export function traceIcon(step={}) {
 const text=String(step.name||step.label||step.verb||'').toLowerCase()
 if(step.kind==='model')return /answer/.test(text)?'answer':'thinking'
 if(/portfolio|holding/.test(text))return 'portfolio'
 if(/calendar|earnings|events/.test(text))return 'calendar'
 if(/market|tape|technical|quotes/.test(text))return 'market'
 if(/article|research|news|read|brows/.test(text))return 'read'
 return 'search'
}

/** A small, stable vocabulary describes the work actually present in the trace. */
export function completionLabel(steps=[]) {
 const tools=steps.filter(s=>s.kind==='tool')
 if(tools.some(s=>/market_pulse|the tape/i.test(s.name||s.label||'')))return 'Read the tape for'
 if(tools.some(s=>/technical|research|quotes/i.test(s.name||s.label||'')))return 'Analyzed for'
 return tools.length?'Reviewed for':'Worked for'
}

/** Keep a readable, bounded copy in the trace; the model still gets the full result. */
export function tracePrintout(value, limit = 16000) {
  if (value == null) return ''
  let text = value
  if (typeof text === 'string') {
    try { text = JSON.parse(text) } catch { /* plain text stays literal */ }
  }
  text = typeof text === 'string' ? text : JSON.stringify(text, null, 2)
  return text.length > limit ? `${text.slice(0, limit)}\n…` : text
}

/** Older traces saved tool bodies in the transcript rather than the step. */
export function traceToolDetails(steps, history, index) {
  let start = index
  while (start > 0 && history[start - 1].role !== 'user') start -= 1
  const turn = history.slice(start, index + 1)
  const calls = new Map(turn.flatMap(message => message.toolCalls || []).map(call => [String(call.id), call]))
  const results = new Map(turn.filter(message => message.role === 'tool').map(message => [String(message.id), message.content]))
  return steps.map(step => {
    if (step.kind !== 'tool') return step
    const id = String(step.key || '').replace(/^tool-/, '')
    const args = calls.get(id)?.args
    return {
      ...step,
      input: step.input || (args && Object.keys(args).length ? tracePrintout(args, 4000) : ''),
      output: step.output || tracePrintout(results.get(id)),
    }
  })
}
