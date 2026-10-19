import {t} from '../lib/i18n.js'

/** Saved-state receipts lead directly to the content they describe. */
export function ChatNotice({notice,onMemory,onJournal}) {
 if(!notice)return null
 if(notice.kind==='model_fallback')return <div role="status" class="font-anth text-[10px] text-muted px-1">{t('chat.model_fallback',{model:notice.model})}</div>
 if(typeof notice==='string')return <div role="status" class="font-anth text-[10px] text-muted px-1">{notice}</div>
 const memory=notice.kind==='memory'
 const items=memory?notice.items:[{action:'journal_saved'}]
 return <div role="status" class="self-start flex flex-wrap gap-1.5">{items.map((item,i)=>
  <button key={i} type="button" onClick={memory?onMemory:onJournal}
   class="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-2.5 py-1 font-anth text-[10px] text-muted hover:text-ink hover:border-line-2 transition-colors">
   <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {memory?<><path d="M12 18V5a3 3 0 0 0-5.8-1A4 4 0 0 0 3 10a4 4 0 0 0 1 7.5A4 4 0 0 0 12 18ZM12 5a3 3 0 0 1 5.8-1A4 4 0 0 1 21 10a4 4 0 0 1-1 7.5A4 4 0 0 1 12 18"/><path d="M7 8c0 2 1 3 3 3M17 8c0 2-1 3-3 3"/></>:<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>}
   </svg>
   {t(memory?`chat.memory_${item.action}`:'chat.journal_saved')}
  </button>)}</div>
}
