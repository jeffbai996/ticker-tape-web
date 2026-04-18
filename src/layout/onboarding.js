// First-run onboarding: prompt user to deploy/configure the CORS Worker.
// Without a proxy_url, the live-quote polling is silently disabled and the
// dashboard shows only 5-min-stale pipeline data — which looks like "stuck
// on data fetch" even though the static JSON is fine.

const DISMISS_KEY = 'onboarding_dismissed_proxy'
const WORKER_README = 'https://github.com/jeffbai996/ticker-tape-web/tree/main/worker'

export function maybeShowOnboarding() {
  if (localStorage.getItem('proxy_url')) return
  if (localStorage.getItem(DISMISS_KEY) === '1') return
  show()
}

// Force-show (used by Settings "Reset onboarding" button)
export function forceShowOnboarding() {
  localStorage.removeItem(DISMISS_KEY)
  show()
}

function dismiss(overlay) {
  localStorage.setItem(DISMISS_KEY, '1')
  overlay.remove()
}

function show() {
  if (document.getElementById('onboarding-overlay')) return

  const overlay = document.createElement('div')
  overlay.id = 'onboarding-overlay'
  overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center'

  const modal = document.createElement('div')
  modal.className = 'bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg p-6 fade-in'

  const title = document.createElement('h2')
  title.className = 'text-lg font-semibold text-zinc-100 mb-2'
  title.textContent = 'Enable live quotes'

  const body = document.createElement('p')
  body.className = 'text-sm text-zinc-400 mb-4 leading-relaxed'
  body.textContent = 'This dashboard can show real-time quotes via a Cloudflare Worker that proxies Yahoo Finance. Without one, data is limited to the 5-minute pipeline refresh.'

  const ctaRow = document.createElement('div')
  ctaRow.className = 'flex flex-col gap-2 mb-3'

  const deployBtn = document.createElement('a')
  deployBtn.href = WORKER_README
  deployBtn.target = '_blank'
  deployBtn.rel = 'noopener noreferrer'
  deployBtn.className = 'block w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-md px-4 py-2 text-sm text-center transition-colors'
  deployBtn.textContent = 'Deploy your own Worker →'

  const haveBtn = document.createElement('button')
  haveBtn.className = 'w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md px-4 py-2 text-sm transition-colors'
  haveBtn.textContent = 'I already have one — open Settings'
  haveBtn.addEventListener('click', () => {
    dismiss(overlay)
    document.dispatchEvent(new Event('open-settings'))
  })

  ctaRow.append(deployBtn, haveBtn)

  const skipBtn = document.createElement('button')
  skipBtn.className = 'w-full text-zinc-500 hover:text-zinc-300 text-xs mt-2 transition-colors'
  skipBtn.textContent = 'Skip for now'
  skipBtn.addEventListener('click', () => dismiss(overlay))

  modal.append(title, body, ctaRow, skipBtn)
  overlay.appendChild(modal)
  // Click outside dismisses (same pattern as settings-modal.js)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(overlay) })
  document.body.appendChild(overlay)
}
