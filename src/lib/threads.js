// Named chat threads. On a wire build the thread bodies live server-side
// (fragwire chatstore → squad-store's SQLite); localStorage keeps only the
// active thread as a cache plus the pointer to it. The keyless public build
// stays exactly what it was: one thread in localStorage.

import {
  chatstoreAvailable, createThread, deleteThread, getThread, listThreads,
  updateThread,
} from './chatstore.js'
import { trimHistory } from './agent.js'

const LEGACY_KEY = 'chat_history_v1'     // public-build store + migration source
const CUR_KEY = 'chat_thread_id'
const STORE_MAX = 400

const titleOf = (messages) => {
  const q = messages.find((m) => m.role === 'user')
  return (q?.content || 'new thread').slice(0, 60)
}

export function currentThreadId() {
  const raw = localStorage.getItem(CUR_KEY)
  return raw ? Number(raw) : null
}

function setCurrent(id) {
  if (id == null) localStorage.removeItem(CUR_KEY)
  else localStorage.setItem(CUR_KEY, String(id))
}

/** Sync read of the active conversation (cache / public store). */
export function loadActiveHistory() {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_KEY)) || []
  } catch {
    return []
  }
}

let saveTimer = null
let pendingMessages = null
let saveChain = Promise.resolve()

function cacheHistory(messages) {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(messages))
  } catch { /* best-effort cache */ }
}

function resetActiveThread() {
  clearTimeout(saveTimer)
  saveTimer = null
  pendingMessages = null
  setCurrent(null)
  cacheHistory([])
}

/** Finish the active session's pending write before its identity changes. */
export async function flushActiveHistory(messages = pendingMessages) {
  clearTimeout(saveTimer)
  saveTimer = null
  const trimmed = trimHistory(messages || loadActiveHistory(), STORE_MAX)
  pendingMessages = null
  cacheHistory(trimmed)
  if (!chatstoreAvailable() || (!trimmed.length && currentThreadId() == null)) return

  saveChain = saveChain.catch(() => {}).then(async () => {
    const id = currentThreadId()
    if (id == null) {
      const thread = await createThread(titleOf(trimmed), trimmed)
      setCurrent(thread.id)
    } else {
      await updateThread(id, { messages: trimmed, title: titleOf(trimmed) })
    }
  })
  await saveChain
}

/** Persist the active conversation: cache immediately, server debounced. */
export function saveActiveHistory(messages) {
  const trimmed = trimHistory(messages, STORE_MAX)
  cacheHistory(trimmed)
  if (!chatstoreAvailable()) return
  pendingMessages = trimmed
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => flushActiveHistory().catch(() => {}), 800)
}

/** Thread list for the rail (server builds only). */
export async function fetchThreadList() {
  if (!chatstoreAvailable()) return []
  return listThreads()
}

/** Switch to a thread; resolves its messages. */
export async function openThread(id, currentMessages) {
  await flushActiveHistory(currentMessages)
  const t = await getThread(id)
  setCurrent(t.id)
  cacheHistory(t.messages)
  return t.messages
}

/** Park the current conversation and start fresh. */
export async function startNewThread(currentMessages) {
  await flushActiveHistory(currentMessages)
  resetActiveThread()
}

export async function removeThread(id) {
  await deleteThread(id)
  if (currentThreadId() === id) resetActiveThread()
}

/** One-time migration: a legacy local conversation with no server threads
 *  becomes thread #1 so nothing evaporates on upgrade. */
export async function migrateLegacy() {
  if (!chatstoreAvailable() || currentThreadId() != null) return
  const local = loadActiveHistory()
  if (!local.length) return
  const existing = await listThreads()
  if (existing.length) return
  const t = await createThread(titleOf(local), local)
  setCurrent(t.id)
}
