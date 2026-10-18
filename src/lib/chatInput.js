/** IME Enter confirms a character. Memory edits require an explicit shortcut. */
export function submitTextKey(event, mode='enter') {
 if(event.isComposing || event.keyCode===229 || event.key!=='Enter')return false
 return mode==='modified' ? !!(event.ctrlKey || event.metaKey) : !event.shiftKey
}
