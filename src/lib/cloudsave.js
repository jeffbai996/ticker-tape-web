// Watchlist cloud sync — the BaiCloud-games save pattern, so Jeff and Dan
// share lists across devices (2026-08-06). The wire hosts one shared document
// under /api/saves/ttw-watchlists with optimistic concurrency: pull, merge,
// push with the revision we based our edit on; a 409 hands back the winner's
// document and we merge again. The server never merges — this file owns it.

import { wireUrl } from './wire.js'

export const SAVE_KEY = 'ttw-watchlists'
const META_KEY = 'cloudsave_meta_v1'   // {rev, touched:{main|list-id: ts}, deleted:{id: ts}}

export function loadMeta() {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY))
    if (raw && typeof raw === 'object') {
      return { rev: raw.rev || 0, touched: raw.touched || {}, deleted: raw.deleted || {} }
    }
  } catch { /* fresh device */ }
  return { rev: 0, touched: {}, deleted: {} }
}

export function saveMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)) } catch { /* best-effort */ }
}

/** Stamp a part (main watchlist or a named list id) as locally edited now. */
export function touch(meta, part, ts = Date.now()) {
  return { ...meta, touched: { ...meta.touched, [part]: ts } }
}

/** Record a list deletion so a merge doesn't resurrect it from the other
 *  device — the classic union-merge failure. */
export function markDeleted(meta, id, ts = Date.now()) {
  const touched = { ...meta.touched }
  delete touched[id]
  return { ...meta, touched, deleted: { ...meta.deleted, [id]: ts } }
}

/**
 * Merge the local snapshot with the remote document. Per part (main list and
 * each named list) the side with the NEWER touch timestamp wins whole; a
 * deletion beats an edit only when the deletion is newer. Unknown remote
 * lists are adopted (that's how Dan's lists appear on Jeff's phone).
 *
 * Returns { doc, changedLocal } — doc is what should exist everywhere,
 * changedLocal says whether the local store must be rewritten.
 */
export function mergeDocs(local, remote) {
  if (!remote) return { doc: local, changedLocal: false }
  const lt = local.touched || {}
  const rt = remote.touched || {}
  const deleted = { ...(remote.deleted || {}) }
  for (const [id, ts] of Object.entries(local.deleted || {})) {
    if (!(id in deleted) || deleted[id] < ts) deleted[id] = ts
  }

  const newer = (part) => (lt[part] || 0) >= (rt[part] || 0)
  const main = newer('main') ? local.main : remote.main

  const byId = new Map()
  for (const list of remote.lists || []) byId.set(list.id, { side: 'remote', list })
  for (const list of local.lists || []) {
    const seen = byId.get(list.id)
    if (!seen || newer(list.id)) byId.set(list.id, { side: 'local', list })
  }

  const lists = []
  for (const [id, { list }] of byId) {
    const editedAt = Math.max(lt[id] || 0, rt[id] || 0)
    if (deleted[id] != null && deleted[id] >= editedAt) continue   // deletion wins ties
    lists.push(list)
  }

  const touched = { ...rt }
  for (const [part, ts] of Object.entries(lt)) {
    if (!(part in touched) || touched[part] < ts) touched[part] = ts
  }

  const doc = { main, lists, touched, deleted }
  const changedLocal =
    JSON.stringify({ main: local.main, lists: local.lists })
      !== JSON.stringify({ main: doc.main, lists: doc.lists })
  return { doc, changedLocal }
}

async function api(path, init) {
  const base = wireUrl()
  if (!base) throw new Error('no wire endpoint')
  const resp = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    ...init,
  })
  const out = await resp.json()
  return { status: resp.status, out }
}

export async function pullRemote() {
  const { out } = await api(`/api/saves/${SAVE_KEY}`)
  if (!out.ok) throw new Error(out.error || 'pull failed')
  return { doc: out.data, rev: out.rev }
}

/** Push a doc based on `rev`; on a lost race returns the winner instead. */
export async function pushRemote(doc, rev) {
  const { status, out } = await api(`/api/saves/${SAVE_KEY}`, {
    method: 'POST',
    body: JSON.stringify({ data: doc, rev }),
  })
  if (status === 409) return { conflict: true, doc: out.data, rev: out.rev }
  if (!out.ok) throw new Error(out.error || 'push failed')
  return { conflict: false, rev: out.rev }
}

// ── sync engine ──────────────────────────────────────────────────────────
// Subscribes to both stores, diffs against the last snapshot to find WHICH
// part changed (the change events don't say), stamps touches/tombstones, and
// runs pull → merge → push with conflict retry. Applying a merge back into
// the stores is flagged so it never counts as a local edit.

import { getWatchlist, onWatchlistChange, replaceWatchlist } from './watchlist.js'
import { loadWatchlists, onWatchlistsChange, replaceWatchlists } from './watchlists.js'

const statusListeners = new Set()
let status = { state: wireUrl() ? 'idle' : 'off', rev: 0, at: 0 }

export function onSyncStatus(fn) {
  statusListeners.add(fn)
  fn(status)
  return () => statusListeners.delete(fn)
}

function setStatus(next) {
  status = { ...status, ...next, at: Date.now() }
  for (const fn of statusListeners) fn(status)
}

export function syncStatus() {
  return status
}

let applying = false
let timer = null
let started = false

function snapshot(meta) {
  return {
    main: getWatchlist(),
    lists: loadWatchlists(),
    touched: meta.touched,
    deleted: meta.deleted,
  }
}

/** Diff stores against the previous snapshot and stamp what moved. */
function stampLocalEdits(prev, meta) {
  const now = Date.now()
  let next = meta
  const main = getWatchlist()
  if (JSON.stringify(main) !== JSON.stringify(prev.main)) next = touch(next, 'main', now)
  const lists = loadWatchlists()
  const prevById = new Map(prev.lists.map((l) => [l.id, l]))
  for (const list of lists) {
    const before = prevById.get(list.id)
    if (!before || JSON.stringify(before) !== JSON.stringify(list)) {
      next = touch(next, list.id, now)
    }
    prevById.delete(list.id)
  }
  for (const id of prevById.keys()) next = markDeleted(next, id, now)
  return next
}

async function syncOnce() {
  if (!wireUrl()) return
  let meta = loadMeta()
  setStatus({ state: 'syncing' })
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await pullRemote()
      const { doc, changedLocal } = mergeDocs(snapshot(meta), remote.doc)
      if (changedLocal) {
        applying = true
        try {
          replaceWatchlist(doc.main)
          replaceWatchlists(doc.lists)
        } finally {
          applying = false
        }
      }
      const remoteMatches = remote.doc
        && JSON.stringify(remote.doc) === JSON.stringify(doc)
      if (remoteMatches) {
        meta = { ...meta, rev: remote.rev, touched: doc.touched, deleted: doc.deleted }
        saveMeta(meta)
        setStatus({ state: 'synced', rev: remote.rev })
        return
      }
      const pushed = await pushRemote(doc, remote.rev)
      if (!pushed.conflict) {
        meta = { ...meta, rev: pushed.rev, touched: doc.touched, deleted: doc.deleted }
        saveMeta(meta)
        setStatus({ state: 'synced', rev: pushed.rev })
        return
      }
      // lost the race — loop pulls the winner and merges again
    }
    setStatus({ state: 'error' })
  } catch {
    setStatus({ state: wireUrl() ? 'offline' : 'off' })
  }
}

function queueSync() {
  clearTimeout(timer)
  timer = setTimeout(syncOnce, 1500)
}

/** Boot the engine: one immediate reconcile, then debounced pushes on every
 *  local edit. Safe to call more than once. */
export function startWatchlistSync() {
  if (started || typeof localStorage === 'undefined') return
  started = true
  if (!wireUrl()) { setStatus({ state: 'off' }); return }
  let prev = { main: getWatchlist(), lists: loadWatchlists() }
  const onEdit = () => {
    if (applying) { prev = { main: getWatchlist(), lists: loadWatchlists() }; return }
    const meta = stampLocalEdits(prev, loadMeta())
    saveMeta(meta)
    prev = { main: getWatchlist(), lists: loadWatchlists() }
    queueSync()
  }
  onWatchlistChange(onEdit)
  onWatchlistsChange(onEdit)
  syncOnce()
  // pull every 60s so the other device's edits appear without a reload
  setInterval(syncOnce, 60_000)
}
