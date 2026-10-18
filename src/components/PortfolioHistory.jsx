import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Overlay } from './Overlay.jsx'
import { fmtCcy } from '../lib/fx.js'
import { fmtPct } from '../lib/format.js'
import { getLocale, tl } from '../lib/i18n.js'
import { historySeries, historyStats, nearestHistoryIndex } from '../lib/portfolioHistory.js'

const label=(en,zh)=>getLocale()==='zh' ? zh : en
const signed=(v,ccy)=>v==null ? '—' : `${v>=0 ? '+' : '−'}${fmtCcy(Math.abs(v),ccy)}`
const percent=v=>v==null ? '—' : fmtPct(v)
const tone=v=>v==null ? 'text-muted' : v>=0 ? 'text-up' : 'text-down'
const RANGES=['1M','3M','6M','1Y','ALL']
const axisNumber=new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1})
const axisDate=d=>new Date(`${d}T00:00:00Z`).toLocaleDateString(getLocale()==='zh' ? 'zh-CN' : 'en',{month:'short',day:'numeric',timeZone:'UTC'})

function HistoryPlot({ points, active, onInspect, compact=false, mode='value', ccy }) {
  const ref=useRef(null),[width,setWidth]=useState(720)
  useLayoutEffect(()=>{
    const el=ref.current
    const resize=()=>{if(el?.clientWidth>0)setWidth(el.clientWidth)}
    resize()
    const observer=typeof ResizeObserver==='function' ? new ResizeObserver(resize) : null
    if(el)observer?.observe(el)
    return ()=>observer?.disconnect()
  },[])
  const W=width,H=compact ? 72 : 260
  const L=compact ? 6 : Math.min(64,W*.23),R=compact ? 6 : 12,T=12,B=compact ? 8 : 28
  const value=p=>mode==='value' ? p.v : p.returnPct
  const values=points.map(value).filter(Number.isFinite)
  const low=values.length ? Math.min(...values) : 0,high=values.length ? Math.max(...values) : 1
  const margin=(high-low || Math.max(1,Math.abs(high)*.01))*.12
  const min=low-margin,max=high+margin
  const duration=points.at(-1).time-points[0].time
  const x=p=>duration ? L+(p.time-points[0].time)/duration*(W-L-R) : (L+W-R)/2
  const y=v=>T+(1-(v-min)/(max-min))*(H-T-B)
  let pen=false
  const path=points.map(p=>{
    if(!Number.isFinite(value(p))){pen=false;return ''}
    const part=`${pen ? 'L' : 'M'}${x(p).toFixed(2)},${y(value(p)).toFixed(2)}`;pen=true;return part
  }).join(' ')
  const selected=active==null ? null : points[active]
  const change=mode==='value' ? points.at(-1).valueChange : points.at(-1).returnPct
  const color=change==null ? 'var(--color-muted)' : change>=0 ? 'var(--color-up)' : 'var(--color-down)'
  const inspect=event=>{
    const rect=event.currentTarget.getBoundingClientRect()
    if(!rect.width) return
    const fraction=((event.clientX-rect.left)/rect.width*W-L)/(W-L-R)
    onInspect(nearestHistoryIndex(points,fraction))
  }
  const keyboard=event=>{
    const step=event.key==='ArrowLeft' ? -1 : event.key==='ArrowRight' ? 1 : 0
    if(!step && !['Home','End'].includes(event.key))return
    event.preventDefault()
    onInspect(event.key==='Home' ? 0 : event.key==='End' ? points.length-1 : Math.max(0,Math.min(points.length-1,(active ?? points.length-1)+step)))
  }
  return <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
    class={`block w-full ${compact ? 'h-[44px]' : 'h-[260px] max-sm:h-[220px] rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent/50'} cursor-crosshair`}
    role={compact ? 'img' : 'slider'} tabindex={compact ? undefined : 0}
    aria-label={compact ? label('Recorded portfolio values','组合历史金额') : label('History date','历史日期')}
    aria-valuemin={compact ? undefined : 0} aria-valuemax={compact ? undefined : points.length-1}
    aria-valuenow={compact ? undefined : active ?? points.length-1}
    aria-valuetext={compact ? undefined : points[active ?? points.length-1]?.d}
    onKeyDown={compact ? undefined : keyboard}
    onPointerMove={inspect} onPointerDown={inspect} style={{touchAction:'pan-y'}}>
    {!compact && (low===high ? [low] : [low,(low+high)/2,high]).map((v,i)=><g key={i}>
      <line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke="currentColor" stroke-opacity=".10" stroke-dasharray="3 5" />
      <text x={L-10} y={y(v)+3} text-anchor="end" fill="currentColor" fill-opacity=".55" font-size="10" font-family="var(--font-sans)">{mode==='value' ? axisNumber.format(v) : `${v.toFixed(1)}%`}</text>
    </g>)}
    <path d={path} fill="none" stroke={color} stroke-width={compact ? 1.7 : 2} stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    {points.length===1 && Number.isFinite(value(points[0])) && <circle cx={x(points[0])} cy={y(value(points[0]))} r="3" fill={color} />}
    {selected && <g>
      <line x1={x(selected)} x2={x(selected)} y1={T} y2={H-B} stroke="currentColor" stroke-opacity=".3" stroke-dasharray="3 3" />
      {Number.isFinite(value(selected)) && <circle cx={x(selected)} cy={y(value(selected))} r={compact ? 3 : 4} fill={color} stroke="var(--color-surface-1)" stroke-width="2" />}
    </g>}
    {!compact && [points[0],points.at(-1)].map((p,i)=><text key={i} x={i ? W-R : L} y={H-5} text-anchor={i ? 'end' : 'start'} fill="currentColor" fill-opacity=".6" font-size="10" font-family="var(--font-sans)">{axisDate(p.d)}</text>)}
  </svg>
}

export function PortfolioHistory({ marks,ccy,cashTxns=[],name='',onInspect }) {
  const [open,setOpen]=useState(false),[range,setRange]=useState('3M'),[mode,setMode]=useState('value')
  const [hover,setHover]=useState(null),[selected,setSelected]=useState(null)
  const compact=useMemo(()=>historySeries(marks,ccy,cashTxns,'3M'),[marks,ccy,cashTxns])
  const points=useMemo(()=>historySeries(marks,ccy,cashTxns,range),[marks,ccy,cashTxns,range])
  const stats=useMemo(()=>historyStats(points),[points])
  if(!compact.length) return null
  const active=selected==null ? points.length-1 : Math.min(selected,points.length-1)
  const point=points[active]
  const inspectPoint=index=>{
    setHover(index)
    onInspect?.(index==null ? null : compact[index] || null)
  }
  const keyboard=event=>{
    const direction=event.key==='ArrowLeft' ? -1 : event.key==='ArrowRight' ? 1 : 0
    if(event.key==='Escape'){inspectPoint(null);return}
    if(!direction) return
    event.preventDefault();inspectPoint(Math.max(0,Math.min(compact.length-1,(hover ?? compact.length-1)+direction)))
  }
  const metric=(title,value,cls='text-ink',props={})=><div class="min-w-0 rounded-lg border border-line-2 bg-surface-2/40 px-3 py-2">
    <div class="mb-1 text-[10px] text-muted font-anth">{title}</div>
    <div class={`font-anth text-[16px] font-semibold tabular-nums ${cls}`} {...props}>{value}</div>
  </div>
  return <>
    <button type="button" data-history-open onClick={()=>{inspectPoint(null);setOpen(true);setSelected(null)}}
      onKeyDown={keyboard} onPointerLeave={()=>inspectPoint(null)} onFocus={()=>inspectPoint(compact.length-1)} onBlur={()=>inspectPoint(null)}
      aria-label={label('Explore portfolio value history','查看组合金额历史')}
      class="relative mt-3 block w-full rounded-lg border border-line-2 bg-surface-2/25 px-2.5 pb-1.5 pt-2 text-left text-muted transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent">
      <span class="flex items-center justify-between gap-2 font-anth text-[9px]">
        <span>{label('Value history','金额走势')}</span>
        <span class="text-muted">{label('Explore','查看详情')} ↗</span>
      </span>
      <HistoryPlot points={compact} active={hover} onInspect={inspectPoint} compact ccy={ccy} />
      <span class="flex justify-between gap-2 font-mono text-[8.5px] text-muted/80"><span>{compact[0].d}</span><span>{compact.at(-1).d}</span></span>

    </button>
    {open && <Overlay onClose={()=>setOpen(false)} label={label('Portfolio value history','组合金额历史')}
      class="w-full max-w-4xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-line bg-surface-1 shadow-2xl">
      <header class="flex items-start gap-3 border-b border-line px-4 py-3">
        <div class="min-w-0 flex-1">
          <h2 class="font-anth text-[16px] font-semibold text-ink">{label('Value history','金额历史')}</h2>
          <p class="mt-0.5 truncate font-anth text-[11px] text-muted">{name} · {ccy}</p>
        </div>
        <button type="button" onClick={()=>setOpen(false)} aria-label={tl('Close')} class="rounded border border-line px-2 py-1 text-muted hover:text-ink">✕</button>
      </header>
      <div class="p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex gap-1" role="group" aria-label={label('History range','历史区间')}>
            {RANGES.map(r=><button key={r} type="button" aria-pressed={range===r} onClick={()=>{setRange(r);setSelected(null)}}
              class={`rounded-md border px-2 py-1 font-mono text-[10px] ${range===r ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'}`}>{r==='ALL' ? tl('All') : r}</button>)}
          </div>
          <div class="flex gap-1" role="group" aria-label={label('Chart measure','图表指标')}>
            {['value','return'].map(m=><button key={m} type="button" aria-pressed={mode===m} onClick={()=>setMode(m)}
              class={`rounded-md border px-2 py-1 font-anth text-[10px] ${mode===m ? 'border-line bg-surface-3 text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{m==='value' ? tl('Value') : label('Return','收益率')}</button>)}
          </div>
        </div>
        <div class="my-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div data-history-date class="font-mono text-[11px] text-muted">{point.d}{point.source==='reconstructed' && <span class="ml-2 text-accent">{label('Reconstructed','重建')}</span>}</div>
          <button type="button" onClick={()=>setSelected(null)} class="font-anth text-[10px] text-accent hover:underline">{label('Latest recorded','最新记录')}</button>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metric(tl('Value'),fmtCcy(point.v,ccy),'text-ink',{'data-history-value':true})}
          {metric(point.changeAdjacent ? label('Since previous trading day','较上一交易日') : label('Since previous record','较上一记录'),signed(point.change,ccy),tone(point.change))}
          {metric(label('Period return','区间收益率'),percent(point.returnPct),tone(point.returnPct))}
          {metric(label('Drawdown','回撤'),percent(point.drawdownPct),tone(point.drawdownPct))}
        </div>
        {point.source==='reconstructed' && <p class="mt-2 font-anth text-[10px] text-muted">{label('Breakdown reconstructed from saved holdings, trades and historical FX. Original total preserved.','明细据历史持仓、交易及汇率重建，原始总额不变。')}</p>}
        <div data-history-chart class="mt-4 rounded-lg border border-line-2 bg-surface-2/50 px-2.5 pb-1.5 pt-2 text-muted sm:px-3">
          <div class="mb-1 font-anth text-[9px] text-muted">{mode==='value' ? `${tl('Value')} · ${ccy}` : label('Return · %','收益率 · %')}</div>
          <HistoryPlot points={points} active={active} onInspect={setSelected} mode={mode} ccy={ccy} />
        </div>
        <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 sm:grid-cols-4">
          <div><div class="font-anth text-[9px] text-muted">{label('Period high','区间最高')}</div><div class="font-mono text-[11px] text-ink-2">{fmtCcy(stats.high.v,ccy)}</div><div class="font-mono text-[9px] text-muted">{stats.high.d}</div></div>
          <div><div class="font-anth text-[9px] text-muted">{label('Period low','区间最低')}</div><div class="font-mono text-[11px] text-ink-2">{fmtCcy(stats.low.v,ccy)}</div><div class="font-mono text-[9px] text-muted">{stats.low.d}</div></div>
          <div><div class="font-anth text-[9px] text-muted">{label('Maximum drawdown','最大回撤')}</div><div class={`font-mono text-[11px] ${tone(stats.maxDrawdown)}`}>{percent(stats.maxDrawdown)}</div></div>
          <div><div class="font-anth text-[9px] text-muted">{label('Recorded days','记录天数')}</div><div class="font-mono text-[11px] text-ink-2">{stats.count}</div></div>
        </div>
        <footer class="mt-4 flex flex-wrap justify-between gap-2 font-anth text-[10px] text-muted">
          <span>{points.some(p=>p.flowGap) ? label('Return unavailable for cash flows without a recorded currency conversion.','部分资金流水缺少汇率记录，暂无法计算收益率。') : label('Returns and drawdowns adjust for recorded deposits and withdrawals.','收益率与回撤已扣除已记录的存取款影响。')}</span>
          <a href="#/portfolio/performance" onClick={()=>setOpen(false)} class="text-accent hover:underline">{label('Compare benchmarks','对比基准')} ↗</a>
        </footer>
      </div>
    </Overlay>}
  </>
}
