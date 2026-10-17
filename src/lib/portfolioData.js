import {watchlistSyncEndpoint,watchlistSyncHeaders} from './watchlistSync.js'

export const portfolioHistoryEndpoint=()=>watchlistSyncEndpoint().replace(/\/watchlists$/, '/portfolio-history')

export async function fetchPortfolioHistory(id,{signal,fetcher=fetch}={}) {
 const endpoint=portfolioHistoryEndpoint()
 if(!endpoint)return null
 const response=await fetcher(`${endpoint}?${new URLSearchParams({book:id})}`,{headers:watchlistSyncHeaders(),cache:'no-store',signal})
 if(!response.ok)throw Error('History unavailable')
 const out=await response.json()
 if(!out.ok || !Array.isArray(out.marks))throw Error('History unavailable')
 return out
}

export function mergeHistory(legacy=[],remote=[]) {
 const marks=new Map()
 for(const m of [...legacy,...remote])if(m && typeof m.d==='string' && Number.isFinite(m.v))marks.set(`${m.d}:${m.c}`,m)
 return [...marks.values()].sort((a,b)=>a.d.localeCompare(b.d))
}

export function portfolioDataTimes(holdings,quotes,ccys,base,fxLive) {
 const priceTimes=holdings.map(h=>{
  const q=quotes[h.symbol]
  return q?.extPrice!=null ? q.extMarketTime : q?.marketTime
 }).filter(t=>Number.isFinite(t) && t>0)
 const crosses=ccys.some(c=>c!==base) ? [...new Set([...ccys,base])].filter(c=>c!=='USD') : []
 const fxTimes=crosses.map(c=>fxLive?.[`${c}USD=X`]?.quote?.marketTime).filter(t=>Number.isFinite(t) && t>0)
 return {price:priceTimes.length ? Math.min(...priceTimes) : null,missing:holdings.length-priceTimes.length,
  fx:fxTimes.length ? Math.min(...fxTimes) : null,fxMissing:crosses.length-fxTimes.length,fxNeeded:crosses.length>0}
}
