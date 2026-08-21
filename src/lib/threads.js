// Named chat threads. On a wire build the thread bodies live server-side
// (the optional chatstore → its SQLite database); localStorage keeps only the
// active thread as a cache plus the pointer to it. The keyless public build
// stays exactly what it was: one thread in localStorage.

import {
  chatstoreAvailable, createThread, deleteThread, getThread, listThreads,
  updateThread,
} from './chatstore.js'
import { trimHistory } from './agent.js'

const LEGACY_KEY = 'chat_history_v1'     // public-build store + migration source
const CUR_KEY = 'chat_thread_id'
const LOCAL_CUR_KEY = 'chat_local_thread_id'
const LOCAL_THREADS_KEY = 'chat_threads_v1'
const STORE_MAX = 400

const titleOf = (messages) => {
  const q = messages.find((m) => m.role === 'user')
  return (q?.content || 'new thread').slice(0, 60)
}

export function currentThreadId() {
  const raw = localStorage.getItem(chatstoreAvailable() ? CUR_KEY : LOCAL_CUR_KEY)
  return raw ? Number(raw) : null
}

function setCurrent(id) {
  const key = chatstoreAvailable() ? CUR_KEY : LOCAL_CUR_KEY
  if (id == null) localStorage.removeItem(key)
  else localStorage.setItem(key, String(id))
}

function loadLocalThreads() {
  try {
    const items = JSON.parse(localStorage.getItem(LOCAL_THREADS_KEY))
    return Array.isArray(items) ? items : []
  } catch { return [] }
}

function saveLocalThreads(items) {
  try { localStorage.setItem(LOCAL_THREADS_KEY, JSON.stringify(items)) }
  catch { /* active-session cache still survives */ }
}

function persistLocalThread(messages) {
  const items = loadLocalThreads()
  let id = currentThreadId()
  if (id == null) {
    id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1
    setCurrent(id)
  }
  const thread = { id, title: titleOf(messages), messages, updatedAt: Date.now() }
  saveLocalThreads([thread, ...items.filter((item) => item.id !== id)])
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
  if (!trimmed.length && currentThreadId() == null) return
  if (!chatstoreAvailable()) {
    persistLocalThread(trimmed)
    return
  }

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
  pendingMessages = trimmed
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => flushActiveHistory().catch(() => {}), 800)
}

/** Thread list for the rail (server builds only). */
export async function fetchThreadList() {
  if (!chatstoreAvailable()) {
    return loadLocalThreads().map(({ id, title, messages }) => ({
      id, title, n: messages.length,
    }))
  }
  return listThreads()
}

/** Hydrate the active session from the shared store on app boot. The browser
 * cache is only an offline fallback; it must not win over a newer server copy.
 * A deleted session releases its stale pointer without deleting the cache. */
export async function hydrateActiveThread() {
  const cached = loadActiveHistory()
  if (!chatstoreAvailable()) return cached
  const id = currentThreadId()
  if (id == null) return cached
  try {
    const thread = await getThread(id)
    cacheHistory(thread.messages)
    return thread.messages
  } catch (error) {
    if (error?.status === 404) {
      setCurrent(null)
      return cached
    }
    throw error
  }
}

/** Switch to a thread; resolves its messages. */
export async function openThread(id, currentMessages) {
  await flushActiveHistory(currentMessages)
  if (!chatstoreAvailable()) {
    const thread = loadLocalThreads().find((item) => item.id === id)
    if (!thread) throw new Error('session not found')
    setCurrent(thread.id)
    cacheHistory(thread.messages)
    return thread.messages
  }
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
  if (!chatstoreAvailable()) {
    saveLocalThreads(loadLocalThreads().filter((item) => item.id !== id))
    if (currentThreadId() === id) resetActiveThread()
    return
  }
  await deleteThread(id)
  if (currentThreadId() === id) resetActiveThread()
}

/** One-time migration: a legacy local conversation with no server threads
 *  becomes thread #1 so nothing evaporates on upgrade. */
export async function migrateLegacy() {
  if (currentThreadId() != null) return
  const local = loadActiveHistory()
  if (!local.length) return
  if (!chatstoreAvailable()) {
    await flushActiveHistory(local)
    return
  }
  const existing = await listThreads()
  if (existing.length) return
  const t = await createThread(titleOf(local), local)
  setCurrent(t.id)
}
