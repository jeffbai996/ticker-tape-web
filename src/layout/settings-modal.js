// Settings modal: API keys for AI chat, preferences.

export function initSettingsModal() {
  document.addEventListener('open-settings', () => openSettings())
}

function openSettings() {
  const existing = document.getElementById('settings-overlay')
  if (existing) { existing.remove(); return }

  const overlay = document.createElement('div')
  overlay.id = 'settings-overlay'
  overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center'

  const modal = document.createElement('div')
  modal.className = 'bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md p-6 fade-in'

  const title = document.createElement('h2')
  title.className = 'text-lg font-semibold text-zinc-100 mb-4'
  title.textContent = 'Settings'

  const form = document.createElement('div')
  form.className = 'space-y-3'

  const keys = [
    { key: 'anthropic_key', label: 'Anthropic API Key', placeholder: 'sk-ant-...' },
    { key: 'google_key', label: 'Google AI API Key', placeholder: 'AI...' },
    { key: 'openai_key', label: 'OpenAI API Key', placeholder: 'sk-...' },
    { key: 'tavily_key', label: 'Tavily Search Key', placeholder: 'tvly-...' },
    { key: 'proxy_url', label: 'CORS Proxy URL', placeholder: 'https://...' },
  ]

  for (const k of keys) {
    const group = document.createElement('div')
    const label = document.createElement('label')
    label.className = 'block text-xs text-zinc-500 mb-1'
    label.textContent = k.label
    const input = document.createElement('input')
    input.type = k.key.includes('url') ? 'url' : 'password'
    input.placeholder = k.placeholder
    input.value = localStorage.getItem(k.key) || ''
    input.className = 'w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500'
    input.addEventListener('change', () => {
      if (input.value) localStorage.setItem(k.key, input.value)
      else localStorage.removeItem(k.key)
    })
    group.append(label, input)
    form.appendChild(group)
  }

  const closeBtn = document.createElement('button')
  closeBtn.className = 'mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md px-4 py-2 text-sm transition-colors'
  closeBtn.textContent = 'Close'
  closeBtn.addEventListener('click', () => overlay.remove())

  modal.append(title, form, closeBtn)
  overlay.appendChild(modal)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)
}
