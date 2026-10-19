/** Contextual prompt suggestions, balanced by topic before presentation. */
import { t as tt, tl, getLocale } from './i18n.js'
import {holdingCurrency} from './fx.js'

function alertPrice(value,currency) {
 if(!/^[A-Z]{3}$/.test(currency))return `${value} ${currency}`
 try{return new Intl.NumberFormat(getLocale()==='zh'?'zh-CN':'en-US',{style:'currency',currency,currencyDisplay:getLocale()==='zh'?'name':'code',minimumFractionDigits:0,maximumFractionDigits:8}).format(value)}catch{return `${value} ${currency}`}
}

const VARIED = new Set(["technical", "mover", "earnings_preview", "book_position", "book_risk", "calendar", "rates", "heatmap", "compare", "valuation", "watchlist_review", "strongest"])

const SUGGESTIONS = [
  ['moving','mkt'], ['sector','mkt'], ['breadth','mkt'], ['cross_market','mkt'],
  ['technical','mkt',true], ['strongest','mkt'],
  ['calendar','macro'], ['week_ahead','macro'], ['rates','macro'],
  ['macro_priority','macro'], ['oil_bonds','macro'], ['dollar_effect','macro'],
  ['compare','idea',true], ['thesis_check','idea',true], ['valuation','idea',true],
  ['bear_case','idea',true], ['scenarios','idea'], ['decision_review','idea'],
  ['earnings_calendar','earn'], ['earnings_quality','earn'], ['earnings_signals','earn'],
  ['book_position','book'], ['book_risk','book'], ['book_concentration','book'],
  ['book_drivers','book'], ['book_currency','book'], ['book_cash','book'],
  ['heatmap','app'], ['research','app',true], ['watchlist_review','app'],
  ['explain','app'], ['last_week','app'],
]

export function dynamicActions({ watchlist, quotes, earnDays, nextEvent, book, journal, edition=0 }) {
  const acts=[], families=new Map()
  const add=(name,k,params)=>{
    const family=`chat.action_${name}`
    const variation=VARIED.has(name)?(edition+(families.get(family)||0))%3:0
    const t=tt(family+(variation?'_'+(variation+1):''),params)
    // A second company can be useful; a wall of the same question is not.
    if((families.get(family)||0)>=2 || acts.some(a=>a.t===t))return
    acts.push({t,k,family});families.set(family,(families.get(family)||0)+1)
  }
  for(const symbol of watchlist.filter(s=>earnDays[s]===0).slice(0,2))add('earnings_summary','earn',{symbol})
  watchlist.filter(s=>earnDays[s]>0 && earnDays[s]<=7)
    .sort((a,b)=>earnDays[a]-earnDays[b]).slice(0,3).forEach((symbol,i)=>
      add(['earnings_preview','earnings_expectations','earnings_risks'][i],'earn',{symbol,days:earnDays[symbol]}))
  const movers=watchlist.map(symbol=>({symbol,...quotes[symbol]?.quote}))
    .filter(q=>q.pct!=null && Math.abs(q.pct)>=3).sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct))
  movers.slice(0,3).forEach((m,i)=>add(['mover','mover_sector','mover_news'][i],'mkt',{
    symbol:m.symbol,direction:tl(m.pct>0?'up':'down'),pct:Math.abs(m.pct).toFixed(1)}))
  if(nextEvent && nextEvent.days<=7)add('event','macro',{
    event:tl(nextEvent.rawLabel||nextEvent.label),
    when:nextEvent.days===0?tl('today'):tt('common.days',{days:nextEvent.days}),
    target:tl(book?'my book':'the market')})
  const top=movers[0]
  if(top?.price){
    const level=top.pct>0?Math.ceil(top.price*1.03/5)*5:Math.floor(top.price*.97/5)*5
    add('alert','app',{symbol:top.symbol,level:alertPrice(level,holdingCurrency(top.symbol,top))})
  }
  const badges=watchlist.map(symbol=>({symbol,...quotes[symbol]?.tech}))
  const stretched=badges.filter(b=>b.rsi!=null&&(b.rsi>=70||b.rsi<=30))
    .sort((a,b)=>Math.abs(b.rsi-50)-Math.abs(a.rsi-50))[0]
  if(stretched)add('stretched','mkt',{symbol:stretched.symbol,rsi:Math.round(stretched.rsi)})
  const spike=badges.filter(b=>b.volRatio>=2).sort((a,b)=>b.volRatio-a.volRatio)[0]
  if(spike)add('vol_spike','mkt',{symbol:spike.symbol,mult:spike.volRatio.toFixed(1)})
  const overnight=watchlist.map(symbol=>({symbol,pct:quotes[symbol]?.quote?.extPct}))
    .filter(q=>q.pct!=null&&Math.abs(q.pct)>=1.5).sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct))[0]
  if(overnight)add('overnight','mkt',{symbol:overnight.symbol,pct:overnight.pct.toFixed(1)})
  const leader=badges.filter(b=>b.rs!=null&&Math.abs(b.rs)>=5).sort((a,b)=>Math.abs(b.rs)-Math.abs(a.rs))[0]
  // Relative strength is signed: a laggard is 跑输, not 跑赢 by a negative number.
  if(leader)add(leader.rs>=0?'rs':'rs_lag','mkt',{symbol:leader.symbol,pct:Math.abs(leader.rs).toFixed(1)})
  const nearHigh=badges.filter(b=>b.offHigh!=null&&b.offHigh<=3).sort((a,b)=>a.offHigh-b.offHigh)[0]
  if(nearHigh)add('near_high','mkt',{symbol:nearHigh.symbol,pct:nearHigh.offHigh.toFixed(1)})
  const tagged=[...(journal||[])].reverse().find(e=>e.symbols?.length)
  if(tagged)add('journal','app',{symbol:tagged.symbols[0]})
  let cursor=edition
  for(const [name,k,needsSymbol] of SUGGESTIONS){
    if(k==='book'&&!book)continue
    if(needsSymbol&&!watchlist.length)continue
    const symbol=needsSymbol?watchlist[(cursor++)%watchlist.length]:null
    add(name,k,symbol?{symbol}:undefined)
  }
  return balanceActions(acts,edition)
}

/** Round-robin topics so a large watchlist cannot bury macro or portfolio prompts. */
function balanceActions(actions,edition){
  const lanes=[...new Set(actions.map(a=>a.k))]
  const queues=lanes.map(k=>{
    const lane=actions.filter(a=>a.k===k),rest=lane.slice(2)
    const start=rest.length?(edition*2)%rest.length:0
    return [...lane.slice(0,2),...rest.slice(start),...rest.slice(0,start)].slice(0,6)
  }),out=[]
  let round=0
  while(queues.some(q=>q.length)){
    for(let i=0;i<queues.length;i++){const queue=queues[(round*2+i)%queues.length];if(queue.length)out.push(queue.shift())}
    round++
  }
  return out
}

/** Contiguous slices of an interleaved pool keep each row mixed. */
export function actionRows(actions,count=4){
  const n=Math.min(count,Math.ceil(actions.length/4))
  return Array.from({length:n},(_,i)=>actions.slice(Math.floor(i*actions.length/n),Math.floor((i+1)*actions.length/n)))
}

/** How many pills the pad shows at once. */
export const PAD_SIZE = 12

/**
 * The lanes a prompt can belong to. `dot` is a tailwind background so the
 * filter chip and the pill agree on colour without a second lookup.
 * Category colours stay stable when the market gain/loss palette changes.
 */
export const LANES = [
  { k: 'mkt', label: 'markets', dot: 'bg-accent' },
  { k: 'earn', label: 'earnings', dot: 'bg-[#e89b72]' },
  { k: 'macro', label: 'macro', dot: 'bg-[#58a6ff]' },
  { k: 'idea', label: 'ideas', dot: 'bg-[#b392f0]' },
  { k: 'book', label: 'book', dot: 'bg-[#3fb950]' },
  { k: 'app', label: 'app', dot: 'bg-[#8b949e]' },
]

/** Lanes actually represented in a pool, in LANES order — so the filter row
 *  never offers a category that would come back empty. */
export function activeLanes(pool) {
  const present = new Set(pool.map((a) => a.k))
  return LANES.filter((l) => present.has(l.k))
}

/**
 * The window of the pool the pad is currently showing.
 *
 * Rotates rather than reshuffling: refresh walks forward through the pool a
 * page at a time and wraps, so every prompt is reachable and the same tap
 * twice never lands you back where you started. Rotation also keeps this a
 * pure function of (pool, lane, page) — no Math.random, so a test can pin it.
 */
export function visibleActions(pool, { lane = null, page = 0, size = PAD_SIZE, rotate = false } = {}) {
  const pick = lane ? pool.filter((a) => a.k === lane) : pool
  if (!pick.length || (pick.length <= size && !rotate)) return pick
  const start = (((page * (rotate ? PAD_SIZE : size)) % pick.length) + pick.length) % pick.length
  return [...pick.slice(start), ...pick.slice(0, start)].slice(0, size)
}

/** Whether a refresh would actually change anything. */
export function canRefresh(pool, { lane = null, size = PAD_SIZE } = {}) {
  return (lane ? pool.filter((a) => a.k === lane) : pool).length > size
}

/** Localized labels are presentation only; click handlers retain ticker prompts. */
export function promptLabel(text, names = {}) {
  const symbols=Object.keys(names).filter(s=>names[s]).sort((a,b)=>b.length-a.length)
  if(!symbols.length) return text
  const escaped=symbols.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))
  return text.replace(new RegExp(`(?<![A-Z0-9.])(${escaped.join('|')})(?![A-Z0-9.])([ \t]*)`,'g'),
    (_,symbol,space)=>names[symbol]+(/[\u3400-\u9fff]/.test(names[symbol]) ? '' : space))
    .replace(/(?<=[\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g,'')
}
