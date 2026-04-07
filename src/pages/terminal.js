// Terminal mode: Bloomberg-style command interface.
// Mirrors the exact alias map from ticker-tape TUI (app.py/command_bar.py).

import { go } from '../router.js'
import { BLOOMBERG_SHORTCUTS } from '../layout/command-palette.js'

let historyEl = null
let inputEl = null
const cmdHistory = []
let historyIdx = -1

// Exact alias map from TUI command_bar.py
const ALIASES = {
  t: 'dashboard',
  m: 'market',
  s: 'sectors',
  e: 'earnings',
  er: 'earnings',
  ta: 'technicals',    // needs symbol
  n: 'news',
  h: 'help',
  '?': 'help',
  q: 'dashboard',      // exit terminal
  quit: 'dashboard',
  exit: 'dashboard',
  w: 'watch',
  uw: 'unwatch',
  wl: 'watchlist',
  c: 'compact',        // not applicable in web
  chart: 'chart',      // needs symbol
  vs: 'comparison',
  i: 'intraday',       // needs symbol
  intra: 'intraday',
  impact: 'impact',
  ei: 'impact',
  hm: 'heatmap',
  cal: 'calendar',
  calendar: 'calendar',
  commodities: 'commodities',
  commod: 'commodities',
  cm: 'commodities',
  insider: 'insider',  // needs symbol
  options: 'options',  // needs symbol
  opt: 'options',
  chain: 'options',
  corr: 'correlation',
  correlation: 'correlation',
  div: 'dividends',    // needs symbol
  dividend: 'dividends',
  short: 'short',      // needs symbol
  si: 'short',
  rating: 'ratings',   // needs symbol
  ratings: 'ratings',
  pt: 'ratings',
  lookup: 'lookup',    // needs symbol
  j: 'journal',
  journal: 'journal',
}

// Commands that need a symbol argument
const NEEDS_SYMBOL = new Set([
  'technicals', 'chart', 'intraday', 'insider', 'options',
  'dividends', 'short', 'ratings', 'lookup',
])

// IBKR-only commands
const IBKR_COMMANDS = new Set([
  'pos', 'positions', 'acct', 'account', 'pnl',
  'trades', 'margin', 'whatif',
])

// Commands handled locally (not navigation)
const LOCAL_COMMANDS = new Set([
  'help', 'watch', 'unwatch', 'watchlist', 'compact', 'journal',
])

// Page names that can be typed directly
const PAGE_NAMES = new Set([
  'dashboard', 'market', 'sectors', 'earnings', 'heatmap', 'commodities',
  'calendar', 'correlation', 'comparison', 'valuation', 'news',
  'lookup', 'chart', 'technicals', 'intraday', 'dividends', 'short', 'ratings',
  'insider', 'impact', 'options', 'terminal',
])

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
  appendOutput('ticker-tape terminal v2.1', 'text-amber-400')
  appendOutput('Type commands to navigate. TUI aliases + Bloomberg shortcuts supported.', 'text-zinc-500')
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

  // Clear terminal
  if (cmd === 'clear' || cmd === 'cls') {
    historyEl.textContent = ''
    return
  }

  // Chat/AI — show message
  if (cmd === 'chat' || cmd === 'ai') {
    appendOutput('Use the chat panel (toggle with sidebar button).', 'text-zinc-500')
    return
  }

  // IBKR commands — can't run in web
  if (IBKR_COMMANDS.has(cmd)) {
    appendOutput(`IBKR commands require live connection. Use ticker-tape TUI.`, 'text-yellow-500')
    return
  }

  // Check Bloomberg shortcuts first
  const bloomberg = BLOOMBERG_SHORTCUTS[cmd]
  if (bloomberg) {
    go(bloomberg, arg)
    return
  }

  // Check TUI alias map
  const aliased = ALIASES[cmd]
  if (aliased) {
    // Help
    if (aliased === 'help') {
      showHelp()
      return
    }
    // Exit variants (q, quit, exit → dashboard)
    if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
      go('dashboard')
      return
    }
    // Local commands that don't navigate
    if (LOCAL_COMMANDS.has(aliased)) {
      if (aliased === 'watch' || aliased === 'unwatch' || aliased === 'watchlist') {
        appendOutput(`Watchlist: use sidebar or command palette.`, 'text-zinc-500')
      } else if (aliased === 'compact') {
        appendOutput(`Compact mode not applicable in web.`, 'text-zinc-500')
      } else if (aliased === 'journal') {
        appendOutput(`Journal not yet available in web.`, 'text-zinc-500')
      }
      return
    }
    // Commands that need a symbol
    if (NEEDS_SYMBOL.has(aliased) && !arg) {
      appendOutput(`${cmd} requires a symbol. Usage: ${cmd} NVDA`, 'text-yellow-500')
      return
    }
    go(aliased, arg)
    return
  }

  // Direct page name
  if (PAGE_NAMES.has(cmd)) {
    if (NEEDS_SYMBOL.has(cmd) && !arg) {
      appendOutput(`${cmd} requires a symbol. Usage: ${cmd} NVDA`, 'text-yellow-500')
      return
    }
    go(cmd, arg)
    return
  }

  // Symbol lookup: 1-5 uppercase alpha
  if (/^[A-Z]{1,5}$/i.test(cmd)) {
    go('lookup', cmd.toUpperCase())
    return
  }

  appendOutput(`Unknown command: ${cmd}. Type 'help' for available commands.`, 'text-red-400')
}

function showHelp() {
  const lines = [
    '',
    'NAVIGATION',
    '  t              Dashboard / thesis overview',
    '  m, market      Market overview / World Equity Indices',
    '  s, sectors     Sector ETF performance',
    '  e, er          Earnings calendar',
    '  hm             Heatmap',
    '  cm, commod     Commodities / futures',
    '  cal            Economic calendar',
    '  corr           Correlation matrix',
    '  vs             Multi-symbol comparison',
    '  n              News headlines',
    '  impact, ei     Earnings impact',
    '',
    'SYMBOL COMMANDS (append symbol)',
    '  ta             Technicals              e.g. ta NVDA',
    '  chart          Chart                   e.g. chart AAPL',
    '  i, intra       Intraday                e.g. i GOOG',
    '  div            Dividends               e.g. div AAPL',
    '  si, short      Short interest           e.g. si TSLA',
    '  rating, pt     Analyst ratings          e.g. rating MSFT',
    '  insider        Insider transactions     e.g. insider NVDA',
    '  opt, options   Options chain            e.g. opt AAPL',
    '  lookup         Symbol lookup            e.g. lookup NVDA',
    '',
    'BLOOMBERG SHORTCUTS',
    '  WEI WCIX       Market          TOP NWS  News',
    '  EE ERN         Earnings        ECO ECOW Calendar',
    '  FA DES         Lookup          GP GPX   Chart',
    '  GIP            Intraday        TAV      Technicals',
    '  DVD            Dividends       ANR      Ratings',
    '  OMON           Options         CORR     Correlation',
    '  COMP           Comparison      RVP      Valuation',
    '  SECF           Sectors         IMAP     Heatmap',
    '  CMDX           Commodities     PORT     Dashboard',
    '',
    'WATCHLIST',
    '  w SYMBOL       Add to watchlist (use sidebar)',
    '  uw SYMBOL      Remove from watchlist',
    '  wl             Show watchlist',
    '',
    'IBKR (requires TUI)',
    '  pos            Positions',
    '  acct           Account summary',
    '  pnl            P&L breakdown',
    '  trades         Recent trades',
    '  margin         Margin details',
    '  whatif         What-if scenarios',
    '',
    'TERMINAL',
    '  h, ?           Show this help',
    '  clear, cls     Clear terminal',
    '  q, quit, exit  Return to dashboard',
    '  NVDA           Type any symbol to look it up',
    '',
  ]
  for (const line of lines) {
    const color = line.startsWith('  ') ? 'text-zinc-300' : 'text-amber-400 font-semibold'
    appendOutput(line, color)
  }
}
