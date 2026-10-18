// Chat navigation resumes a recent conversation; pressing the active Chat item
// explicitly parks it on the launchpad. The pending flag covers cold mounts.

const PENDING_KEY = 'chat_home_pending'
export const CHAT_HOME_EVENT = 'ttw:chat-home'
export const CHAT_RETURN_EVENT = 'ttw:chat-return'
export const CHAT_RESUME_MS = 60*60*1000
const INTERACTION_KEY = 'chat_last_interaction_v1'

export function markChatInteraction(now=Date.now()) {
  try {localStorage.setItem(INTERACTION_KEY,String(now))}catch { /* private mode */ }
}

export function canResumeChat(history,now=Date.now()) {
  if(!history?.length)return false
  let last=0
  try {last=Number(localStorage.getItem(INTERACTION_KEY)) || 0}catch { /* use message clock */ }
  if(!last)last=Math.max(0,...history.map(m=>typeof m.ts==='number' ? m.ts : 0))
  return last>0 && now>=last && now-last<CHAT_RESUME_MS
}

/** Navigation preserves a recent thread; explicit Home remains a separate action. */
export function returnToChat() {
  if(typeof location!=='undefined' && /^#\/chat\/?$/.test(location.hash)){goChatHome();return}
  window.dispatchEvent(new CustomEvent(CHAT_RETURN_EVENT))
}

export function goChatHome() {
  try { sessionStorage.setItem(PENDING_KEY, '1') } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(CHAT_HOME_EVENT))
}

/** True once per request, consumed by the Chat page on mount. */
export function takeChatHomePending() {
  try {
    const pending = sessionStorage.getItem(PENDING_KEY) === '1'
    sessionStorage.removeItem(PENDING_KEY)
    return pending
  } catch {
    return false
  }
}
