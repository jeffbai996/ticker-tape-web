/** Use the same cached quotes and dates as the page; missing readings stay absent. */
export function chatRailData({symbols=[],quotes={},earnDays={},events=[]}={}) {
 const names=[...new Set(symbols)]
 const movers=names.map(sym=>({sym,pct:quotes[sym]?.quote?.pct})).filter(m=>Number.isFinite(m.pct))
  .sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct)).slice(0,8)
 const earnings=names.filter(s=>Number.isFinite(earnDays[s])&&earnDays[s]>=0)
  .map(symbol=>({symbol,days:earnDays[symbol]})).sort((a,b)=>a.days-b.days).slice(0,10)
 const signals=names.map(symbol=>({symbol,rsi:quotes[symbol]?.tech?.rsi,volume:quotes[symbol]?.tech?.volRatio}))
  .filter(s=>(Number.isFinite(s.rsi)&&(s.rsi<=30||s.rsi>=70))||s.volume>=2)
  .sort((a,b)=>Math.abs((b.rsi??50)-50)-Math.abs((a.rsi??50)-50)).slice(0,8)
 return {movers,earnings,signals,events:events.slice(0,6)}
}

/** RSI thresholds describe signal conditions, independent of market color order. */
export function rsiTone(value) {
 if(!Number.isFinite(value))return 'text-muted'
 return value<=30?'text-success':value>=70?'text-danger':'text-ink-2'
}
