// Options page: live options chain via CF Worker (Yahoo v7/finance/options).
// Requires a proxy_url set in Settings. Gracefully degrades if unset.

import { loadMeta, loadQuotes } from '../lib/data.js'
import { fetchOptionsChain, isOptionsAvailable, atmIndex } from '../lib/options.js'
import { fmtPrice, fmtPct, fmtChange, fmtVol, changeColor } from '../lib/format.js'
import { go } from '../router.js'

const CONTRACT_COLUMNS = [
  { key: 'strike',    label: 'Strike',  fmt: v => fmtPrice(v), align: 'right', mono: true },
  { key: 'bid',       label: 'Bid',     fmt: v => fmtPrice(v), align: 'right', mono: true },
  { key: 'ask',       label: 'Ask',     fmt: v => fmtPrice(v), align: 'right', mono: true },
  { key: 'lastPrice', label: 'Last',    fmt: v => fmtPrice(v), align: 'right', mono: true },
  { key: 'percentChange', label: 'Chg%', fmt: v => fmtPct(v),   align: 'right', mono: true, color: true },
  { key: 'volume',    label: 'Vol',     fmt: v => fmtVol(v),    align: 'right', mono: true },
  { key: 'openInterest', label: 'OI',   fmt: v => fmtVol(v),    align: 'right', mono: true },
  { key: 'impliedVolatility', label: 'IV', fmt: v => v != null ? `${(v * 100).toFixed(1)}%` : '—', align: 'right', mono: true },
]

export async function render(el, symbol) {
  if (!symbol) {
    const quotes = await loadQuotes()
    if (quotes?.length) symbol = quotes[0].symbol
    else { el.textContent = 'No symbol specified.'; return }
  }
  symbol = symbol.toUpperCase()

  el.textContent = ''
  const container = document.createElement('div')
  container.className = 'p-4 fade-in space-y-4'
  el.appendChild(container)

  const [meta, quotes] = await Promise.all([loadMeta(), loadQuotes()])
  const name = meta?.names?.[symbol] || ''
  const quote = quotes?.find(q => q.symbol === symbol)

  container.appendChild(buildHeader(symbol, name, quote))
  container.appendChild(buildNavRow(symbol))

  const body = document.createElement('div')
  container.appendChild(body)

  if (!isOptionsAvailable()) {
    body.appendChild(buildProxyPrompt())
    return
  }

  body.textContent = ''
  body.appendChild(buildLoadingState())

  const chain = await fetchOptionsChain(symbol)
  body.textContent = ''

  if (!chain) {
    body.appendChild(buildErrorCard(symbol))
    return
  }

  body.appendChild(buildChainUI(symbol, chain))
}

function buildHeader(symbol, name, quote) {
  const header = document.createElement('div')
  header.className = 'flex items-center gap-3 mb-2 flex-wrap'
  const symEl = document.createElement('span')
  symEl.className = 'font-mono text-xl font-bold text-amber-400 cursor-pointer hover:underline'
  symEl.textContent = symbol
  symEl.title = 'Open lookup'
  symEl.addEventListener('click', () => go('lookup', symbol))
  const nameEl = document.createElement('span')
  nameEl.className = 'text-sm text-zinc-400'
  nameEl.textContent = name
  header.append(symEl, nameEl)

  if (quote) {
    const priceEl = document.createElement('span')
    priceEl.className = 'font-mono text-xl font-extrabold text-zinc-100 ml-auto'
    priceEl.textContent = fmtPrice(quote.price)
    const chgEl = document.createElement('span')
    chgEl.className = `font-mono text-sm ${changeColor(quote.pct)}`
    chgEl.textContent = fmtChange(quote.change)
    const pctEl = document.createElement('span')
    pctEl.className = `font-mono text-sm font-semibold ${changeColor(quote.pct)}`
    pctEl.textContent = fmtPct(quote.pct)
    header.append(priceEl, chgEl, pctEl)
  }

  return header
}

function buildNavRow(symbol) {
  const navRow = document.createElement('div')
  navRow.className = 'flex gap-2 flex-wrap'
  for (const [page, label] of [['chart', 'Chart'], ['lookup', 'Lookup'], ['technicals', 'Technicals']]) {
    const btn = document.createElement('button')
    btn.className = 'px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors'
    btn.textContent = label
    btn.addEventListener('click', () => go(page, symbol))
    navRow.appendChild(btn)
  }
  return navRow
}

function buildProxyPrompt() {
  const card = document.createElement('div')
  card.className = 'card p-6 text-center'
  const icon = document.createElement('div')
  icon.className = 'text-3xl text-zinc-600 mb-3'
  icon.textContent = '\u2696\uFE0F'
  const msg = document.createElement('p')
  msg.className = 'text-zinc-300 text-sm mb-2'
  msg.textContent = 'Options chain requires a CORS proxy.'
  const sub = document.createElement('p')
  sub.className = 'text-zinc-500 text-xs leading-relaxed max-w-md mx-auto mb-4'
  sub.textContent = 'Set a Cloudflare Worker URL in Settings to stream live options data from Yahoo Finance. The proxy also powers live quotes.'

  const btn = document.createElement('button')
  btn.className = 'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-md px-4 py-2 text-sm transition-colors'
  btn.textContent = 'Open Settings'
  btn.addEventListener('click', () => document.dispatchEvent(new Event('open-settings')))

  card.append(icon, msg, sub, btn)
  return card
}

function buildErrorCard(symbol) {
  const card = document.createElement('div')
  card.className = 'card p-6 text-center'
  const msg = document.createElement('p')
  msg.className = 'text-zinc-400 text-sm mb-1'
  msg.textContent = `No options chain available for ${symbol}.`
  const sub = document.createElement('p')
  sub.className = 'text-zinc-500 text-xs'
  sub.textContent = 'Check that your proxy URL is correct, or try another symbol.'
  card.append(msg, sub)
  return card
}

function buildLoadingState() {
  const card = document.createElement('div')
  card.className = 'card p-6 text-center text-zinc-500 text-sm'
  card.textContent = 'Loading options chain…'
  return card
}

function buildChainUI(symbol, chain) {
  const wrap = document.createElement('div')
  wrap.className = 'space-y-3'

  // Expiry selector
  const toolbar = document.createElement('div')
  toolbar.className = 'flex items-center gap-3 flex-wrap'
  const label = document.createElement('span')
  label.className = 'text-xs font-semibold uppercase tracking-wider text-zinc-500'
  label.textContent = 'Expiry'
  const select = document.createElement('select')
  select.className = 'bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500'
  for (const exp of chain.expirations) {
    const opt = document.createElement('option')
    opt.value = String(exp)
    opt.textContent = formatExpiry(exp)
    if (exp === chain.selectedExpiry) opt.selected = true
    select.appendChild(opt)
  }
  const underPrice = document.createElement('span')
  underPrice.className = 'text-xs text-zinc-500 ml-auto'
  underPrice.textContent = chain.underlying.price != null
    ? `Underlying: ${fmtPrice(chain.underlying.price)}`
    : ''

  toolbar.append(label, select, underPrice)
  wrap.appendChild(toolbar)

  // Tables
  const tables = document.createElement('div')
  tables.className = 'grid grid-cols-1 xl:grid-cols-2 gap-3'
  const callsCard = buildContractsTable('Calls', chain.calls, chain.underlying.price)
  const putsCard  = buildContractsTable('Puts',  chain.puts,  chain.underlying.price)
  tables.append(callsCard, putsCard)
  wrap.appendChild(tables)

  select.addEventListener('change', async () => {
    tables.classList.add('opacity-50')
    const expiry = Number(select.value)
    const updated = await fetchOptionsChain(symbol, expiry)
    tables.classList.remove('opacity-50')
    if (!updated) return
    const newCalls = buildContractsTable('Calls', updated.calls, updated.underlying.price)
    const newPuts  = buildContractsTable('Puts',  updated.puts,  updated.underlying.price)
    tables.textContent = ''
    tables.append(newCalls, newPuts)
  })

  return wrap
}

function buildContractsTable(title, contracts, underlyingPrice) {
  const card = document.createElement('div')
  card.className = 'card overflow-hidden'

  const head = document.createElement('div')
  head.className = 'px-3 py-2 border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-300'
  head.textContent = `${title} (${contracts.length})`
  card.appendChild(head)

  if (!contracts.length) {
    const empty = document.createElement('div')
    empty.className = 'p-6 text-center text-zinc-500 text-xs'
    empty.textContent = 'No contracts.'
    card.appendChild(empty)
    return card
  }

  const scroll = document.createElement('div')
  scroll.className = 'max-h-[520px] overflow-y-auto'

  const table = document.createElement('table')
  table.className = 'w-full text-xs'

  const thead = document.createElement('thead')
  thead.className = 'sticky top-0 bg-zinc-900 z-10'
  const headRow = document.createElement('tr')
  headRow.className = 'border-b border-zinc-800'
  for (const col of CONTRACT_COLUMNS) {
    const th = document.createElement('th')
    th.className = `px-2 py-1.5 text-${col.align} text-[10px] font-semibold uppercase tracking-wider text-zinc-500`
    th.textContent = col.label
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  const atm = atmIndex(contracts, underlyingPrice)
  contracts.forEach((c, i) => {
    const tr = document.createElement('tr')
    tr.className = 'border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/30 transition-colors'
    if (i === atm) tr.classList.add('bg-amber-500/10')
    if (c.inTheMoney) tr.classList.add('text-zinc-200')
    else tr.classList.add('text-zinc-400')

    for (const col of CONTRACT_COLUMNS) {
      const td = document.createElement('td')
      const raw = c[col.key]
      const cls = [`px-2 py-1 text-${col.align}`]
      if (col.mono) cls.push('font-mono')
      if (col.color) cls.push(changeColor(raw))
      td.className = cls.join(' ')
      td.textContent = col.fmt(raw)
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)
  scroll.appendChild(table)
  card.appendChild(scroll)
  return card
}

function formatExpiry(ts) {
  const d = new Date(ts * 1000)
  const now = new Date()
  const days = Math.round((d - now) / 86400000)
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return days >= 0 ? `${dateStr}  (${days}d)` : dateStr
}
