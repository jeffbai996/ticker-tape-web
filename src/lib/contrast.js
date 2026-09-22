const KEY = 'ttw_high_contrast_v1'

export function getHighContrast(store = globalThis.localStorage) {
  try { return store?.getItem(KEY) === '1' } catch { return false }
}

export function applyHighContrast(enabled, root = globalThis.document?.documentElement) {
  if (root) root.dataset.contrast = enabled ? 'high' : 'standard'
}

export function saveHighContrast(enabled, store = globalThis.localStorage, root = globalThis.document?.documentElement) {
  applyHighContrast(enabled, root)
  try { store?.setItem(KEY, enabled ? '1' : '0') } catch { /* preference remains active */ }
}

// Relative to the busiest five-minute interval, not price direction.
export function activityColor(count, peak) {
  if (count <= 0) return '#79828d'
  const share = count / Math.max(1, peak)
  return share >= .75 ? '#ffb000' : share >= .35 ? '#e7ecf3' : '#8da9d6'
}
