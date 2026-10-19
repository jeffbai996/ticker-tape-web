import { wireChatAvailable } from '../lib/wirechat.js'
import { openContextualChat } from '../lib/chatHandoff.js'
import { getLocale } from '../lib/i18n.js'
export function AskAI({question,context,label, class:extra=''}) {
  if(!wireChatAvailable())return null
  return <button type="button" data-ask-ai onClick={e=>{e.preventDefault();e.stopPropagation();openContextualChat(question,context,{submit:true})}}
    class={`shrink-0 whitespace-nowrap rounded-md border border-line-2 px-2 py-1 font-anth text-[10px] text-muted hover:border-accent/50 hover:text-accent ${extra}`}>
    {label || (getLocale()==='zh' ? '问 AI' : 'Ask AI')}
  </button>
}
