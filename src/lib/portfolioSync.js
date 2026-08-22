/** Cloud sync for the hand-built portfolios (Jeff 2026-08-20: "its kinda for
 *  me stepdad now so i want the custom portfolio he puts on there to be
 *  saved" — localStorage alone evaporates when iOS evicts a site it hasn't
 *  seen for a week).
 *
 *  Rides the SAME sync code as the watchlist sync — one code is "your data",
 *  the person only manages one secret — but its own document and endpoint
 *  (/portfolios with a bearer capability on the public worker, a wire save doc on the private
 *  build), so a stale client that only knows watchlists can never stomp a
 *  portfolio book. Same optimistic concurrency: pull, merge per portfolio by
 *  newest touch (a newer deletion beats an edit), push against the revision
 *  read, retry on a lost race.
 */

import { loadPortfolios, onPortfoliosChange, replacePortfolios } from './myPortfolios.js'
import { wireServiceUrl } from './wire.js'
import {
  getWatchlistCapability, onCapabilityChange, watchlistSyncEndpoint,
  watchlistSyncHeaders,
} from './watchlistSync.js'

const META_KEY = 'my_portfolios_sync_meta_v1'
export const PORTFOLIO_SAVE_KEY = 'ttw-my-portfolios'

export function loadPortfolioSyncMeta() {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY))
    if (raw && typeof raw === 'object') {
      return { rev: raw.rev || 0, touched: raw.touched || {}, deleted: raw.deleted || {} }
    }
  } catch { /* fresh device */ }
  return { rev: 0, touched: {}, deleted: {} }
}

export function savePortfolioSyncMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)) } catch { /* best-effort */ }
}

export function touchPortfolio(meta, id, ts = Date.now()) {
  return { ...meta, touched: { ...meta.touched, [id]: ts } }
}

export function markPortfolioDeleted(meta, id, ts = Date.now()) {
  const touched = { ...meta.touched }
  delete touched[id]
  return { ...meta, touched, deleted: { ...meta.deleted, [id]: ts } }
}

/** Merge local and remote docs. Per portfolio id the side with the newer
 *  touch wins whole; a deletion beats an edit only when newer; unknown
 *  remote portfolios are adopted. Returns { doc, changedLocal }. */
export function mergePortfolioDocs(local, remote) {
  if (!remote) return { doc: local, changedLocal: false }
  const lt = local.touched || {}
  const rt = remote.touched || {}
  const ld = local.deleted || {}
  const rd = remote.deleted || {}
  const localBy = new Map((local.portfolios || []).map((p) => [p.id, p]))
  const remoteBy = new Map((remote.portfolios || []).map((p) => [p.id, p]))
  const ids = [...new Set([...localBy.keys(), ...remoteBy.keys()])]

  const portfolios = []
  const touched = {}
  const deleted = { ...ld }
  for (const [id, ts] of Object.entries(rd)) {
    if (!(id in deleted) || deleted[id] < ts) deleted[id] = ts
  }
  let changedLocal = false
  for (const id of ids) {
    const editTs = Math.max(lt[id] || 0, rt[id] || 0)
    if ((deleted[id] || 0) >= editTs) {
      if (localBy.has(id)) changedLocal = true
      continue
    }
    const remoteWins = (rt[id] || 0) > (lt[id] || 0)
    const picked = remoteWins
      ? remoteBy.get(id) || localBy.get(id)
      : localBy.get(id) || remoteBy.get(id)
    if (!picked) continue
    // daily value marks are a union, whichever side won the edit: every
    // device files its own day, nobody's day is lost to a newer touch
    const ls = localBy.get(id)?.snapshots
    const rs = remoteBy.get(id)?.snapshots
    const winner = (ls || rs) ? { ...picked, snapshots: unionSnapshots(ls, rs, remoteWins) } : picked
    portfolios.push(winner)
    touched[id] = editTs
    const localCopy = localBy.get(id)
    if (!localCopy || JSON.stringify(localCopy) !== JSON.stringify(winner)) changedLocal = true
  }
  return { doc: { portfolios, touched, deleted }, changedLocal }
}

// ── transport ─────────────────────────────────────────────────────────────

function saveEndpoint() {
  const wire = wireServiceUrl()
  if (wire) return `${wire.replace(/\/$/, '')}/api/saves/${PORTFOLIO_SAVE_KEY}`
  const base = watchlistSyncEndpoint()
  // same capability, its own document kind
  return base ? base.replace(/\/watchlists$/, '/portfolios') : ''
}

async function api(init = {}) {
  const capabilityHeaders = wireServiceUrl() ? {} : watchlistSyncHeaders()
  const resp = await fetch(saveEndpoint(), {
    headers: { 'Content-Type': 'application/json', ...capabilityHeaders },
    signal: AbortSignal.timeout(10_000),
    ...init,
  })
  const out = await resp.json()
  return { status: resp.status, out }
}

async function pullRemote() {
  const { out } = await api()
  if (!out.ok) throw new Error(out.error || 'pull failed')
  return { doc: out.data, rev: out.rev }
}

async function pushRemote(doc, rev) {
  const { status, out } = await api({ method: 'POST', body: JSON.stringify({ data: doc, rev }) })
  if (status === 409) return { conflict: true, doc: out.data, rev: out.rev }
  if (!out.ok) throw new Error(out.error || 'push failed')
  return { conflict: false, rev: out.rev }
}

// ── engine ────────────────────────────────────────────────────────────────

const statusListeners = new Set()
let status = { state: 'off', rev: 0, at: 0 }

export function onPortfolioSyncStatus(fn) {
  statusListeners.add(fn)
  fn(status)
  return () => statusListeners.delete(fn)
}

function setStatus(next) {
  status = { ...status, ...next, at: Date.now() }
  for (const fn of statusListeners) fn(status)
}

export function portfolioSyncStatus() {
  return status
}

let applying = false
let timer = null
let interval = null
let started = false

function snapshot(meta) {
  return { portfolios: loadPortfolios(), touched: meta.touched, deleted: meta.deleted }
}

/** Merge two devices' daily marks by date; on the same date the winning
 *  side's reading stands. Pure, exported for tests. */
export function unionSnapshots(a, b, preferB = false) {
  const byDate = new Map()
  const [first, second] = preferB ? [a, b] : [b, a]
  for (const x of first || []) if (x?.d) byDate.set(x.d, x)
  for (const x of second || []) if (x?.d) byDate.set(x.d, x)
  return [...byDate.values()].sort((x, y) => (x.d < y.d ? -1 : 1))
}

// a snapshot is a reading, not an edit: writing one must not make this
// device the newest author of the whole book (a stale phone filing its
// day would otherwise overwrite a fresh holdings edit from elsewhere)
const editable = ({ snapshots, ...rest }) => rest

function stampLocalEdits(prev, meta) {
  const now = Date.now()
  let next = meta
  const items = loadPortfolios()
  const prevById = new Map(prev.map((p) => [p.id, p]))
  for (const p of items) {
    const before = prevById.get(p.id)
    if (!before || JSON.stringify(editable(before)) !== JSON.stringify(editable(p))) next = touchPortfolio(next, p.id, now)
    prevById.delete(p.id)
  }
  for (const id of prevById.keys()) next = markPortfolioDeleted(next, id, now)
  return next
}

async function syncOnce() {
  if (!saveEndpoint()) { setStatus({ state: 'off', rev: 0 }); return }
  let meta = loadPortfolioSyncMeta()
  setStatus({ state: 'syncing' })
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await pullRemote()
      const { doc, changedLocal } = mergePortfolioDocs(snapshot(meta), remote.doc)
      if (changedLocal) {
        applying = true
        try { replacePortfolios(doc.portfolios) } finally { applying = false }
      }
      const remoteMatches = remote.doc && JSON.stringify(remote.doc) === JSON.stringify(doc)
      if (remoteMatches) {
        meta = { ...meta, rev: remote.rev, touched: doc.touched, deleted: doc.deleted }
        savePortfolioSyncMeta(meta)
        setStatus({ state: 'synced', rev: remote.rev })
        return
      }
      const pushed = await pushRemote(doc, remote.rev)
      if (!pushed.conflict) {
        meta = { ...meta, rev: pushed.rev, touched: doc.touched, deleted: doc.deleted }
        savePortfolioSyncMeta(meta)
        setStatus({ state: 'synced', rev: pushed.rev })
        return
      }
      // lost the race: loop pulls the winner and merges again
    }
    setStatus({ state: 'error' })
  } catch {
    setStatus({ state: 'error' })
  }
}

function queueSync() {
  clearTimeout(timer)
  timer = setTimeout(syncOnce, 1500)
}

function restart() {
  clearTimeout(timer)
  clearInterval(interval)
  interval = null
  if (!saveEndpoint()) { setStatus({ state: 'off', rev: 0 }); return }
  syncOnce()
  // pull periodically so the other device's edits appear without a reload
  interval = setInterval(syncOnce, 60_000)
}

export function startMyPortfolioSync() {
  if (started || typeof localStorage === 'undefined') return
  started = true
  let prev = loadPortfolios()
  onPortfoliosChange(() => {
    if (applying) { prev = loadPortfolios(); return }
    savePortfolioSyncMeta(stampLocalEdits(prev, loadPortfolioSyncMeta()))
    prev = loadPortfolios()
    queueSync()
  })
  // the sync code is shared with the watchlist sync — enabling, connecting
  // or disconnecting there (or on the portfolio page) restarts this engine
  onCapabilityChange(() => {
    savePortfolioSyncMeta(getWatchlistCapability()
      ? loadPortfolioSyncMeta()
      : { rev: 0, touched: {}, deleted: {} })
    restart()
  })
  restart()
}
