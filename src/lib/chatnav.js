// Pressing "AI Chat" in the nav returns to the launchpad without touching the
// thread. Hash routing can't express it — the hash is already #/chat when you
// press it from the chat page, so there is no navigation event to hear. The
// flag covers the cold case (Chat mounts after the click), the event covers
// the warm one (Chat is already mounted).

const PENDING_KEY = 'chat_home_pending'
export const CHAT_HOME_EVENT = 'ttw:chat-home'

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
