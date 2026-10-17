import { buildPerformance, hasUnconvertedFlow } from './performance.js'

const DAY=86400000
const DAYS={'1M':30,'3M':90,'6M':180,'1Y':365}
const stamp=d=>Date.parse(`${d}T00:00:00Z`)
// Snapshot values already have cent precision. Integer cents keep monetary
// differences exact without introducing a new money-library dependency.
const cents=value=>BigInt(Math.round(value*100))
const delta=(current,previous)=>Number(cents(current)-cents(previous))/100

export function historySeries(snapshots, currency, cashTxns=[], range='ALL') {
  const dates=new Map()
  for(const m of snapshots || []) {
    if(m?.c!==currency || !/^\d{4}-\d{2}-\d{2}$/.test(m.d || '') || !Number.isFinite(m.v) || m.v<0 || !Number.isSafeInteger(Math.round(m.v*100))) continue
    const time=stamp(m.d)
    if(!Number.isFinite(time) || new Date(time).toISOString().slice(0,10)!==m.d) continue
    dates.set(m.d,{...m,time})
  }
  let marks=[...dates.values()].sort((a,b)=>a.time-b.time)
  if(DAYS[range] && marks.length) marks=marks.filter(m=>m.time>=marks.at(-1).time-DAYS[range]*DAY)
  if(!marks.length) return []
  // Reuse the performance page's external-cash-flow convention. Each range
  // starts at its first observed mark; no unrecorded daily values are filled.
  const adjusted=buildPerformance(marks,[],cashTxns,currency).series[0].values
  let peak=null,flowGap=false
  const origin=marks[0].v
  return marks.map((m,i)=>{
    if(i && hasUnconvertedFlow(cashTxns,currency,marks[i-1].d,m.d)) flowGap=true
    const index=!flowGap && origin>0 && Number.isFinite(adjusted[i]) ? adjusted[i] : null
    if(index!=null) peak=peak==null ? index : Math.max(peak,index)
    return {...m,flowGap,change:i ? delta(m.v,marks[i-1].v) : null,
      valueChange:delta(m.v,origin),returnPct:index==null ? null : index-100,
      drawdownPct:index!=null && peak>0 ? (index/peak-1)*100 : null}
  })
}

export function nearestHistoryIndex(points, fraction) {
  if(!points.length) return null
  const target=points[0].time+Math.max(0,Math.min(1,fraction))*(points.at(-1).time-points[0].time)
  let lo=0,hi=points.length-1
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(points[mid].time<target)lo=mid+1;else hi=mid}
  return lo>0 && target-points[lo-1].time<=points[lo].time-target ? lo-1 : lo
}

export function historyStats(points) {
  if(!points.length) return null
  const high=points.reduce((a,b)=>b.v>a.v ? b : a),low=points.reduce((a,b)=>b.v<a.v ? b : a)
  const drawdowns=points.map(p=>p.drawdownPct).filter(Number.isFinite)
  return {high,low,maxDrawdown:drawdowns.length && points.every(p=>p.returnPct!=null) ? Math.min(...drawdowns) : null,
    count:points.length,days:Math.round((points.at(-1).time-points[0].time)/DAY)}
}
