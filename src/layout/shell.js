// App shell: status bar + sidebar + main content + chat panel.
// All innerHTML here is static template HTML — no user data flows in.

import { initStatusBar } from './status-bar.js'
import { initSidebar } from './sidebar.js'
import { setMainElement } from '../router.js'
import { registerPages } from '../pages/index.js'
import { setState } from '../state.js'
import { initCommandPalette } from './command-palette.js'
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

function buildShellHTML() {
  return `
    <div id="status-bar" class="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center overflow-hidden shrink-0 relative z-30"></div>
    <div class="flex flex-1 overflow-hidden">
      <aside id="sidebar" class="w-60 bg-zinc-900/50 border-r border-zinc-800 flex flex-col overflow-hidden shrink-0 transition-all duration-200 max-lg:w-14 max-md:hidden"></aside>
      <main id="main-content" class="flex-1 overflow-y-auto overflow-x-hidden"></main>
      <aside id="chat-panel" class="w-[360px] bg-zinc-900/50 border-l border-zinc-800 flex-col overflow-hidden shrink-0 hidden transition-all duration-200"></aside>
    </div>
    <nav id="mobile-nav" class="h-14 bg-zinc-900 border-t border-zinc-800 items-center justify-around shrink-0 hidden max-md:flex"></nav>
    <div id="command-palette" class="hidden"></div>
  `
}
