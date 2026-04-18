// Impact page: earnings-move history for one symbol.
// Data source: public/data/impact/{SYM}.json (see scripts/fetch_data.py:fetch_impact).

import { loadImpact, loadQuotes, loadMeta } from '../lib/data.js'
import { fmtPct } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el, symbol) {
  if (!symbol) {
    const quotes = await loadQuotes()
    if (quotes?.length) symbol = quotes[0].symbol
    else { el.textContent = 'No symbol specified.'; return }
  }
  symbol = symbol.toUpperCase()

  el.textContent = ''
  const container = document.createElement('div')
  container.className = 'p-4 fade-in space-y-4 max-w-5xl'
  el.appendChild(container)

  // Header
  const [impact, meta] = await Promise.all([loadImpact(symbol), loadMeta()])
  const name = meta?.names?.[symbol] || ''

  const header = document.createElement('div')
  header.className = 'flex items-center justify-between'
  const left = document.createElement('div')
  left.className = 'flex items-baseline gap-3'
  const symEl = document.createElement('span')
  symEl.className = 'font-mono text-xl font-bold text-amber-400 cursor-pointer hover:underline'
  symEl.textContent = symbol
  symEl.title = 'Open lookup'
  symEl.addEventListener('click', () => go('lookup', symbol))
  const nameEl = document.createElement('span')
  nameEl.className = 'text-sm text-zinc-400'
  nameEl.textContent = name
  const titleEl = document.createElement('span')
  titleEl.className = 'text-lg font-semibold text-zinc-100'
  titleEl.textContent = 'Earnings Impact'
  left.append(symEl, titleEl, nameEl)
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = impact?.timestamp ? new Date(impact.timestamp).toLocaleString() : ''
  header.append(left, ts)
  container.appendChild(header)

  if (!impact?.events?.length) {
    const empty = document.createElement('div')
    empty.className = 'card p-6 text-center text-zinc-500 text-sm'
    empty.textContent = `No earnings history available yet for ${symbol}. Data refreshes every 6 hours.`
    container.appendChild(empty)
    return
  }

  container.appendChild(renderSummary(impact.summary))
  container.appendChild(renderEventsTable(impact.events))
}

function renderSummary(summary) {
  const card = document.createElement('div')
  card.className = 'card p-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs'

  const items = [
    ['Beat Rate', summary.beat_rate != null ? `${(summary.beat_rate * 100).toFixed(1)}%` : '—',
      colorForBeatRate(summary.beat_rate)],
    ['Beat Streak', summary.beat_streak != null ? String(summary.beat_streak) : '—', 'text-zinc-200'],
    ['Record', summary.beats != null && summary.total != null ? `${summary.beats}/${summary.total}` : '—', 'text-zinc-200'],
    ['Avg Surprise', summary.avg_surprise != null ? fmtPct(summary.avg_surprise) : '—',
      colorForValue(summary.avg_surprise)],
    ['Avg 1d Move', summary.avg_move != null ? fmtPct(summary.avg_move) : '—',
      colorForValue(summary.avg_move)],
    ['Avg |Move|', summary.avg_abs_move != null ? `${summary.avg_abs_move.toFixed(2)}%` : '—', 'text-zinc-200'],
  ]

  for (const [label, value, color] of items) {
    const group = document.createElement('span')
    group.className = 'flex items-baseline gap-1.5'
    const lbl = document.createElement('span')
    lbl.className = 'text-zinc-500 uppercase tracking-wider font-semibold text-[10px]'
    lbl.textContent = label
    const val = document.createElement('span')
    val.className = `font-mono font-semibold ${color}`
    val.textContent = value
    group.append(lbl, val)
    card.appendChild(group)
  }

  return card
}

function renderEventsTable(events) {
  const card = document.createElement('div')
  card.className = 'card overflow-hidden'

  const table = document.createElement('table')
  table.className = 'w-full text-sm'

  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  headRow.className = 'border-b border-zinc-800'
  for (const col of ['Date', 'EPS Est', 'EPS Actual', 'Surprise', '1d Move', '5d Move', 'Peer Avg']) {
    const th = document.createElement('th')
    th.className = 'px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 first:text-left'
    th.textContent = col
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  for (const ev of events) {
    const tr = document.createElement('tr')
    tr.className = 'border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/30 transition-colors'

    const cells = [
      { text: ev.date, align: 'left', color: 'text-zinc-300' },
      { text: ev.eps_est != null ? ev.eps_est.toFixed(2) : '—', color: 'text-zinc-400' },
      { text: ev.eps_actual != null ? ev.eps_actual.toFixed(2) : '—', color: 'text-zinc-200' },
      { text: ev.surprise_pct != null ? fmtPct(ev.surprise_pct) : '—', color: colorForValue(ev.surprise_pct) },
      { text: ev.move_1d != null ? fmtPct(ev.move_1d) : '—', color: colorForValue(ev.move_1d) },
      { text: ev.move_5d != null ? fmtPct(ev.move_5d) : '—', color: colorForValue(ev.move_5d) },
      { text: peerAvg(ev.peers), color: colorForValue(peerAvgNum(ev.peers)) },
    ]
    for (const c of cells) {
      const td = document.createElement('td')
      td.className = `px-4 py-2 font-mono text-sm ${c.color} ${c.align === 'left' ? 'text-left' : 'text-right'}`
      td.textContent = c.text
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  card.appendChild(table)
  return card
}

function peerAvgNum(peers) {
  if (!peers?.length) return null
  const moves = peers.map(p => p.move).filter(m => m != null)
  if (!moves.length) return null
  return moves.reduce((a, b) => a + b, 0) / moves.length
}

function peerAvg(peers) {
  const n = peerAvgNum(peers)
  return n != null ? fmtPct(n) : '—'
}

function colorForValue(val) {
  if (val == null) return 'text-zinc-500'
  if (val > 0) return 'text-positive'
  if (val < 0) return 'text-negative'
  return 'text-zinc-400'
}

function colorForBeatRate(rate) {
  if (rate == null) return 'text-zinc-500'
  if (rate >= 0.75) return 'text-positive'
  if (rate < 0.5) return 'text-negative'
  return 'text-zinc-200'
}
