// App shell: status bar + sidebar + main content + chat panel.
// All innerHTML here is static template HTML — no user data flows in.

import { initStatusBar } from './status-bar.js'
import { initSidebar } from './sidebar.js'
import { setMainElement, go } from '../router.js'
import { registerPages } from '../pages/index.js'
import { setState } from '../state.js'
import { initCommandPalette, BLOOMBERG_SHORTCUTS } from './command-palette.js'
import { initSettingsModal } from './settings-modal.js'
import { initChatPanel } from '../chat/panel.js'

export function initShell(app) {
  // Build layout using static template (safe — no user input)
  /* eslint-disable no-unsanitized/property */
  app.innerHTML = buildShellHTML()
  /* eslint-enable no-unsanitized/property */

  const mainEl = document.getElementById('main-content')
  setMainElement(mainEl)

  registerPages()
  initStatusBar(document.getElementById('status-bar'))
  initSidebar(document.getElementById('sidebar'))
  initCommandPalette(document.getElementById('command-palette'))
  initSettingsModal()
  initChatPanel(document.getElementById('chat-panel'))
  initMobileNav(document.getElementById('mobile-nav'))

  // Command buffer — Bloomberg-style keyboard input
  initCommandBuffer()

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      document.dispatchEvent(new Event('open-palette'))
    }
    if (e.key === 'Escape') {
      const palette = document.getElementById('command-palette')
      if (!palette.classList.contains('hidden')) {
        palette.classList.add('hidden')
      }
    }
  })

  // Chat toggle
  document.addEventListener('toggle-chat', () => {
    const panel = document.getElementById('chat-panel')
    const isOpen = !panel.classList.contains('hidden')
    panel.classList.toggle('hidden', isOpen)
    panel.classList.toggle('flex', !isOpen)
    setState({ chatOpen: !isOpen })
  })
}

function initMobileNav(nav) {
  const items = [
    { label: 'Home',   hash: '#/',        icon: '▦' },
    { label: 'Market', hash: '#/market',  icon: '↗' },
    { label: 'Charts', hash: '#/chart',   icon: '📊' },
    { label: 'Chat',   event: 'toggle-chat', icon: '💬' },
    { label: 'Menu',   event: 'open-palette', icon: '☰' },
  ]
  for (const item of items) {
    const btn = document.createElement('button')
    btn.className = 'flex flex-col items-center gap-0.5 text-zinc-400 hover:text-zinc-200 text-xs'
    const iconSpan = document.createElement('span')
    iconSpan.className = 'text-lg'
    iconSpan.textContent = item.icon
    const labelSpan = document.createElement('span')
    labelSpan.textContent = item.label
    btn.append(iconSpan, labelSpan)
    if (item.hash) {
      btn.addEventListener('click', () => { location.hash = item.hash })
    } else if (item.event) {
      btn.addEventListener('click', () => document.dispatchEvent(new Event(item.event)))
    }
    nav.appendChild(btn)
  }
}

function initCommandBuffer() {
  let commandBuffer = ''

  // Overlay element
  const overlay = document.createElement('div')
  overlay.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 font-mono text-amber-400 text-sm z-50 shadow-lg hidden'
  document.body.appendChild(overlay)

  // Quick aliases — same as TUI single/short commands
  const ALIASES = {
    t: 'dashboard', m: 'market', s: 'sectors', e: 'earnings',
    hm: 'heatmap', com: 'commodities', cal: 'calendar', cor: 'correlation',
    vs: 'comparison', val: 'valuation', n: 'news', ta: 'technicals',
    c: 'chart', id: 'intraday', div: 'dividends', si: 'short',
    rat: 'ratings', l: 'lookup',
  }

  const PAGE_NAMES = new Set([
    'dashboard', 'market', 'sectors', 'earnings', 'heatmap', 'commodities',
    'calendar', 'correlation', 'comparison', 'valuation', 'news',
    'lookup', 'chart', 'technicals', 'intraday', 'dividends', 'short', 'ratings',
    'insider', 'impact', 'options', 'terminal', 'alerts',
  ])

  function updateOverlay() {
    if (commandBuffer.length === 0) {
      overlay.classList.add('hidden')
      return
    }
    overlay.classList.remove('hidden')
    overlay.textContent = ''
    const gt = document.createElement('span')
    gt.className = 'text-zinc-500 mr-1'
    gt.textContent = '>'
    const text = document.createElement('span')
    text.textContent = commandBuffer
    const cursor = document.createElement('span')
    cursor.className = 'animate-pulse'
    cursor.textContent = '_'
    overlay.append(gt, text, cursor)
  }

  function dispatchBuffer() {
    const raw = commandBuffer.trim()
    commandBuffer = ''
    updateOverlay()
    if (!raw) return

    const parts = raw.split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const arg = parts.slice(1).join(' ').toUpperCase() || null

    // Bloomberg shortcuts first
    const bloomberg = BLOOMBERG_SHORTCUTS[cmd]
    if (bloomberg) { go(bloomberg, arg); return }

    // Direct page names
    if (PAGE_NAMES.has(cmd)) { go(cmd, arg); return }

    // Short aliases
    if (ALIASES[cmd]) { go(ALIASES[cmd], arg); return }

    // Symbol lookup: 1-5 alpha uppercase
    if (/^[A-Z]{1,5}$/i.test(raw) && !arg) {
      go('lookup', raw.toUpperCase())
      return
    }

    // If first word is an alias and has a symbol after it
    const aliased = ALIASES[cmd] || BLOOMBERG_SHORTCUTS[cmd]
    if (aliased && arg) { go(aliased, arg); return }

    // Fallback: open command palette with the text
    // (unrecognized command, let palette fuzzy-match)
    go('terminal')
  }

  document.addEventListener('keydown', (e) => {
    // Ignore when typing in form elements
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    // Ignore when command palette is open
    const palette = document.getElementById('command-palette')
    if (palette && !palette.classList.contains('hidden')) return

    // Ignore modifier combos (except shift for uppercase)
    if (e.metaKey || e.ctrlKey || e.altKey) return

    if (e.key === 'Backspace') {
      e.preventDefault()
      commandBuffer = commandBuffer.slice(0, -1)
      updateOverlay()
      return
    }

    if (e.key === 'Enter' && commandBuffer.length > 0) {
      e.preventDefault()
      dispatchBuffer()
      return
    }

    if (e.key === 'Escape') {
      if (commandBuffer.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        commandBuffer = ''
        updateOverlay()
        return
      }
    }

    // Single printable character (alphanumeric, space, common symbols)
    if (e.key.length === 1 && /[a-zA-Z0-9 ]/.test(e.key)) {
      e.preventDefault()
      commandBuffer += e.key.toUpperCase()
      updateOverlay()
    }
  })
}

function buildShellHTML() {
  return `
    <div id="status-bar" class="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center overflow-hidden shrink-0 relative z-30"></div>
    <div class="flex flex-1 overflow-hidden">
      <aside id="sidebar" class="w-60 bg-zinc-900/50 border-r border-zinc-800 flex flex-col overflow-hidden shrink-0 transition-all duration-200 max-lg:w-14 max-md:hidden"></aside>
      <main id="main-content" class="flex-1 overflow-y-auto overflow-x-hidden"></main>
      <aside id="chat-panel" class="w-[360px] max-w-full max-xl:fixed max-xl:right-0 max-xl:top-8 max-xl:bottom-0 max-xl:z-40 bg-zinc-900 border-l border-zinc-800 flex-col overflow-hidden shrink-0 hidden transition-all duration-200"></aside>
    </div>
    <nav id="mobile-nav" class="h-14 bg-zinc-900 border-t border-zinc-800 items-center justify-around shrink-0 hidden max-md:flex"></nav>
    <div id="command-palette" class="hidden"></div>
  `
}
