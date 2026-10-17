import { dayContribution } from './bookStats.js'

export function dailyMovers(rows,limit=4) {
  return dayContribution((rows || []).filter(r=>Number.isFinite(r.dayPnlDisplay)))
    .filter(r=>r.pnl!==0).slice(0,limit)
}
export function upcomingPortfolioDates(holdings,calendar,today,days=30) {
  const end=Date.parse(`${today}T00:00:00Z`)+days*86400000
  const rows=[]
  for(const h of holdings || []) {
    const e=calendar[h.symbol]
    if(!e)continue
    for(const [field,kind] of [['nextResults','results'],['exDate','ex-dividend'],['payDate','payment']]) {
      const date=e[field],time=Date.parse(`${date}T00:00:00Z`)
      if(date>=today && Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===date && time<=end)rows.push({symbol:h.symbol,date,kind})
    }
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.symbol.localeCompare(b.symbol))
}

export async function loadPortfolioCalendar(holdings,{fetchEvents,today,signal,onResult}={}) {
  const calendar={};let next=0,checked=0,failed=0
  const list=[...new Map(holdings.map(h=>[h.symbol,h])).values()].slice(0,60)
  await Promise.all(Array.from({length:Math.min(4,list.length)},async()=>{
    while(next<list.length && !signal?.aborted) {
      const h=list[next++]
      try{calendar[h.symbol]=await fetchEvents(h.symbol,{today,signal})}catch{calendar[h.symbol]=null;failed++}
      checked++;onResult?.({...calendar},checked)
    }
  }))
  return {calendar,checked,failed,incomplete:checked<list.length || list.length<holdings.length}
}
