const STORAGE_KEY = 'ttw_market_color_order_v1'
const ORDERS = new Set(['global', 'cn'])

export function defaultMarketColorOrder(family = import.meta.env.VITE_FAMILY_BUILD === '1') {
  return family ? 'cn' : 'global'
}

export function getMarketColorOrder(
  store = globalThis.localStorage,
  family = import.meta.env.VITE_FAMILY_BUILD === '1',
) {
  try {
    const saved = store?.getItem(STORAGE_KEY)
    return ORDERS.has(saved) ? saved : defaultMarketColorOrder(family)
  } catch {
    return defaultMarketColorOrder(family)
  }
}

export function applyMarketColorOrder(order, root = globalThis.document?.documentElement) {
  const normalized = ORDERS.has(order) ? order : 'global'
  if (root) root.dataset.marketColors = normalized
  return normalized
}

export function saveMarketColorOrder(
  order,
  store = globalThis.localStorage,
  root = globalThis.document?.documentElement,
) {
  const normalized = applyMarketColorOrder(order, root)
  try { store?.setItem(STORAGE_KEY, normalized) } catch { /* best-effort preference */ }
  return normalized
}

export function initMarketColorOrder(options = {}) {
  const order = getMarketColorOrder(options.store, options.family)
  return applyMarketColorOrder(order, options.root)
}

export function oppositeMarketColorOrder(order) {
  return order === 'cn' ? 'global' : 'cn'
}

export { STORAGE_KEY as MARKET_COLOR_STORAGE_KEY }
