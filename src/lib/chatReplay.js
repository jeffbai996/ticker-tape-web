/** Replay starts a new branch; the saved source conversation remains intact. */
export function replayRequest(history,index,text,selection={},now=Date.now()) {
 const source=history[index],content=String(text||'').trim()
 if(source?.role!=='user'||!content)throw new Error('Choose a user message and enter a message to resend.')
 return {prefix:history.slice(0,index),request:{text:content,context:source.context,
  model:selection.model,effort:selection.effort,ts:now}}
}
