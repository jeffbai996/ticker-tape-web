// Formatting utilities for financial data display.

// ── Price & Change ────────────────────────────────────
export function fmtPrice(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(decimals)
}

export function fmtChange(n) {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

// ── Color classes ─────────────────────────────────────
export function changeColor(n) {
  if (n == null || isNaN(n) || Number(n) === 0) return 'text-zinc-400'
  return Number(n) > 0 ? 'text-positive' : 'text-negative'
}

export function changeBg(n) {
  if (n == null || isNaN(n) || Number(n) === 0) return 'bg-zinc-800'
  return Number(n) > 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
}

export function rsiColor(rsi) {
  if (rsi == null) return 'text-zinc-400'
  if (rsi >= 70) return 'text-negative'
  if (rsi <= 30) return 'text-positive'
  return 'text-zinc-300'
}

export function rsiLabel(rsi) {
  if (rsi == null) return ''
  if (rsi >= 70) return 'Overbought'
  if (rsi <= 30) return 'Oversold'
  return ''
}

// ── Market Cap ────────────────────────────────────────
export function fmtCap(n) {
  if (n == null || isNaN(n)) return '—'
  const v = Math.abs(Number(n))
  if (v >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`
  return `$${Math.round(n).toLocaleString()}`
}

// ── Large numbers ─────────────────────────────────────
export function fmtNum(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString()
}

export function fmtCompact(n) {
  if (n == null || isNaN(n)) return '—'
  const v = Math.abs(Number(n))
  const sign = n < 0 ? '-' : ''
  if (v >= 1e12) return `${sign}${(v / 1e12).toFixed(1)}T`
  if (v >= 1e9)  return `${sign}${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6)  return `${sign}${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3)  return `${sign}${(v / 1e3).toFixed(1)}K`
  return `${sign}${v.toFixed(0)}`
}

// ── Volume ────────────────────────────────────────────
export function fmtVol(n) {
  if (n == null || isNaN(n)) return '—'
  return fmtCompact(n)
}

// ── Sparkline SVG ─────────────────────────────────────
export function sparklineSVG(prices, { width = 80, height = 24, color = null } = {}) {
  if (!prices || prices.length < 2) return ''
  const nums = prices.filter(p => p != null && !isNaN(p))
  if (nums.length < 2) return ''

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min || 1

  const isUp = nums[nums.length - 1] >= nums[0]
  const strokeColor = color || (isUp ? '#22c55e' : '#ef4444')

  const points = nums.map((v, i) => {
    const x = (i / (nums.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <polyline fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
  </svg>`
}

// ── Time formatting ───────────────────────────────────
export function timeAgo(ts) {
  if (!ts) return ''
  const now = Date.now()
  const diff = now - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'America/New_York',
  })
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Escaping ──────────────────────────────────────────
export function esc(s) {
  if (!s) return ''
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}
