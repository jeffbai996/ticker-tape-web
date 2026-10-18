import {useEffect,useState} from 'preact/hooks'
import {tl} from '../lib/i18n.js'

/** A second, explicitly destructive click confirms deletion; Escape cancels. */
export function ConversationDelete({onDelete,disabled=false,compact=false,label=tl('delete session')}) {
 const [armed,setArmed]=useState(false)
 useEffect(()=>{
  if(!armed)return
  const timer=setTimeout(()=>setArmed(false),4000)
  const cancel=event=>{if(event.key==='Escape')setArmed(false)}
  window.addEventListener('keydown',cancel)
  return ()=>{clearTimeout(timer);window.removeEventListener('keydown',cancel)}
 },[armed])
 return <span class="relative inline-flex items-center shrink-0">
  <button type="button" disabled={disabled} data-confirm-delete={armed||undefined}
   aria-label={armed?tl('Confirm delete conversation'):label} title={armed?tl('Confirm delete conversation'):label}
   onClick={()=>{if(armed){setArmed(false);onDelete()}else setArmed(true)}}
   class={`${compact?'w-5 h-5':'w-6 h-6'} grid place-items-center rounded-md disabled:opacity-40 ${armed?'border border-danger bg-danger text-white hover:bg-danger/90':'text-muted hover:text-danger hover:bg-surface-2'}`}>
   <svg viewBox="0 0 24 24" width={compact?12:16} height={compact?12:16} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6M10 10v7M14 10v7"/></svg>
  </button>
  {armed&&<button type="button" onClick={()=>setArmed(false)} aria-label={tl('cancel')} title={tl('cancel')} class={`${compact?'w-5 h-5':'w-6 h-6'} absolute right-full mr-1 grid place-items-center rounded-md bg-surface-2 text-muted hover:text-ink`}>
   <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
  </button>}
 </span>
}
