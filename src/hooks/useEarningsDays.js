import {useEffect,useMemo,useState} from 'preact/hooks'
import {fetchEarningsDate,peekEarningsDate} from '../lib/fundamentals.js'
import {whenFirstBatch} from '../lib/feed.js'
const DAY=86400000
const ETF_SKIP=new Set(['SPY','QQQ','IWM','GLD','TLT'])

/** Seed from persistent data; refresh a bounded batch without progressive row paint. */
export function useEarningsDates(symbols) {
 const key=symbols.join(',')
 const seeded=useMemo(()=>Object.fromEntries(symbols.map(s=>[s,peekEarningsDate(s)])),[key])
 const [snapshot,setSnapshot]=useState(()=>({key,rows:seeded}))
 const rows=snapshot.key===key?snapshot.rows:seeded
 useEffect(()=>{
  let alive=true
  const refresh=async()=>{
   if(!alive)return
   const targets=symbols.filter(s=>!ETF_SKIP.has(s)),next={...seeded}
   let cursor=0
   const worker=async()=>{
    while(alive && cursor<targets.length){
     const symbol=targets[cursor++]
     try{next[symbol]=await fetchEarningsDate(symbol)}catch{/* Keep last-known data on failure. */}
    }
   }
   await Promise.all(Array.from({length:Math.min(4,targets.length)},worker))
   if(alive)setSnapshot({key,rows:next})
  }
  // Earnings must not compete with the first live price batch on a cold page.
  if(symbols.every(s=>seeded[s]!==undefined))void refresh()
  else void whenFirstBatch().then(refresh)
  return ()=>{alive=false}
 },[key])
 return rows
}

export function useEarningsDays(symbols) {
 const rows=useEarningsDates(symbols)
 const days={},now=Date.now()
 for(const symbol of symbols){
  const value=rows[symbol]
  if(value?.date && value.date>=now-DAY)days[symbol]=Math.max(0,Math.round((value.date-now)/DAY))
 }
 return days
}
