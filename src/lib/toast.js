// Toast notification system. Shows brief messages bottom-right.

let containerEl = null

function ensureContainer() {
  if (containerEl) return containerEl
  containerEl = document.createElement('div')
  containerEl.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none'
  document.body.appendChild(containerEl)
  return containerEl
}

/**
 * Show a toast notification.
 * @param {string} message - Text to display
 * @param {'info'|'positive'|'negative'|'alert'} type - Color scheme
 * @param {number} duration - Auto-dismiss in ms (default 5000)
 */
export function showToast(message, type = 'info', duration = 5000) {
  const container = ensureContainer()

  const colors = {
    info:     'bg-zinc-800 border-info text-zinc-200',
    positive: 'bg-zinc-800 border-green-500 text-green-400',
    negative: 'bg-zinc-800 border-red-500 text-red-400',
    alert:    'bg-zinc-800 border-amber-500 text-amber-400',
  }

  const toast = document.createElement('div')
  toast.className = `pointer-events-auto border-l-4 rounded-md px-4 py-3 text-sm shadow-lg ${colors[type] || colors.info} animate-slide-in`
  toast.textContent = message

  container.appendChild(toast)

  // Auto-dismiss
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(100%)'
    toast.style.transition = 'all 0.3s ease-out'
    setTimeout(() => toast.remove(), 300)
  }, duration)
}

/**
 * Show alert trigger notification (toast + browser notification if permitted).
 * @param {{ symbol: string, operator: string, value: number }} alert
 * @param {number} currentPrice
 */
export function notifyAlert(alert, currentPrice) {
  const msg = `${alert.symbol} ${alert.operator} ${alert.value} triggered (now $${currentPrice.toFixed(2)})`
  showToast(msg, 'alert', 8000)

  // Browser notification (non-blocking, fails silently if not permitted)
  if (Notification?.permission === 'granted') {
    try {
      new Notification('Price Alert', { body: msg, icon: '/ticker-tape-web/favicon.ico' })
    } catch (_) { /* ignore */ }
  }
}
