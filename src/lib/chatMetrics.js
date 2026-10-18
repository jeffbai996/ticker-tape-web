/** Reported counts only; timing excludes prompt processing and tool execution. */
export function chatMetrics({ usage, startedAt, endedAt, now = Date.now() }) {
  const count = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
  const input = count(usage?.in)
  const output = count(usage?.out)
  const elapsed = startedAt > 0 ? Math.max(0, (endedAt ?? now) - startedAt) / 1000 : null
  const seconds = count(usage?.decode_seconds)
  const tokens = count(usage?.decode_tokens)
  const inferenceSeconds=count(usage?.inference_seconds), inferenceTokens=count(usage?.inference_tokens)
  const totalSeconds=(seconds||0)+(inferenceSeconds||0), totalTokens=(tokens||0)+(inferenceTokens||0)
  return {input,output,elapsed,rate: totalSeconds>0 ? totalTokens/totalSeconds : null,rateSource:inferenceSeconds>0?'inference':'decoder'}
}

export function metricDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  if (seconds < 1) return `${Math.max(0, Math.round(seconds * 1000))}ms`
  const n = Math.floor(seconds)
  if (n < 60) return `${n}s`
  if (n < 3600) return `${Math.floor(n / 60)}m ${n % 60}s`
  return `${Math.floor(n / 3600)}h ${Math.floor(n % 3600 / 60)}m`
}

/** Providers may resend cumulative counters; only the latest per round counts. */
export function mergeTurnUsage(previous, round, reported={}) {
 const known=n=>typeof n==='number' && Number.isFinite(n) && n>=0
 const byRound={...(previous?.byRound || {})}
 byRound[round]={...(byRound[round] || {}),
  ...(known(reported.inference_seconds) ? {inference_seconds:reported.inference_seconds} : {}),
  ...(known(reported.decode_seconds) ? {decode_seconds:reported.decode_seconds} : {}),
  ...(known(reported.in) ? {in:reported.in} : {}),...(known(reported.out) ? {out:reported.out} : {})}
 const measured=Object.values(byRound).filter(u=>known(u.out) && known(u.decode_seconds) && u.decode_seconds>0)
 const inferred=Object.values(byRound).filter(u=>known(u.out) && !known(u.decode_seconds) && u.inference_seconds>0)
 const inputs=Object.values(byRound).map(u=>u.in).filter(known)
 const outputs=Object.values(byRound).map(u=>u.out).filter(known)
 return {byRound,...(inferred.length ? {inference_seconds:inferred.reduce((a,u)=>a+u.inference_seconds,0),inference_tokens:inferred.reduce((a,u)=>a+u.out,0)} : {}),...(measured.length ? {decode_seconds:measured.reduce((a,u)=>a+u.decode_seconds,0),decode_tokens:measured.reduce((a,u)=>a+u.out,0)} : {}),...(inputs.length ? {in:Math.max(...inputs)} : {}),
  ...(outputs.length ? {out:outputs.reduce((a,b)=>a+b,0)} : {})}
}
