// Tab completion for the `ticker>` line. It's a pseudo-GUI terminal, so it
// can do what a real shell does: complete verbs, complete symbols, and show
// the alternatives instead of making you remember the grammar.

// Every verb the parser answers to, including the aliases — a completion list
// that omits `uw` or `wi` teaches the wrong grammar.
export const COMMAND_WORDS = [
  'acct', 'ai', 'al', 'alert', 'alerts', 'an', 'asof', 'b', 'backtest',
  'brief', 'briefing', 'breakers', 'bt', 'bucket', 'cal', 'calendar', 'carry',
  'cat', 'catalyst', 'chain', 'chart', 'chat', 'clear', 'cls', 'cm', 'cockpit',
  'commod', 'commodities', 'compare', 'copy', 'corr', 'cost', 'cp', 'cx',
  'dash', 'detail', 'div', 'dividend', 'dividends', 'e', 'ei', 'er', 'exit',
  'fil', 'group', 'groups', 'grp', 'h', 'heatmap', 'help', 'hf', 'hm', 'hold',
  'i', 'ibkr', 'ins', 'intra', 'j', 'journal', 'jr', 'lang', 'm', 'margin',
  'market', 'markets', 'mem', 'memory', 'morning', 'movers', 'n', 'news',
  'nlv', 'opt', 'options', 'pnl', 'pos', 'prof', 'pt', 'q', 'quit', 'rating',
  'replay', 'resume', 'risk', 's', 'scr', 'screen', 'screening', 'sectors',
  'surprises', 't', 'ta', 'timeline', 'tl', 'today', 'trades', 'tt', 'tw',
  'unwatch', 'uw', 'vs', 'w', 'watch', 'whatif', 'wi', 'wire', 'workspace',
  'workspaces', 'ws',
]

const tokens = (line) => line.split(/\s+/)

/**
 * Candidate completions for the line's LAST token, each returned as the whole
 * line it would produce. First token completes against verbs + symbols; later
 * tokens are arguments, which in this grammar are always symbols.
 */
export function completions(line, symbols = []) {
  const parts = tokens(line)
  const word = parts[parts.length - 1]
  if (!word) return []
  const prefix = word.toLowerCase()
  const head = parts.slice(0, -1)

  const pool = head.length
    ? symbols
    : [...symbols, ...COMMAND_WORDS]

  return pool
    .filter((w) => w.toLowerCase().startsWith(prefix))
    .map((w) => [...head, w].join(' '))
}

const commonPrefix = (words) => {
  if (!words.length) return ''
  let out = words[0]
  for (const w of words.slice(1)) {
    let i = 0
    while (i < out.length && i < w.length
           && out[i].toLowerCase() === w[i].toLowerCase()) i += 1
    out = out.slice(0, i)
  }
  return out
}

/**
 * What Tab should put in the box: the single match (plus a space, since the
 * next thing is always another token), or the longest prefix the candidates
 * agree on — same contract as a shell.
 */
export function applyCompletion(line, candidates) {
  if (!candidates.length) return line
  if (candidates.length === 1) return `${candidates[0]} `

  const lastWords = candidates.map((c) => tokens(c)[tokens(c).length - 1])
  const shared = commonPrefix(lastWords)
  if (!shared) return line
  const head = tokens(line).slice(0, -1)
  return [...head, shared].join(' ')
}
