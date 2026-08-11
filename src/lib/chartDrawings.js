// Per-symbol chart annotations (horizontal price lines, two-point trendlines),
// persisted in localStorage. Pure storage + validation only — nothing here
// knows about lightweight-charts, so it stays testable in node.
//
// Shape on disk: { "NVDA": [ { id, type, points: [{time, price}, …] }, … ] }

export const DRAWINGS_KEY = 'tape-chart-drawings-v1'

// How many points each drawing type is defined by. Also the whitelist — an
// unknown type is dropped rather than rendered as something it isn't.
const ARITY = { hline: 1, trend: 2 }

let seq = 0
export function newId() {
  // Counter, not just a random tail: two drawings placed in the same
  // millisecond must not collide, and delete works by id.
  seq += 1
  return `d${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v)
// lightweight-charts accepts either a UNIX-second number or a 'YYYY-MM-DD'
// business-day string as a time; both must survive the JSON round-trip.
const validTime = (t) => finite(t) || (typeof t === 'string' && t.length > 0)

/** Normalize one drawing, or null if it can't be trusted. */
export function sanitizeDrawing(d) {
  if (!d || typeof d !== 'object') return null
  const arity = ARITY[d.type]
  if (!arity) return null
  if (!Array.isArray(d.points) || d.points.length < arity) return null
  const points = []
  for (let i = 0; i < arity; i++) {
    const p = d.points[i]
    if (!p || typeof p !== 'object') return null
    if (!validTime(p.time) || !finite(p.price)) return null
    // Rebuild the point rather than spread it: whatever else an old or
    // hand-edited entry carries must not reach the renderer.
    points.push({ time: p.time, price: p.price })
  }
  return { id: typeof d.id === 'string' && d.id ? d.id : newId(), type: d.type, points }
}

const key = (symbol) => (typeof symbol === 'string' ? symbol.trim().toUpperCase() : '')

function store(s) {
  if (s !== undefined) return s
  return typeof localStorage === 'undefined' ? null : localStorage
}

/** Every symbol's drawings. Any corruption collapses to {} — never throws. */
export function readAll(s) {
  const st = store(s)
  if (!st) return {}
  let raw
  try { raw = st.getItem(DRAWINGS_KEY) } catch { return {} }
  if (!raw) return {}
  let parsed
  try { parsed = JSON.parse(raw) } catch { return {} }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed
}

function writeAll(map, s) {
  const st = store(s)
  if (!st) return
  // A full disk or Safari private mode must not take the chart down with it.
  try { st.setItem(DRAWINGS_KEY, JSON.stringify(map)) } catch { /* not worth surfacing */ }
}

export function loadDrawings(symbol, s) {
  const k = key(symbol)
  if (!k) return []
  const list = readAll(s)[k]
  if (!Array.isArray(list)) return []
  return list.map(sanitizeDrawing).filter(Boolean)
}

export function saveDrawings(symbol, list, s) {
  const k = key(symbol)
  if (!k) return []
  const clean = (Array.isArray(list) ? list : []).map(sanitizeDrawing).filter(Boolean)
  const map = readAll(s)
  if (clean.length) map[k] = clean
  else delete map[k]
  writeAll(map, s)
  return clean
}

export function addDrawing(symbol, drawing, s) {
  const d = sanitizeDrawing(drawing)
  const list = loadDrawings(symbol, s)
  if (!d) return list
  return saveDrawings(symbol, [...list, d], s)
}

export function removeDrawing(symbol, id, s) {
  return saveDrawings(symbol, loadDrawings(symbol, s).filter((d) => d.id !== id), s)
}

export function clearDrawings(symbol, s) {
  return saveDrawings(symbol, [], s)
}
