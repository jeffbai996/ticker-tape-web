// Named chat threads. On a wire build the thread bodies live server-side
// (fragwire chatstore → shared-memory's SQLite); localStorage keeps only the
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

/** Persist the active conversation: cache immediately, server debounced. */
export function saveActiveHistory(messages) {
  const trimmed = trimHistory(messages, STORE_MAX)
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(trimmed))
  } catch { /* best-effort cache */ }
  if (!chatstoreAvailable()) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      const id = currentThreadId()
      if (!trimmed.length && id == null) return
      if (id == null) {
        const t = await createThread(titleOf(trimmed), trimmed)
        setCurrent(t.id)
      } else {
        await updateThread(id, { messages: trimmed, title: titleOf(trimmed) })
      }
    } catch { /* offline — cache still has it */ }
  }, 800)
}

/** Thread list for the rail (server builds only). */
export async function fetchThreadList() {
  if (!chatstoreAvailable()) return []
  return listThreads()
}

/** Switch to a thread; resolves its messages. */
export async function openThread(id) {
  const t = await getThread(id)
  setCurrent(t.id)
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(t.messages))
  } catch { /* cache only */ }
  return t.messages
}

/** Park the current conversation and start fresh. */
export function startNewThread() {
  clearTimeout(saveTimer)
  setCurrent(null)
  try {
    localStorage.setItem(LEGACY_KEY, '[]')
  } catch { /* cache only */ }
}

export async function removeThread(id) {
  await deleteThread(id)
  if (currentThreadId() === id) startNewThread()
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
