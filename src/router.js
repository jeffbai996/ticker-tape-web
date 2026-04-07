// Hash-based SPA router.
// Routes: #/page or #/page/SYMBOL

import { setState } from './state.js'
import { BLOOMBERG_SHORTCUTS } from './layout/command-palette.js'

const routes = {}
let mainEl = null

export function registerPage(name, renderFn) {
  routes[name] = renderFn
}

export function setMainElement(el) {
  mainEl = el
}

export function initRouter() {
  window.addEventListener('hashchange', () => handleRoute())
  handleRoute()
}

async function handleRoute() {
  const hash = window.location.hash || '#/'
  const parts = hash.replace('#/', '').split('/')
  let page = parts[0] || 'dashboard'
  let param = parts.slice(1).join('/') || null

  // Resolve Bloomberg shortcuts (e.g. #/wei → market, #/fa/NVDA → lookup/NVDA)
  const resolved = BLOOMBERG_SHORTCUTS[page.toLowerCase()]
  if (resolved) page = resolved

  setState({ currentPage: page, currentSymbol: param })

  // Highlight active nav
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('bg-zinc-800', el.dataset.nav === page)
    el.classList.toggle('text-amber-400', el.dataset.nav === page)
  })

  if (!mainEl) return

  const renderFn = routes[page]
  if (renderFn) {
    // Show skeleton loading state (static template, no user data)
    mainEl.textContent = ''
    const skeleton = document.createElement('div')
    skeleton.className = 'flex items-center justify-center h-full'
    const bar = document.createElement('div')
    bar.className = 'skeleton w-48 h-6'
    skeleton.appendChild(bar)
    mainEl.appendChild(skeleton)

    try {
      await renderFn(mainEl, param)
    } catch (err) {
      console.error(`Error rendering ${page}:`, err)
      mainEl.textContent = ''
      const errDiv = document.createElement('div')
      errDiv.className = 'p-6 text-red-400'
      errDiv.textContent = `Error loading ${page}: ${err.message}`
      mainEl.appendChild(errDiv)
    }
  } else {
    mainEl.textContent = ''
    const unknown = document.createElement('div')
    unknown.className = 'p-6 text-zinc-500'
    unknown.textContent = `Unknown page: ${page}`
    mainEl.appendChild(unknown)
  }
}

// Navigate programmatically
export function go(page, param = null) {
  if (param) {
    window.location.hash = `#/${page}/${param}`
  } else {
    window.location.hash = `#/${page}`
  }
}
