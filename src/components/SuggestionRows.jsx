import {useEffect,useRef,useState} from 'preact/hooks'
import {actionRows,LANES} from '../lib/launchpad.js'

const DOT=Object.fromEntries(LANES.map(l=>[l.k,l.dot]))

/** Native scrolling keeps touch swipes and keyboard focus usable during motion. */
function SuggestionRow({items,index,onPick,label,paused}) {
  const viewport=useRef(null),group=useRef(null),sync=useRef(()=>{}),initialized=useRef(false)
  const blocked=useRef(new Set()),pausedRef=useRef(paused),settle=useRef(()=>{})
  pausedRef.current=paused
  const block=(reason,on)=>{
    if(on)blocked.current.add(reason);else blocked.current.delete(reason)
    sync.current()
  }
  useEffect(()=>{
    const el=viewport.current,first=group.current
    const media=window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let reduced=!!media?.matches,frame=0,last=null,span=0,position=0,overflow=false
    blocked.current.delete('interaction');blocked.current.delete('pointer')
    let idle=0
    const release=()=>{clearTimeout(idle);idle=setTimeout(()=>block('interaction',false),180)}
    settle.current=release
    const pointerEnd=()=>{block('pointer',false);if(blocked.current.has('interaction'))release()}
    window.addEventListener('pointerup',pointerEnd)
    window.addEventListener('pointercancel',pointerEnd)
    const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;last=null}
    const canMove=()=>overflow&&!reduced&&!pausedRef.current&&!blocked.current.size&&!document.hidden
    const tick=now=>{
      frame=0
      if(!canMove())return
      if(last!=null){
        position+=(index%2?-1:1)*Math.min(now-last,64)*.014
        position=(position%span+span)%span
        el.scrollLeft=position
      }
      last=now;frame=requestAnimationFrame(tick)
    }
    const update=()=>{
      stop()
      if(canMove()){position=el.scrollLeft;frame=requestAnimationFrame(tick)}
    }
    sync.current=update
    const measure=()=>{
      const gap=parseFloat(getComputedStyle(first.parentElement).columnGap)||0
      span=first.offsetWidth+gap
      overflow=span>el.clientWidth+gap
      el.dataset.loop=String(overflow&&!reduced)
      if(!initialized.current&&overflow&&!reduced){el.scrollLeft=span*((index*.23)%1);initialized.current=true}
      update()
    }
    const motion=e=>{reduced=e.matches;measure()}
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null
    observer?.observe(el);observer?.observe(first)
    media?.addEventListener('change',motion)
    document.addEventListener('visibilitychange',update)
    window.addEventListener('resize',measure)
    measure()
    return ()=>{
      stop();clearTimeout(idle);settle.current=()=>{};observer?.disconnect();sync.current=()=>{}
      window.removeEventListener('pointerup',pointerEnd)
      window.removeEventListener('pointercancel',pointerEnd)
      media?.removeEventListener('change',motion)
      document.removeEventListener('visibilitychange',update)
      window.removeEventListener('resize',measure)
    }
  },[items.map(a=>a.t).join('\n'),index])
  useEffect(()=>{sync.current()},[paused])
  const pills=copy=>items.map(a=>(
    <button key={a.t} type="button" tabIndex={copy?-1:0} onClick={()=>onPick(a.t)}
      title={label(a)} class="chat-suggestion-pill flex items-center gap-1.5 font-anth text-[12px] text-ink-2 border border-line rounded-full pl-2.5 pr-3 py-1 hover:border-accent/60 hover:text-ink hover:bg-accent-soft transition-colors">
      <span class={`w-1 h-1 rounded-full shrink-0 ${DOT[a.k]||'bg-muted'}`} />
      <span>{label(a)}</span>
    </button>
  ))
  return <div ref={viewport} class="chat-suggestion-row" tabIndex={0}
    onPointerEnter={e=>block('hover',e.pointerType==='mouse')} onPointerLeave={()=>block('hover',false)}
    onFocusIn={e=>block('focus',e.target.matches(':focus-visible'))} onFocusOut={e=>{if(!e.currentTarget.contains(e.relatedTarget))block('focus',false)}}
    onPointerDown={()=>{block('focus',false);block('pointer',true);block('interaction',true)}}
    onWheel={()=>{block('interaction',true);settle.current()}}
    onScroll={()=>{if(blocked.current.has('interaction'))settle.current()}}>
    <div class="chat-suggestion-track">
      <div class="chat-suggestion-group" ref={group}>{pills(false)}</div>
      <div class="chat-suggestion-group chat-suggestion-copy" aria-hidden="true">{pills(true)}</div>
    </div>
  </div>
}

export function SuggestionRows({items,onPick,label,paused=false}) {
  const query='(min-width: 1024px) and (min-height: 540px)'
  const [rows,setRows]=useState(()=>window.matchMedia?.(query)?.matches?5:4)
  useEffect(()=>{
    const media=window.matchMedia?.(query),change=e=>setRows(e.matches?5:4)
    media?.addEventListener('change',change)
    return ()=>media?.removeEventListener('change',change)
  },[])
  return <div class="chat-suggestion-rows">{actionRows(items,rows).map((row,i)=>
    <SuggestionRow key={i} items={row} index={i} onPick={onPick} label={label} paused={paused}/>)}</div>
}
