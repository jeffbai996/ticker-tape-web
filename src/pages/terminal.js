// Terminal mode: Bloomberg-style command interface with command + chat modes.
// Mirrors the exact alias map from ticker-tape TUI.

import { go } from '../router.js'
import { BLOOMBERG_SHORTCUTS } from '../layout/command-palette.js'
import { loadQuotes, loadTechnicals, loadEarnings, loadMarket, loadNews,
         loadCommodities, loadEcon, loadLookup, loadMeta } from '../lib/data.js'
import { loadAlerts, addAlert, removeAlert } from '../lib/alerts.js'
import { addToWatchlist, removeFromWatchlist, getWatchlistFilter } from '../lib/watchlist.js'
import { loadMemories, saveMemory, removeMemory } from '../chat/memory.js'
import { loadEntries, addEntry, removeEntry, searchEntries } from '../lib/journal.js'
import { streamChat, getModelList } from '../chat/providers.js'
import * as fmt from '../lib/terminal-fmt.js'

let historyEl = null
let inputEl = null
let promptEl = null
const cmdHistory = []
let historyIdx = -1

// ── Mode state ───────────────────────────────────────
let mode = 'command' // 'command' | 'chat'
let chatModel = 'haiku'
let chatMessages = []
let streaming = false

// ── Output buffer persistence ────────────────────────
const OUTPUT_KEY = 'terminal_buffer'
const MAX_BUFFER = 200
let outputBuffer = []

function saveBuffer() {
  try {
    sessionStorage.setItem(OUTPUT_KEY, JSON.stringify(outputBuffer.slice(-MAX_BUFFER)))
  } catch { /* ignore quota errors */ }
}

function loadBuffer() {
  try {
    const raw = sessionStorage.getItem(OUTPUT_KEY)
    outputBuffer = raw ? JSON.parse(raw) : []
  } catch {
    outputBuffer = []
  }
}

// ── Alias map (TUI command_bar.py) ───────────────────
const ALIASES = {
  t: 'thesis', thesis: 'thesis',
  m: 'market', market: 'market',
  s: 'sectors', sectors: 'sectors',
  e: 'earnings', er: 'earnings', earnings: 'earnings',
  ta: 'technicals',
  n: 'news', news: 'news',
  h: 'help', help: 'help', '?': 'help',
  q: 'quit', quit: 'quit', exit: 'quit',
  w: 'watch', watch: 'watch',
  uw: 'unwatch', unwatch: 'unwatch',
  wl: 'watchlist', watchlist: 'watchlist',
  chart: 'chart', c: 'chart',
  vs: 'comparison',
  i: 'intraday', intra: 'intraday',
  impact: 'impact', ei: 'impact',
  chat: 'chat', ai: 'chat', resume: 'chat',
  clear: 'clear', cls: 'clear',
  hm: 'heatmap', heatmap: 'heatmap',
  cal: 'calendar', calendar: 'calendar',
  commodities: 'commodities', commod: 'commodities', cm: 'commodities',
  insider: 'insider',
  options: 'options', opt: 'options', chain: 'options',
  corr: 'correlation', correlation: 'correlation',
  div: 'dividends', dividend: 'dividends',
  short: 'short', si: 'short',
  rating: 'ratings', ratings: 'ratings', pt: 'ratings',
  lookup: 'lookup', l: 'lookup',
  j: 'journal', journal: 'journal',
  memory: 'memory', mem: 'memory',
  alert: 'alert', al: 'alert',
  pos: 'positions', positions: 'positions',
  acct: 'account', account: 'account',
  pnl: 'pnl',
  trades: 'trades',
  margin: 'margin',
  whatif: 'whatif',
  model: 'model',
  copy: 'copy',
}

// Commands rendered inline (not navigation)
const INLINE_COMMANDS = new Set([
  'thesis', 'market', 'technicals', 'news', 'earnings', 'lookup',
  'calendar', 'commodities', 'watchlist', 'alert', 'memory', 'journal',
  'help', 'chat', 'clear', 'quit', 'watch', 'unwatch', 'model', 'copy',
])

// Commands that navigate away
const NAV_COMMANDS = new Set([
  'chart', 'heatmap', 'correlation', 'comparison', 'sectors',
  'intraday', 'impact', 'insider', 'options', 'dividends', 'short', 'ratings',
])

// IBKR commands
const IBKR_COMMANDS = new Set([
  'positions', 'account', 'pnl', 'trades', 'margin', 'whatif',
])

// Commands needing a symbol
const NEEDS_SYMBOL = new Set([
  'technicals', 'chart', 'intraday', 'insider', 'options',
  'dividends', 'short', 'ratings',
])

// ── Render ───────────────────────────────────────────
export async function render(el) {
  const container = document.createElement('div')
  container.className = 'flex flex-col h-full'
  container.style.backgroundColor = '#0a0a0a'

  // Header bar
  const header = document.createElement('div')
  header.className = 'px-4 py-2 border-b border-zinc-800 flex items-center gap-2'
  header.style.borderColor = '#222'
  const title = document.createElement('span')
  title.className = 'font-mono text-sm font-semibold'
  title.style.color = '#ffc800'
  title.textContent = 'ticker-tape terminal v2.0'
  const hint = document.createElement('span')
  hint.className = 'text-xs ml-auto'
  hint.style.color = '#555'
  hint.textContent = 'Type help | Esc to exit | chat for AI mode'
  header.append(title, hint)

  // Output area
  historyEl = document.createElement('div')
  historyEl.className = 'flex-1 overflow-y-auto p-4 font-mono text-sm space-y-0'
  historyEl.style.lineHeight = '1.4'

  // Restore previous session or show welcome
  loadBuffer()
  if (outputBuffer.length) {
    for (const entry of outputBuffer) {
      const line = document.createElement('div')
      line.style.color = entry.color || '#e0e0e0'
      line.style.whiteSpace = 'pre-wrap'
      line.style.fontFamily = '"JetBrains Mono", monospace'
      line.style.fontSize = '13px'
      line.textContent = entry.text
      historyEl.appendChild(line)
    }
    appendOutput('')
    appendOutput('── session restored ──', '#555')
    appendOutput('')
  } else {
    appendOutput('ticker-tape terminal v2.0', '#ffc800')
    appendOutput('Command mode. Type help for commands, chat for AI mode.', '#888')
    appendOutput('─'.repeat(50), '#333')
    appendOutput('')
  }

  // Input area
  const inputRow = document.createElement('div')
  inputRow.className = 'flex items-center gap-2 px-4 py-3 border-t'
  inputRow.style.borderColor = '#222'
  inputRow.style.backgroundColor = '#111'

  promptEl = document.createElement('span')
  promptEl.className = 'font-mono text-sm shrink-0'
  promptEl.style.color = '#ffc800'
  promptEl.textContent = '>'

  inputEl = document.createElement('input')
  inputEl.type = 'text'
  inputEl.className = 'flex-1 bg-transparent font-mono text-sm focus:outline-none uppercase'
  inputEl.style.color = '#e0e0e0'
  inputEl.style.caretColor = '#ffc800'
  inputEl.placeholder = 'COMMAND'
  inputEl.spellcheck = false
  inputEl.autocomplete = 'off'
  inputEl.addEventListener('keydown', handleKey)

  inputRow.append(promptEl, inputEl)
  container.append(header, historyEl, inputRow)

  el.textContent = ''
  el.appendChild(container)
  inputEl.focus()
}

// ── Output helpers ───────────────────────────────────
function appendOutput(text, color = '#e0e0e0') {
  const line = document.createElement('div')
  line.style.color = color
  line.style.whiteSpace = 'pre-wrap'
  line.style.fontFamily = '"JetBrains Mono", monospace'
  line.style.fontSize = '13px'
  line.textContent = text
  historyEl.appendChild(line)
  historyEl.scrollTop = historyEl.scrollHeight

  // Persist to session buffer
  outputBuffer.push({ text, color })
  if (outputBuffer.length > MAX_BUFFER) outputBuffer = outputBuffer.slice(-MAX_BUFFER)
  saveBuffer()
}

function appendLines(lines) {
  for (const l of lines) appendOutput(l.text, l.color)
}

function updatePrompt() {
  if (mode === 'chat') {
    const models = getModelList()
    const m = models.find(m => m.key === chatModel)
    promptEl.textContent = `${m?.label || chatModel}>`
    promptEl.style.color = '#00c8ff'
    inputEl.style.color = '#e0e0e0'
    inputEl.placeholder = 'Ask anything...'
    inputEl.style.textTransform = 'none'
  } else {
    promptEl.textContent = '>'
    promptEl.style.color = '#ffc800'
    inputEl.style.color = '#e0e0e0'
    inputEl.placeholder = 'COMMAND'
    inputEl.style.textTransform = 'uppercase'
  }
}

// ── Key handling ─────────────────────────────────────
async function handleKey(e) {
  if (e.key === 'Enter') {
    const raw = inputEl.value.trim()
    inputEl.value = ''
    if (!raw) return
    if (streaming) return

    cmdHistory.unshift(raw)
    historyIdx = -1

    if (mode === 'chat') {
      await handleChatInput(raw)
    } else {
      appendOutput(`> ${raw}`, '#ffc800')
      await executeCommand(raw)
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (historyIdx < cmdHistory.length - 1) {
      historyIdx++
      inputEl.value = cmdHistory[historyIdx]
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (historyIdx > 0) {
      historyIdx--
      inputEl.value = cmdHistory[historyIdx]
    } else {
      historyIdx = -1
      inputEl.value = ''
    }
  } else if (e.key === 'Escape') {
    if (mode === 'chat') {
      mode = 'command'
      updatePrompt()
      appendOutput('Exited chat mode.', '#888')
    } else {
      go('dashboard')
    }
  }
}

// ── Command execution ────────────────────────────────
async function executeCommand(raw) {
  const parts = raw.toLowerCase().split(/\s+/)
  const cmd = parts[0]
  const arg = parts.slice(1).join(' ').toUpperCase() || null
  const argRaw = parts.slice(1).join(' ') || null

  // Resolve alias
  const aliased = ALIASES[cmd] || cmd

  // ── Clear ──
  if (aliased === 'clear') {
    historyEl.textContent = ''
    outputBuffer = []
    saveBuffer()
    return
  }

  // ── Quit ──
  if (aliased === 'quit') {
    go('dashboard')
    return
  }

  // ── Enter chat mode ──
  if (aliased === 'chat') {
    mode = 'chat'
    updatePrompt()
    appendOutput('')
    appendOutput('Entered chat mode. Type q to exit, model to switch models.', '#00c8ff')
    appendOutput('')
    return
  }

  // ── IBKR commands ──
  if (IBKR_COMMANDS.has(aliased)) {
    appendOutput('IBKR commands require live connection. Use ticker-tape TUI.', '#ffc800')
    return
  }

  // ── Help ──
  if (aliased === 'help') {
    showHelp()
    return
  }

  // ── Model (command mode) ──
  if (aliased === 'model') {
    handleModel(arg)
    return
  }

  // ── Copy ──
  if (aliased === 'copy') {
    const text = Array.from(historyEl.children).map(el => el.textContent).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      appendOutput('Terminal output copied to clipboard.', '#2ecc71')
    } catch {
      appendOutput('Failed to copy to clipboard.', '#ff3232')
    }
    return
  }

  // ── Inline data commands ──
  if (aliased === 'thesis') { await renderThesis(); return }
  if (aliased === 'market') { await renderMarket(); return }
  if (aliased === 'earnings') { await renderEarnings(); return }
  if (aliased === 'calendar') { await renderCalendar(); return }
  if (aliased === 'commodities') { await renderCommodities(); return }

  if (aliased === 'technicals') {
    if (!arg) { appendOutput('Usage: ta NVDA', '#ffc800'); return }
    await renderTechnicals(arg)
    return
  }

  if (aliased === 'lookup') {
    if (!arg) { appendOutput('Usage: lookup NVDA', '#ffc800'); return }
    await renderLookup(arg)
    return
  }

  if (aliased === 'news') {
    await renderNews(arg)
    return
  }

  // ── Watchlist ──
  if (aliased === 'watch') {
    if (!arg) { appendOutput('Usage: w NVDA', '#ffc800'); return }
    addToWatchlist(arg)
    appendOutput(`Added ${arg} to watchlist.`, '#2ecc71')
    return
  }
  if (aliased === 'unwatch') {
    if (!arg) { appendOutput('Usage: uw NVDA', '#ffc800'); return }
    removeFromWatchlist(arg)
    appendOutput(`Removed ${arg} from watchlist.`, '#2ecc71')
    return
  }
  if (aliased === 'watchlist') {
    const wl = getWatchlistFilter()
    appendLines(fmt.fmtWatchlist(wl))
    return
  }

  // ── Alerts ──
  if (aliased === 'alert') {
    await handleAlert(argRaw)
    return
  }

  // ── Memory ──
  if (aliased === 'memory') {
    await handleMemory(argRaw)
    return
  }

  // ── Journal ──
  if (aliased === 'journal') {
    await handleJournal(argRaw)
    return
  }

  // ── Navigation commands ──
  if (NAV_COMMANDS.has(aliased)) {
    if (NEEDS_SYMBOL.has(aliased) && !arg) {
      appendOutput(`${cmd} requires a symbol. Usage: ${cmd} NVDA`, '#ffc800')
      return
    }
    go(aliased, arg)
    return
  }

  // ── Bloomberg shortcuts ──
  const bloomberg = BLOOMBERG_SHORTCUTS[cmd]
  if (bloomberg) {
    go(bloomberg, arg)
    return
  }

  // ── Bare symbol lookup ──
  if (/^[A-Z]{1,5}$/i.test(cmd) && !aliased) {
    await renderLookup(cmd.toUpperCase())
    return
  }
  // Also catch symbols not in alias map
  if (/^[A-Z]{1,5}$/i.test(raw.split(/\s+/)[0])) {
    const sym = raw.split(/\s+/)[0].toUpperCase()
    if (!ALIASES[cmd]) {
      await renderLookup(sym)
      return
    }
  }

  appendOutput(`Unknown command: ${cmd}. Type help for commands.`, '#ff3232')
}

// ── Inline data renderers ────────────────────────────
async function renderThesis() {
  appendOutput('Loading thesis...', '#888')
  try {
    const [quotes, technicals, earnings, meta] = await Promise.all([
      loadQuotes(), loadTechnicals(), loadEarnings(), loadMeta()
    ])
    // Enrich quotes with names from meta
    if (quotes && meta?.names) {
      for (const q of quotes) {
        if (!q.name && meta.names[q.symbol]) q.name = meta.names[q.symbol]
      }
    }
    removeLastLine()
    appendLines(fmt.fmtThesis(quotes, technicals, earnings))
  } catch (err) {
    removeLastLine()
    appendOutput(`Error: ${err.message}`, '#ff3232')
  }
}

async function renderMarket() {
  appendOutput('Loading market...', '#888')
  try {
    const market = await loadMarket()
    removeLastLine()
    appendLines(fmt.fmtMarket(market))
  } catch (err) {
    removeLastLine()
    appendOutput(`Error: ${err.message}`, '#ff3232')
  }
}

async function renderTechnicals(symbol) {
  appendOutput(`Loading technicals for ${symbol}...`, '#888')
  try {
    const technicals = await loadTechnicals()
    removeLastLine()
    const ta = technicals?.[symbol]
    appendLines(fmt.fmtTechnicals(ta, symbol))
  } catch (err) {
    removeLastLine()
    appendOutput(`Error: ${err.message}`, '#ff3232')
  }
}

async function renderLookup(symbol) {
  appendOutput(`Loading ${symbol}...`, '#888')
  try {
    const [data, meta] = await Promise.all([loadLookup(symbol), loadMeta()])
    removeLastLine()
    if (!data) {
      appendOutput(`No data found for ${symbol}.`, '#888')
      return
    }
    const name = meta?.names?.[symbol] || data.longName || data.shortName || symbol
    appendLines(fmt.fmtLookup(data, symbol, name))
  } catch (err) {
    removeLastLine()
    appendOutput(`Error: ${err.message}`, '#ff3232')
  }
}

async function renderNews(symbol) {
  appendOutput('Loading news...', '#888')
  try {
    const news = await loadNews()
    removeLastLine()
    appendLines(fmt.fmtNews(news, symbol))
  } catch (err) {
    removeLastLine()
    appendOutput(`Error: ${err.message}`, '#ff3232')
  }
}

async function renderEarnings() {
  appendOutput('Loading earnings...', '#888')
  try {
    const earnings = await loadEarnings()
    removeLastLine()
    appendLines(fmt.fmtEarnings(earnings))
  } catch (err) {
    removeLastLine()
    appendOutput(`Error: ${err.message}`, '#ff3232')
  }
}

async function renderCalendar() {
  appendOutput('Loading calendar...', '#888')
  try {
    const econ = await loadEcon()
    removeLastLine()
    appendLines(fmt.fmtCalendar(econ))
  } catch (err) {
    removeLastLine()
    appendOutput(`Error: ${err.message}`, '#ff3232')
  }
}

async function renderCommodities() {
  appendOutput('Loading commodities...', '#888')
  try {
    const commodities = await loadCommodities()
    removeLastLine()
    appendLines(fmt.fmtCommodities(commodities))
  } catch (err) {
    removeLastLine()
    appendOutput(`Error: ${err.message}`, '#ff3232')
  }
}

function removeLastLine() {
  if (historyEl.lastChild) historyEl.removeChild(historyEl.lastChild)
}

// ── Alert handler ────────────────────────────────────
async function handleAlert(argRaw) {
  if (!argRaw) {
    appendLines(fmt.fmtAlerts(loadAlerts()))
    return
  }
  const parts = argRaw.split(/\s+/)
  if (parts[0]?.toLowerCase() === 'rm' || parts[0]?.toLowerCase() === 'del') {
    const id = parseInt(parts[1])
    if (isNaN(id)) { appendOutput('Usage: alert rm 1', '#ffc800'); return }
    removeAlert(id)
    appendOutput(`Removed alert #${id}.`, '#2ecc71')
    return
  }
  // alert NVDA > 200
  if (parts.length >= 3) {
    const sym = parts[0].toUpperCase()
    const op = parts[1]
    const val = parseFloat(parts[2])
    if (!['>', '<', '='].includes(op) || isNaN(val)) {
      appendOutput('Usage: alert NVDA > 200', '#ffc800')
      return
    }
    addAlert(sym, op, val)
    appendOutput(`Alert set: ${sym} ${op} ${val}`, '#2ecc71')
    return
  }
  appendOutput('Usage: alert NVDA > 200 | alert rm 1', '#ffc800')
}

// ── Memory handler ───────────────────────────────────
async function handleMemory(argRaw) {
  if (!argRaw) {
    appendLines(fmt.fmtMemories(loadMemories()))
    return
  }
  const parts = argRaw.split(/\s+/)
  const sub = parts[0]?.toLowerCase()
  if (sub === 'save' || sub === 'add') {
    const text = parts.slice(1).join(' ')
    if (!text) { appendOutput('Usage: memory save <text>', '#ffc800'); return }
    saveMemory(text)
    appendOutput(`Memory saved.`, '#2ecc71')
    return
  }
  if (sub === 'rm' || sub === 'del') {
    const id = parseInt(parts[1])
    if (isNaN(id)) { appendOutput('Usage: memory rm 1', '#ffc800'); return }
    removeMemory(id)
    appendOutput(`Removed memory #${id}.`, '#2ecc71')
    return
  }
  // Default: show memories
  appendLines(fmt.fmtMemories(loadMemories()))
}

// ── Journal handler ──────────────────────────────────
async function handleJournal(argRaw) {
  if (!argRaw) {
    appendLines(fmt.fmtJournal(loadEntries()))
    return
  }
  const parts = argRaw.split(/\s+/)
  const sub = parts[0]?.toLowerCase()
  if (sub === 'rm' || sub === 'del') {
    const id = parseInt(parts[1])
    if (isNaN(id)) { appendOutput('Usage: journal rm 1', '#ffc800'); return }
    removeEntry(id)
    appendOutput(`Removed entry #${id}.`, '#2ecc71')
    return
  }
  if (sub === 'search' || sub === 'find') {
    const term = parts.slice(1).join(' ')
    if (!term) { appendOutput('Usage: journal search <term>', '#ffc800'); return }
    const results = searchEntries(term)
    appendLines(fmt.fmtJournal(results))
    return
  }
  // Default: add entry
  addEntry(argRaw)
  appendOutput('Journal entry added.', '#2ecc71')
}

// ── Model handler ────────────────────────────────────
function handleModel(arg) {
  const models = getModelList()
  if (!arg) {
    appendOutput('Available models:', '#ffc800')
    for (const m of models) {
      const current = m.key === chatModel ? ' *' : ''
      const avail = m.available ? '' : ' (no key)'
      appendOutput(`  ${m.key.padEnd(12)} ${m.label}${current}${avail}`, m.available ? '#e0e0e0' : '#888')
    }
    return
  }
  const key = arg.toLowerCase()
  const found = models.find(m => m.key === key)
  if (!found) {
    appendOutput(`Unknown model: ${key}`, '#ff3232')
    return
  }
  if (!found.available) {
    appendOutput(`No API key for ${found.provider}. Set it in Settings.`, '#ffc800')
    return
  }
  chatModel = key
  updatePrompt()
  appendOutput(`Model switched to ${found.label}.`, '#2ecc71')
}

// ── Chat mode ────────────────────────────────────────
async function handleChatInput(raw) {
  const lower = raw.toLowerCase().trim()

  // ── Chat reserved words ──
  if (lower === 'q' || lower === 'quit' || lower === 'exit') {
    mode = 'command'
    updatePrompt()
    appendOutput('Exited chat mode.', '#888')
    return
  }

  if (lower === 'help' || lower === '?') {
    showChatHelp()
    return
  }

  if (lower === 'model' || lower.startsWith('model ')) {
    const arg = lower === 'model' ? null : raw.slice(6).trim().toUpperCase()
    handleModel(arg)
    return
  }

  if (lower === 'memory' || lower === 'mem' || lower.startsWith('memory ') || lower.startsWith('mem ')) {
    const argRaw = lower.startsWith('mem ') ? raw.slice(4) : lower.startsWith('memory ') ? raw.slice(7) : null
    await handleMemory(argRaw)
    return
  }

  if (lower === 'journal' || lower === 'j' || lower.startsWith('journal ') || lower.startsWith('j ')) {
    const argRaw = lower.startsWith('j ') ? raw.slice(2) : lower.startsWith('journal ') ? raw.slice(8) : null
    await handleJournal(argRaw)
    return
  }

  if (lower === 'history' || lower === 'hist') {
    showChatHistory()
    return
  }

  if (lower === 'clear' || lower === 'cls') {
    historyEl.textContent = ''
    return
  }

  // ── Slash commands (fetch + inject context) ──
  if (raw.startsWith('/')) {
    await handleSlashCommand(raw)
    return
  }

  // ── Regular chat message ──
  appendOutput(`Q: ${raw}`, '#00c8ff')
  appendOutput('')

  chatMessages.push({ role: 'user', content: raw })

  // Build system prompt with memories
  const memories = loadMemories()
  let system = 'You are a financial analysis assistant in a terminal interface. Be concise and direct. Use plain text formatting.'
  if (memories.length) {
    system += '\n\nUser memories:\n' + memories.map(m => `- ${m.text}`).join('\n')
  }

  streaming = true
  let responseText = ''
  const responseLine = document.createElement('div')
  responseLine.style.color = '#e0e0e0'
  responseLine.style.whiteSpace = 'pre-wrap'
  responseLine.style.fontFamily = '"JetBrains Mono", monospace'
  responseLine.style.fontSize = '13px'
  responseLine.textContent = 'A: '
  historyEl.appendChild(responseLine)

  try {
    for await (const chunk of streamChat(chatModel, chatMessages, system)) {
      if (chunk.type === 'text') {
        responseText += chunk.content
        // Strip markdown HTML for terminal display
        responseLine.textContent = 'A: ' + stripMarkdown(responseText)
        historyEl.scrollTop = historyEl.scrollHeight
      } else if (chunk.type === 'thinking') {
        // Skip thinking tokens in terminal display
      } else if (chunk.type === 'error') {
        appendOutput(`Error: ${chunk.content}`, '#ff3232')
      }
    }
  } catch (err) {
    appendOutput(`Stream error: ${err.message}`, '#ff3232')
  }

  if (responseText) {
    chatMessages.push({ role: 'assistant', content: responseText })
    // Keep last 20 messages to avoid context blowup
    if (chatMessages.length > 40) chatMessages = chatMessages.slice(-20)
  }

  streaming = false
  appendOutput('')
}

// ── Slash commands ───────────────────────────────────
async function handleSlashCommand(raw) {
  const parts = raw.slice(1).split(/\s+/)
  const cmd = parts[0]?.toLowerCase()
  const arg = parts[1]?.toUpperCase()

  if (cmd === 'ta' && arg) {
    appendOutput(`Fetching technicals for ${arg}...`, '#888')
    try {
      const technicals = await loadTechnicals()
      removeLastLine()
      const ta = technicals?.[arg]
      const taLines = fmt.fmtTechnicals(ta, arg)
      appendLines(taLines)
      // Inject as context
      const contextText = taLines.map(l => l.text).join('\n')
      chatMessages.push({
        role: 'user',
        content: `[Technical analysis data for ${arg}]:\n${contextText}\n\nAnalyze the above technicals.`
      })
    } catch (err) {
      removeLastLine()
      appendOutput(`Error: ${err.message}`, '#ff3232')
    }
    return
  }

  if (cmd === 'news' && arg) {
    appendOutput(`Fetching news for ${arg}...`, '#888')
    try {
      const news = await loadNews()
      removeLastLine()
      const newsLines = fmt.fmtNews(news, arg)
      appendLines(newsLines)
      const contextText = newsLines.map(l => l.text).join('\n')
      chatMessages.push({
        role: 'user',
        content: `[Recent news for ${arg}]:\n${contextText}\n\nSummarize the key themes.`
      })
    } catch (err) {
      removeLastLine()
      appendOutput(`Error: ${err.message}`, '#ff3232')
    }
    return
  }

  // /SYMBOL → lookup
  if (/^[A-Z]{1,5}$/i.test(cmd)) {
    const sym = cmd.toUpperCase()
    appendOutput(`Fetching ${sym}...`, '#888')
    try {
      const [data, meta] = await Promise.all([loadLookup(sym), loadMeta()])
      removeLastLine()
      if (!data) {
        appendOutput(`No data for ${sym}.`, '#888')
        return
      }
      const name = meta?.names?.[sym] || data.longName || sym
      const lookupLines = fmt.fmtLookup(data, sym, name)
      appendLines(lookupLines)
      const contextText = lookupLines.map(l => l.text).join('\n')
      chatMessages.push({
        role: 'user',
        content: `[Fundamental data for ${sym}]:\n${contextText}\n\nAnalyze the above fundamentals.`
      })
    } catch (err) {
      removeLastLine()
      appendOutput(`Error: ${err.message}`, '#ff3232')
    }
    return
  }

  appendOutput(`Unknown slash command: /${cmd}`, '#ff3232')
}

// ── Chat history display ─────────────────────────────
function showChatHistory() {
  if (!chatMessages.length) {
    appendOutput('No chat history.', '#888')
    return
  }
  appendOutput('Chat History (last 10)', '#ffc800')
  appendOutput('')
  const recent = chatMessages.slice(-20) // 10 exchanges = 20 messages
  for (const msg of recent) {
    const prefix = msg.role === 'user' ? 'Q:' : 'A:'
    const color = msg.role === 'user' ? '#00c8ff' : '#e0e0e0'
    const text = msg.content.length > 200
      ? msg.content.slice(0, 200) + '...'
      : msg.content
    appendOutput(`${prefix} ${text}`, color)
    appendOutput('')
  }
}

// ── Strip markdown to plain text ─────────────────────
function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, match => {
      const inner = match.replace(/```\w*\n?/, '').replace(/\n?```$/, '')
      return inner
    })
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s+/gm, '  ')
    .replace(/^---$/gm, '─'.repeat(40))
    .replace(/^[*-]\s+/gm, '  - ')
    .replace(/^\d+\.\s+/gm, (m) => `  ${m}`)
}

// ── Help screens ─────────────────────────────────────
function showHelp() {
  const sections = [
    { title: 'INLINE COMMANDS', items: [
      ['t, thesis',        'Thesis overview (quotes + TA + earnings)'],
      ['m, market',        'Market overview (indices, rates, FX)'],
      ['ta SYMBOL',        'Technicals for symbol'],
      ['n, news [SYM]',    'News headlines (optional symbol filter)'],
      ['e, er',            'Earnings calendar'],
      ['cal, calendar',    'Economic calendar (FOMC, CPI, NFP)'],
      ['cm, commodities',  'Commodity prices'],
      ['l, lookup SYM',    'Fundamentals deep dive'],
      ['NVDA',             'Type any symbol for quick lookup'],
    ]},
    { title: 'NAVIGATION', items: [
      ['chart SYM',        'Candlestick chart (opens page)'],
      ['hm, heatmap',      'Performance heatmap'],
      ['corr',             'Correlation matrix'],
      ['vs',               'Multi-symbol comparison'],
      ['s, sectors',       'Sector performance'],
      ['i SYM',            'Intraday chart'],
    ]},
    { title: 'DATA MANAGEMENT', items: [
      ['w SYM / uw SYM',   'Add/remove from watchlist'],
      ['wl',               'Show watchlist'],
      ['alert SYM > 200',  'Set price alert'],
      ['alert rm 1',       'Remove alert by ID'],
      ['j, journal',       'Show journal | journal <text> to add'],
      ['mem, memory',      'Show memories | memory save <text>'],
    ]},
    { title: 'AI CHAT', items: [
      ['chat, ai',         'Enter chat mode'],
      ['model',            'List available AI models'],
      ['model KEY',        'Switch AI model'],
    ]},
    { title: 'TERMINAL', items: [
      ['clear, cls',       'Clear terminal output'],
      ['copy',             'Copy terminal output to clipboard'],
      ['q, quit, exit',    'Return to dashboard'],
      ['Esc',              'Exit terminal (or exit chat mode)'],
    ]},
  ]

  appendOutput('')
  for (const section of sections) {
    appendOutput(section.title, '#ffc800')
    for (const [cmd, desc] of section.items) {
      appendOutput(`  ${cmd.padEnd(20)} ${desc}`, '#e0e0e0')
    }
    appendOutput('')
  }
}

function showChatHelp() {
  const items = [
    { title: 'CHAT MODE', items: [
      ['<text>',           'Send message to AI'],
      ['model',            'List available models'],
      ['model KEY',        'Switch model (e.g. model sonnet)'],
      ['history, hist',    'Show last 10 exchanges'],
      ['memory save <x>',  'Save a memory for AI context'],
      ['journal <text>',   'Add journal entry'],
    ]},
    { title: 'SLASH COMMANDS (fetch + inject as AI context)', items: [
      ['/ta SYM',          'Fetch technicals, show + inject'],
      ['/news SYM',        'Fetch news, show + inject'],
      ['/SYM',             'Fetch lookup, show + inject'],
    ]},
    { title: 'EXIT', items: [
      ['q, quit, exit',    'Return to command mode'],
      ['Esc',              'Return to command mode'],
      ['clear, cls',       'Clear terminal'],
    ]},
  ]

  appendOutput('')
  for (const section of items) {
    appendOutput(section.title, '#00c8ff')
    for (const [cmd, desc] of section.items) {
      appendOutput(`  ${cmd.padEnd(20)} ${desc}`, '#e0e0e0')
    }
    appendOutput('')
  }
}
