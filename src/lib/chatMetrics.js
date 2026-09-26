/** Reported usage only. Turn throughput includes reasoning, tools and waiting. */
export function chatMetrics({ usage, startedAt, endedAt, now = Date.now() }) {
  const count = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
  const input = count(usage?.in)
  const output = count(usage?.out)
  const elapsed = startedAt > 0 ? Math.max(0, (endedAt ?? now) - startedAt) / 1000 : null
  return { input, output, elapsed, rate: output != null && elapsed > 0 ? output / elapsed : null }
}

export function metricDuration(seconds) {
  if (seconds == null) return '—'
  const n = Math.floor(seconds)
  if (n < 60) return `${n}s`
  if (n < 3600) return `${Math.floor(n / 60)}m ${n % 60}s`
  return `${Math.floor(n / 3600)}h ${Math.floor(n % 3600 / 60)}m`
}
