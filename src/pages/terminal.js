// Terminal mode: Bloomberg-style command interface.
// Type commands directly like a Bloomberg terminal.

import { go } from '../router.js'
import { BLOOMBERG_SHORTCUTS } from '../layout/command-palette.js'
import { loadMeta } from '../lib/data.js'

let historyEl = null
let inputEl = null
const cmdHistory = []
let historyIdx = -1

export async function render(el) {
  const container = document.createElement('div')
  container.className = 'flex flex-col h-full bg-zinc-950'

  // Terminal header
  const header = document.createElement('div')
  header.className = 'px-4 py-2 border-b border-zinc-800 flex items-center gap-2'
  const title = document.createElement('span')
  title.className = 'font-mono text-sm text-amber-400 font-semibold'
  title.textContent = 'ticker-tape terminal'
  const hint = document.createElement('span')
  hint.className = 'text-xs text-zinc-600 ml-auto'
  hint.textContent = 'Type a command + Enter | help for commands | Esc to exit'
  header.append(title, hint)

  // Output area
  historyEl = document.createElement('div')
  historyEl.className = 'flex-1 overflow-y-auto p-4 font-mono text-sm space-y-1'

  // Welcome
  appendOutput('ticker-tape terminal v2.0', 'text-amber-400')
  appendOutput('Type commands to navigate. Bloomberg shortcuts supported.', 'text-zinc-500')
  appendOutput('─────────────────────────────────────────', 'text-zinc-800')
  appendOutput('')

  // Input area
  const inputRow = document.createElement('div')
  inputRow.className = 'flex items-center gap-2 px-4 py-3 border-t border-zinc-800 bg-zinc-900'

  const prompt = document.createElement('span')
  prompt.className = 'font-mono text-amber-400 text-sm shrink-0'
  prompt.textContent = '>'

  inputEl = document.createElement('input')
  inputEl.type = 'text'
  inputEl.className = 'flex-1 bg-transparent font-mono text-sm text-zinc-100 focus:outline-none uppercase placeholder-zinc-600'
  inputEl.placeholder = 'COMMAND'
  inputEl.spellcheck = false
  inputEl.autocomplete = 'off'
  inputEl.addEventListener('keydown', handleKey)

  inputRow.append(prompt, inputEl)
  container.append(header, historyEl, inputRow)

  el.textContent = ''
  el.appendChild(container)
  inputEl.focus()
}

function appendOutput(text, className = 'text-zinc-300') {
  const line = document.createElement('div')
  line.className = className
  line.textContent = text
  historyEl.appendChild(line)
  historyEl.scrollTop = historyEl.scrollHeight
}

async function handleKey(e) {
  if (e.key === 'Enter') {
    const raw = inputEl.value.trim()
    inputEl.value = ''
    if (!raw) return

    cmdHistory.unshift(raw)
    historyIdx = -1

    appendOutput(`> ${raw}`, 'text-amber-400/60')
    await executeCommand(raw)

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
    go('dashboard')
  }
}

async function executeCommand(raw) {
  const parts = raw.toLowerCase().split(/\s+/)
  const cmd = parts[0]
  const arg = parts.slice(1).join(' ').toUpperCase() || null

  // Special commands
  if (cmd === 'help' || cmd === '?') {
    showHelp()
    return
  }
  if (cmd === 'clear' || cmd === 'cls') {
    historyEl.textContent = ''
    return
  }
  if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') {
    go('dashboard')
    return
  }

  // Check Bloomberg shortcuts
  const resolved = BLOOMBERG_SHORTCUTS[cmd]
  if (resolved) {
    appendOutput(`→ ${resolved}${arg ? '/' + arg : ''}`, 'text-zinc-500')
    go(resolved, arg)
    return
  }

  // Check if it's a direct page name
  const pageNames = ['dashboard', 'market', 'sectors', 'earnings', 'heatmap', 'commodities',
    'calendar', 'correlation', 'comparison', 'valuation', 'news',
    'lookup', 'chart', 'technicals', 'intraday', 'dividends', 'short', 'ratings',
    'insider', 'impact', 'options', 'terminal']
  if (pageNames.includes(cmd)) {
    appendOutput(`→ ${cmd}${arg ? '/' + arg : ''}`, 'text-zinc-500')
    go(cmd, arg)
    return
  }

  // Short aliases
  const aliases = { t: 'dashboard', m: 'market', s: 'sectors', e: 'earnings',
    hm: 'heatmap', com: 'commodities', cal: 'calendar', cor: 'correlation',
    vs: 'comparison', val: 'valuation', n: 'news', l: 'lookup', c: 'chart',
    ta: 'technicals', id: 'intraday', div: 'dividends', si: 'short',
    rat: 'ratings', ins: 'insider', imp: 'impact', opt: 'options' }
  if (aliases[cmd]) {
    appendOutput(`→ ${aliases[cmd]}${arg ? '/' + arg : ''}`, 'text-zinc-500')
    go(aliases[cmd], arg)
    return
  }

  // Check if it looks like a symbol (1-5 uppercase)
  if (/^[A-Z]{1,5}$/i.test(cmd)) {
    const meta = await loadMeta()
    const names = meta?.names || {}
    const sym = cmd.toUpperCase()
    if (names[sym]) {
      appendOutput(`→ lookup/${sym} (${names[sym]})`, 'text-zinc-500')
      go('lookup', sym)
      return
    }
  }

  appendOutput(`Unknown command: ${cmd}. Type 'help' for available commands.`, 'text-red-400')
}

function showHelp() {
  const lines = [
    '',
    'NAVIGATION',
    '  t, dashboard     Portfolio overview',
    '  m, market, WEI   Market overview / World Equity Indices',
    '  s, sectors       Sector ETF performance',
    '  e, earnings, EE  Earnings calendar',
    '  hm, heatmap      Watchlist heatmap',
    '  com, CMDX        Commodities / futures',
    '  cal, ECO         Economic calendar',
    '  cor, CORR        Correlation matrix',
    '  vs, COMP         Multi-symbol comparison',
    '  val, RVP         Valuation comparison',
    '  n, news, TOP     News headlines',
    '',
    'SYMBOL COMMANDS (append symbol)',
    '  l, FA, DES       Lookup / fundamentals     e.g. FA NVDA',
    '  c, GP            Chart                     e.g. GP AAPL',
    '  ta, TAV          Technicals                e.g. TAV MSFT',
    '  id, GIP          Intraday                  e.g. GIP GOOG',
    '  div, DVD         Dividends                 e.g. DVD AAPL',
    '  si               Short interest',
    '  rat, ANR          Analyst ratings',
    '  opt, OMON         Options chain',
    '',
    'TERMINAL',
    '  help, ?          Show this help',
    '  clear, cls       Clear terminal',
    '  exit, q          Return to dashboard',
    '  NVDA             Type any symbol to look it up',
    '',
  ]
  for (const line of lines) {
    const color = line.startsWith('  ') ? 'text-zinc-300' : 'text-amber-400 font-semibold'
    appendOutput(line, color)
  }
}
