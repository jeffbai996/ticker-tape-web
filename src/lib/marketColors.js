import {preferenceChanged} from './preferences.js'
const STORAGE_KEY = 'ttw_market_color_order_v1'
const ORDERS = new Set(['global', 'cn'])

/** Red-up is the family web build's default. The family edition on the TV
 *  shares its data, not its reader, and starts in global colors. */
export function cnColorsByDefault(env) {
  return env.VITE_FAMILY_BUILD === '1' && env.VITE_TV !== '1'
}

const CN_BY_DEFAULT = cnColorsByDefault(import.meta.env)

export function defaultMarketColorOrder(family = CN_BY_DEFAULT) {
  return family ? 'cn' : 'global'
}

export function getMarketColorOrder(
  store = globalThis.localStorage,
  family = CN_BY_DEFAULT,
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
  preferenceChanged()
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
