// Server persistence for the chat's brain (memories / journal / threads).
// fragwire fronts one SQLite file under shared-memory, so every device shares
// the same state; localStorage stays as the offline cache and the public
// build's only store. Sync model: server wins on boot, mutations apply
// locally first (snappy UI) and push fire-and-forget, add-acks reconcile
// local ids to server ids.

import { wireServiceUrl } from './wire.js'

export const CHATSTORE_SYNC_EVENT = 'ttw:chatstore-sync'

const base = () => {
  const w = wireServiceUrl()
  return w ? `${w.replace(/\/$/, '')}/api/chatstore` : ''
}

export function chatstoreAvailable() {
  return !!base()
}

const emit = () => window.dispatchEvent(new CustomEvent(CHATSTORE_SYNC_EVENT))

async function req(path, opts = {}) {
  const resp = await fetch(`${base()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    ...opts,
  })
  const out = await resp.json()
  if (!out.ok) {
    const error = new Error(out.error || `chatstore ${resp.status}`)
    error.status = resp.status
    throw error
  }
  return out
}

/** Pull memories + journal from the server into the localStorage caches.
 *  Called once on app boot (see chatMemory/journal for the cache keys). */
export async function syncNotes() {
  if (!base()) return false
  const [mem, jr] = await Promise.all([
    req('/memories'), req('/journal'),
  ])
  try {
    localStorage.setItem('chat_memories_v1', JSON.stringify(
      mem.items.map((m) => ({ id: m.id, text: m.text, ts: m.ts * 1000 }))))
    localStorage.setItem('trade_journal_v1', JSON.stringify(
      jr.items.map((e) => ({ id: e.id, text: e.text, symbols: e.symbols || [], ts: e.ts * 1000 }))))
  } catch { /* quota — cache is best-effort */ }
  emit()
  return true
}

/** Push an add; on ack, let the caller reconcile the local id. */
export function pushAdd(kind, item, onServerId) {
  if (!base()) return
  req(`/${kind}`, {
    method: 'POST',
    body: JSON.stringify(kind === 'journal'
      ? { text: item.text, symbols: item.symbols }
      : { text: item.text }),
  }).then((out) => onServerId?.(out.item.id)).catch(() => {})
}

export function pushEdit(kind, id, text) {
  if (!base()) return
  req(`/${kind}/${id}`, { method: 'PUT', body: JSON.stringify({ text }) })
    .catch(() => {})
}

export function pushDelete(kind, id) {
  if (!base()) return
  req(`/${kind}/${id}`, { method: 'DELETE' }).catch(() => {})
}

// ── threads ──────────────────────────────────────────────────────────────

export const listThreads = () => req('/threads').then((o) => o.items)
export const getThread = (id) => req(`/threads/${id}`).then((o) => o.item)
export const createThread = (title, messages) =>
  req('/threads', { method: 'POST', body: JSON.stringify({ title, messages }) })
    .then((o) => o.item)
export const updateThread = (id, patch) =>
  req(`/threads/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
export const deleteThread = (id) =>
  req(`/threads/${id}`, { method: 'DELETE' })
