import {useEffect,useState} from 'preact/hooks'
import {t,tl} from '../lib/i18n.js'

export function ChatFailure({error,onRetry,busy=false}) {
 const message=typeof error==='string'?error:error?.message||''
 const limited=error?.status===429||/request limit reached|请求已达上限/.test(message)
 const retryAt=error?.retryAt||0
 const [now,setNow]=useState(Date.now())
 const seconds=Math.max(0,Math.ceil((retryAt-now)/1000)),waiting=seconds>0
 useEffect(()=>{
  if(!waiting)return
  const timer=setInterval(()=>setNow(Date.now()),1000)
  return ()=>clearInterval(timer)
 },[retryAt,waiting])
 if(!limited)return <div role="alert" class="font-mono text-[11px] text-danger px-1">{tl(message)}</div>
 const time=t(seconds>=3600?'chat.wait_hours':seconds>=60?'chat.wait_minutes':'chat.wait_seconds',{n:seconds>=3600?Math.ceil(seconds/3600):seconds>=60?Math.ceil(seconds/60):seconds})
 return <div role="alert" class="w-full max-w-[32rem] flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 font-anth text-[12px]">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" class="shrink-0 text-accent" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
  <div class="min-w-0 flex-1"><div class="text-ink font-semibold">{t(error?.code==='assistant_busy'?'chat.busy_title':'chat.limit_title')}</div>
   <div aria-live="off" class="text-muted text-[11px] mt-0.5">{waiting?t('chat.retry_wait',{time}):t('chat.retry_ready')}</div>
  </div>
  <button type="button" disabled={waiting||busy||!onRetry} onClick={onRetry} class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-ink hover:border-accent disabled:opacity-40">
   <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.6"/></svg>{tl('Retry')}
  </button>
 </div>
}
