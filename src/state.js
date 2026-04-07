// Simple reactive state using EventTarget.
// Components subscribe to state changes, state updates trigger re-renders.

const bus = new EventTarget()

const state = {
  currentSymbol: null,
  currentPage: 'dashboard',
  chatOpen: false,
  sidebarCollapsed: false,
  symbols: [],      // populated from quotes.json
  meta: null,        // market state, timestamp
}

export function getState() {
  return state
}

export function setState(patch) {
  Object.assign(state, patch)
  bus.dispatchEvent(new CustomEvent('state-change', { detail: patch }))
}

export function onStateChange(fn) {
  bus.addEventListener('state-change', (e) => fn(e.detail, state))
}

// Convenience: navigate to a page
export function navigate(page, symbol = null) {
  if (symbol) {
    window.location.hash = `#/${page}/${symbol}`
  } else {
    window.location.hash = `#/${page}`
  }
}
