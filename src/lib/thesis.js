// Thesis Watcher presentation data. The API remains the source of truth for
// verdicts; this module only turns its records into a compact, reviewable view.

export function thesisHealth(breakers) {
  const rows = Array.isArray(breakers) ? breakers : []
  const fired = rows.filter((row) => row.verdict === 'FIRED').length
  const clear = rows.filter((row) => row.verdict === 'CLEAR').length
  const review = rows.filter((row) => row.verdict !== 'FIRED' && row.verdict !== 'CLEAR').length
  return { state: fired ? 'BREACHED' : 'GOOD', fired, clear, review }
}

export function thesisSignals(events, limit = 8) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.headline && Number(event.meta?.thesis || 0) >= 2)
    .sort((a, b) => (b.ts_event || 0) - (a.ts_event || 0))
    .slice(0, limit)
}

export function thesisAnalysisPrompt(breakers, signals) {
  const conditions = (Array.isArray(breakers) ? breakers : [])
    .map((breaker) => `${breaker.id} [${breaker.verdict}]: ${breaker.description || 'No description.'}`)
    .join('\n') || 'No watch conditions are available.'
  const evidence = (Array.isArray(signals) ? signals : [])
    .map((signal) => `${signal.source || 'wire'}: ${signal.headline}${signal.url ? ` (${signal.url})` : ''}`)
    .join('\n') || 'No thesis-tagged wire signals are available in this window.'
  return `Review this Thesis Watcher snapshot using only the supplied conditions and wire evidence.

CONDITIONS
${conditions}

WIRE EVIDENCE
${evidence}

Return three concise sections: changed evidence, condition impact, and open evidence. Cite the relevant source line for each conclusion. Do not mark any breaker as fired. Do not make a trade recommendation.`
}
