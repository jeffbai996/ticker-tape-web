export const RAIL_LIMITS = {
  left: { min: 160, max: 360, hideAt: 48 },
  right: { min: 180, max: 420, hideAt: 48 },
}

/** Keep a visible rail usable; zero is the explicit collapsed state. */
export function validRailWidth(value, { min, max }) {
  if (value == null || String(value).trim() === '') return null
  const width = Number(value)
  if (width === 0) return 0
  return Number.isFinite(width) && width >= min && width <= max ? width : null
}

/** Resolve a drag delta without feeding every pointer event through Preact. */
export function railWidthAtDrag(startWidth, delta, { min, max, hideAt }) {
  const raw = Math.round(startWidth + delta)
  if (raw <= hideAt) return 0
  return Math.min(max, Math.max(min, raw))
}

/** A button toggle preserves the user's chosen width; drag-to-edge remains
 * the direct gesture for people who want to change it. */
export function toggleRailWidth(currentWidth, restoreWidth) {
  return currentWidth > 0 ? 0 : restoreWidth
}

export function storedRailWidth(key, fallback, limits) {
  try {
    const saved = validRailWidth(localStorage.getItem(key), limits)
    return saved == null ? fallback : saved
  } catch {
    return fallback
  }
}

export function saveRailWidth(key, width) {
  try { localStorage.setItem(key, String(width)) } catch { /* preference only */ }
}
