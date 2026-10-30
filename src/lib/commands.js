// The `ticker>` command line — CLI command grammar mapped onto web routes
// and actions. Pure parser: returns a plan, the CommandBar executes it.

import { hrefFor } from './route.js'
import { CATALYST_TYPES } from './catalysts.js'
import { DEFAULT_RANK, normalizePredicate, screenField } from './screenDefs.js'
import { LENGTHS, TONES } from './aidials.js'

const SYM = /^[A-Za-z0-9.^=-]{1,12}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const RANGE_KEYS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y']
const RANGE_ALIASES = {
  '1d': '1D', '1h': '1D', '2h': '1D', '4h': '1D', '6h': '1D', '12h': '1D', '24h': '1D',
  '5d': '5D', '1w': '5D',
  '1m': '1M', '1mo': '1M',
  '3m': '3M', '3mo': '3M',
  '6m': '6M', '6mo': '6M',
  ytd: 'YTD',
  '1y': '1Y',
  '2y': '2Y',
  '3y': '5Y', '4y': '5Y', '5y': '5Y',
}

function normalizeRange(token) {
  if (!token) return null
  const upper = String(token).toUpperCase()
  if (RANGE_KEYS.includes(upper)) return upper
  return RANGE_ALIASES[String(token).toLowerCase()] || null
}

// The browser console has a wide pane, so keep the CLI's dense two-column
// register instead of stretching one command rail across mostly empty space.
const INF = '#00c8ff'
const DIM = '#808080'
const ACC = '#ffc800'
const row = (cmd, desc) => `[bold ${INF}]${cmd.padEnd(18)}[/][${DIM}]${desc}[/]`
const row2 = (c1, d1, c2, d2) => `${row(c1, d1.padEnd(24))}${row(c2, d2)}`
const section = (title) => `[bold ${ACC}]═══ ${title} ═══[/]`
// the phone page keeps the CLI's two columns — command | description — but
// one pair per line: the 80-char two-pair rows wrap into soup inside a 360px
// pre on narrow viewports.
const nrow = (cmd, desc) => `[bold ${INF}]${cmd.padEnd(19)}[/][${DIM}]${desc}[/]`
// One source of truth for the command sheet; the wide pane pairs entries
// two-up, the phone lists them one per line. `full: true` = a description
// too long to share a line even on the wide pane.
const HELP_SHEET = [
  ['research', [
    ['SYM', 'open research'], ['ta|chart SYM', 'chart + technicals'],
    ['intra SYM', 'intraday + VWAP'], ['opt SYM', 'options chain'],
    ['ei SYM', 'earnings impact'], ['an SYM', 'analysts'],
    ['ins SYM', 'insider activity'], ['n SYM', 'news'],
    ['hold SYM', 'holders'], ['fil SYM', 'SEC filings'],
    ['prof SYM', 'company profile'], ['wire SYM', 'news wire trail'],
  ]],
  ['screens', [
    ['vs A B \\[C…]', 'compare'], ['screen A B', 'valuation grid'],
    ['m s hm movers', 'markets views'], ['er · cal', 'earnings · calendar'],
    ['market sectors …', 'full names work too'], ['wire · today', 'wire · calendar'],
    ['pos acct cockpit', 'portfolio views'], ['carry timeline', 'more portfolio'],
    ['b|brief', 'briefing + AI'], ['pos · acct', 'demo portfolio'],
    ['alerts', 'alert center'], ['chat \\[q]', 'AI chat'],
    ['bt|backtest', 'fills ledger replay', true],
    ['corr', 'correlation grid'], ['margin|trades', 'account · fills'],
  ]],
  ['actions', [
    ['w|uw SYM', 'watch / unwatch'], ['alert SYM > N', 'arm price alert'],
    ['alert SYM rsi > 70', 'rsi alert'], ['alert SYM vol > 2', 'volume multiple'],
    ['cat', 'list catalysts'], ['cat rm N', 'remove catalyst'],
    ['cat add DATE …', '\\[SYM] \\[type] label — type: product conf policy capex macro', true],
    ['group NAME SYM…', 'name a bucket'], ['group rm NAME', 'ungroup'],
    ['div SYM', 'dividend history'], ['chart SYM 6m', 'range works now'],
    ['opt SYM DATE', 'jump straight to a 2026-09-18 expiry', true],
  ]],
  ['notes', [
    ['mem \\[add TEXT]', 'AI memories'], ['mem edit·rm N', 'update · delete'],
    ['journal \\[add …]', 'trade journal'], ['journal search T', 'find old thinking'],
  ]],
  ['console', [
    ['clear', 'wipe the console'], ['copy \\[N]', 'copy output to clipboard'],
    ['lang \\[en|zh]', 'switch language'], ['h · q', 'help · quit'],
  ]],
]

function formatHelpSections(sections) {
  return sections.flatMap(([title, entries]) => {
    const lines = [section(title)]
    let pending = null
    for (const [cmd, desc, full] of entries) {
      if (full) {
        if (pending) { lines.push(row(...pending)); pending = null }
        lines.push(row(cmd, desc))
      } else if (pending) {
        lines.push(row2(pending[0], pending[1], cmd, desc)); pending = null
      } else {
        pending = [cmd, desc]
      }
    }
    if (pending) lines.push(row(...pending))
    return lines
  }).join('\n')
}

export const HELP_TEXT = formatHelpSections(HELP_SHEET)

export const HELP_TEXT_NARROW = HELP_SHEET.flatMap(([title, entries]) => [
  section(title), ...entries.map(([cmd, desc]) => nrow(cmd, desc)),
]).join('\n')

const HELP_TOPIC_SECTIONS = {
  symbols: [
    ['symbols', [
      ['SYM', 'open research'], ['SYM --profile', 'company profile'],
      ['SYM --ta', 'chart + technicals'], ['SYM --chart \\[6m]', 'chart with period'],
      ['SYM --intraday', 'intraday + VWAP'], ['SYM --options \\[DATE]', 'options chain'],
      ['SYM --news', 'symbol news'], ['SYM --insider', 'insider activity'],
      ['SYM --dividends', 'dividend profile'], ['SYM --short', 'short interest'],
      ['SYM --ratings', 'analyst ratings'], ['SYM --impact', 'earnings impact'],
    ]],
  ],
  market: [
    ['market', [
      ['m · s · hm · movers', 'markets views'], ['er · cal · today', 'earnings · calendar'],
      ['vs A B \\[6m]', 'relative performance'], ['screen A B', 'valuation grid'],
      ['corr', 'correlation matrix'], ['sig \\[name]', 'signal boards'],
      ['wire \\[group|SYM]', 'live wire feed'], ['b|brief', 'morning briefing'],
    ]],
  ],
  watchlist: [
    ['watchlist', [
      ['wl', 'watchlist order'], ['w|uw SYM', 'watch / unwatch'],
      ['wl up|down SYM', 'nudge symbol ±1'], ['wl move SYM N', 'move to slot N'],
      ['group NAME SYM…', 'name a bucket'], ['group rm NAME', 'remove bucket'],
    ]],
  ],
  portfolio: [
    ['portfolio', [
      ['pos · acct', 'positions · account'], ['cockpit · risk', 'stress + risk'],
      ['sizing · whatif', 'sizing · what-if'], ['carry · timeline', 'carry · NLV curve'],
      ['tt \\[YYYY-MM-DD]', 'time-travel book'], ['bt \\[BENCH] \\[ccy]', 'fills backtest'],
      ['trades · note', 'fills + annotations'], ['breakers · tw', 'thesis breakers'],
    ]],
  ],
  research: [
    ['research', [
      ['div SYM', 'dividend history'], ['short SYM', 'short interest'],
      ['alert SYM > N', 'price/rsi/sma/vol'], ['cat \\[add|rm]', 'dated catalysts'],
      ['memos \\[SYM]', 'saved AI reports'], ['analyze TARGET', 'deep-dive prompt'],
    ]],
  ],
  chat: [
    ['chat', [
      ['chat \\[q]', 'ask AI assistant'], ['model \\[name]', 'active AI model'],
      ['effort \\[level]', 'reasoning effort'], ['fast \\[on|off]', 'fast-mode toggle'],
      ['dials \\[len|tone]', 'output length/tone'], ['history \\[clear]', 'chat transcript'],
      ['mem \\[add|rm]', 'AI memories'], ['journal \\[add|rm]', 'trade journal'],
    ]],
  ],
  keys: [
    ['keys & console', [
      ['/', 'focus command bar'], ['Tab', 'complete command/symbol'],
      ['clear', 'wipe the console'], ['copy \\[N]', 'copy console entry'],
      ['lang \\[en|zh]', 'switch language'], ['export', 'download chat/report'],
      ['help \\[topic]', 'symbols·market·watchlist·portfolio·research·chat·keys', true],
    ]],
  ],
}

const HELP_TOPIC_ALIASES = {
  symbol: 'symbols', sym: 'symbols',
  markets: 'market', screens: 'market',
  wl: 'watchlist', watch: 'watchlist',
  port: 'portfolio', acct: 'portfolio',
  ai: 'chat',
  console: 'keys', key: 'keys', shortcuts: 'keys',
}

export function formatHelpTopic(topic) {
  const key = low(topic || '')
  if (!key || key === 'all') return HELP_TEXT
  const canonical = HELP_TOPIC_ALIASES[key] || key
  const sections = HELP_TOPIC_SECTIONS[canonical]
  if (!sections) return null
  return formatHelpSections(sections)
}

const low = (s) => s.toLowerCase()
const research = (sym, view) =>
  ({ type: 'nav', hash: `#/research/${low(sym)}${view ? `/${view}` : ''}` })

const SYM_FLAG_VIEWS = {
  '--profile': 'profile', '--prof': 'profile',
  '--ta': null, '--technicals': null,
  '--chart': null,
  '--intraday': 'intraday', '--intra': 'intraday',
  '--options': 'options', '--opt': 'options', '--chain': 'options',
  '--news': 'news',
  '--insider': 'insider', '--ins': 'insider',
  '--ratings': 'analysts', '--rating': 'analysts', '--analysts': 'analysts',
  '--impact': 'earnings', '--ei': 'earnings', '--earnings': 'earnings',
  '--holders': 'holders', '--hold': 'holders',
  '--filings': 'filings', '--fil': 'filings',
  '--wire': 'wire',
}

function parseSymbolFlag(symbol, flagArgs) {
  const flag = low(flagArgs[0] || '')
  const rest = flagArgs.slice(1)
  const sym = symbol.toUpperCase()
  if (flag === '--dividends' || flag === '--div') {
    return { type: 'div', symbol: sym }
  }
  if (flag === '--short' || flag === '--si') {
    return { type: 'short', symbol: sym }
  }
  if (!(flag in SYM_FLAG_VIEWS)) {
    return {
      type: 'msg',
      text: `[red]unknown symbol option:[/] ${flagArgs[0]} [${DIM}]— try help symbols[/]`,
    }
  }
  const plan = research(sym, SYM_FLAG_VIEWS[flag])
  if ((flag === '--chart' || flag === '--ta') && rest[0]) {
    const r = normalizeRange(rest[0])
    if (!r) {
      return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]${sym} --chart 1d·5d·1w·1m·3m·6m·ytd·1y·2y·5y[/]` }
    }
    plan.range = r
  }
  if ((flag === '--options' || flag === '--opt' || flag === '--chain') && rest[0]) {
    if (!DATE.test(rest[0])) {
      return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]${sym} --options 2026-09-18[/]` }
    }
    plan.expiry = rest[0]
  }
  return plan
}

const SIG_FIELD_ALIASES = {
  vol: 'volRatio',
  volratio: 'volRatio',
  vol_ratio: 'volRatio',
  off_high: 'offHigh',
  offhigh: 'offHigh',
}

function canonicalSigField(rawField) {
  const f = low(rawField || '')
  const mapped = SIG_FIELD_ALIASES[f] || f
  return screenField(mapped) ? mapped : null
}

function parseSignalPredicate(token) {
  const tok = low(token || '').trim()
  if (!tok) return null
  const sideMatch = tok.match(/^(above|below):([a-z_0-9]+)$/)
  if (sideMatch) {
    const field = canonicalSigField(sideMatch[2])
    return field ? normalizePredicate({ field, op: sideMatch[1] }) : null
  }
  const betweenMatch = tok.match(/^([a-z_0-9]+):(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/)
  if (betweenMatch) {
    const field = canonicalSigField(betweenMatch[1])
    return field
      ? normalizePredicate({ field, op: 'between', value: betweenMatch[2], value2: betweenMatch[3] })
      : null
  }
  const cmpMatch = tok.match(/^([a-z_0-9]+)([<>])(-?\d+(?:\.\d+)?)$/)
  if (cmpMatch) {
    const field = canonicalSigField(cmpMatch[1])
    if (!field) return null
    if (field === 'sma50' || field === 'sma200') {
      return normalizePredicate({ field, op: cmpMatch[2] === '>' ? 'above' : 'below' })
    }
    return normalizePredicate({ field, op: cmpMatch[2], value: cmpMatch[3] })
  }
  return null
}

function parseSignalAddArgs(args) {
  const name = args[0] || ''
  let rest = args.slice(1)
  let rankBy = DEFAULT_RANK
  let rankDir = 'desc'
  const rankIdx = rest.findIndex((a) => low(a) === 'rank')
  if (rankIdx >= 0) {
    const tail = rest.slice(rankIdx + 1)
    rest = rest.slice(0, rankIdx)
    const f = canonicalSigField(tail[0])
    if (f) rankBy = f
    if (tail[1] && ['asc', 'desc'].includes(low(tail[1]))) rankDir = low(tail[1])
  }
  const predicates = []
  const rejected = []
  for (const tok of rest) {
    if (low(tok).startsWith('rank:')) {
      const bits = low(tok).split(':')
      const f = canonicalSigField(bits[1])
      if (f) rankBy = f
      if (bits[2] && ['asc', 'desc'].includes(bits[2])) rankDir = bits[2]
      continue
    }
    const p = parseSignalPredicate(tok)
    if (p) predicates.push(p)
    else rejected.push(tok)
  }
  return { name, predicates, rankBy, rankDir, rejected }
}

/**
 * Parse one command line. Returns:
 *  {type:'nav', hash} | {type:'watch'|'unwatch', symbol} |
 *  {type:'alert', symbol, operator, value} | {type:'screen', symbols, view} |
 *  {type:'chat', q} | {type:'msg', text} | null (unrecognized)
 */
export function parseCommand(input) {
  const raw = (input || '').trim()
  if (!raw) return null
  const parts = raw.split(/\s+/)
  const cmd = low(parts[0])
  const args = parts.slice(1)

  // navigation shortcuts
  const NAVS = {
    m: '#/markets', s: '#/markets/sectors', hm: '#/markets/heatmap',
    movers: '#/markets/movers', e: '#/markets/earnings', er: '#/markets/earnings', cal: '#/markets/calendar',
    wl: '#/', t: '#/portfolio/thesis', pos: '#/portfolio', acct: '#/portfolio/account',
    pnl: '#/portfolio/account', alerts: '#/alerts', port: '#/portfolio',
    b: '#/brief', brief: '#/brief', briefing: '#/brief', morning: '#/brief',
    bt: '#/portfolio/backtest', backtest: '#/portfolio/backtest', replay: '#/portfolio/backtest',
    market: '#/markets', markets: '#/markets', sectors: '#/markets/sectors',
    commodities: '#/markets/commodities', commod: '#/markets/commodities', cm: '#/markets/commodities', heatmap: '#/markets/heatmap',
    earnings: '#/markets/earnings', calendar: '#/markets/calendar',
    today: '#/markets/calendar', positions: '#/portfolio',
    account: '#/portfolio/account', broker: '#/portfolio', cockpit: '#/portfolio/cockpit', risk: '#/portfolio/cockpit',
    carry: '#/portfolio/carry', cost: '#/portfolio/carry', timeline: '#/portfolio/timeline', tl: '#/portfolio/timeline', nlv: '#/portfolio/timeline',
    sizing: '#/portfolio/sizing', wire: '#/wire', news: '#/wire',
    dash: '#/portfolio/account', dashboard: '#/', research: '#/research',
    // ── CLI parity aliases.
    // Every alias below already had a page here; only the word was missing.
    r: '#/research', surprises: '#/markets/earnings', es: '#/markets/earnings',
    corr: '#/screen/correlation', correlation: '#/screen/correlation',
    screening: '#/screen', scr: '#/screen', compare: '#/screen/compare',
    valuation: '#/screen/valuation',
    watchlist: '#/', tape: '#/',
    hf: '#/portfolio/cockpit',              // CLI's "high finance" cockpit
    trades: '#/portfolio/trades',           // fills, in date order
    margin: '#/portfolio/account', cushion: '#/portfolio/account',
    headroom: '#/portfolio/account',
    heat: '#/markets/heatmap', comm: '#/markets/commodities',
    tt: '#/portfolio/timetravel', timetravel: '#/portfolio/timetravel', asof: '#/portfolio/timetravel',
    breakers: '#/portfolio/thesis', tw: '#/portfolio/thesis',
    shadows: '#/portfolio/backtest', shadow: '#/portfolio/backtest', counterfactual: '#/portfolio/backtest',
    event: '#/markets/calendar', ev: '#/markets/calendar',
    sessions: '#/wire',
    resume: '#/chat',
  }
  if (cmd in NAVS && !args.length) return { type: 'nav', hash: NAVS[cmd] }

  // per-symbol views
  const VIEWS = {
    ta: null, chart: null, c: null, n: 'news', news: 'news',
    i: 'intraday', intra: 'intraday', opt: 'options', options: 'options', chain: 'options',
    ei: 'earnings', ins: 'insider', insider: 'insider',
    an: 'analysts', analysts: 'analysts',
    hold: 'holders', holders: 'holders', fil: 'filings', filings: 'filings',
    prof: 'profile', profile: 'profile',
    ratings: 'analysts', technicals: null, lookup: null,
    // CLI spellings that had no web equivalent word
    impact: 'earnings', earn: 'earnings', rating: 'analysts', pt: 'analysts', detail: null,
  }
  if (cmd === 'wire') {
    const WIRE_GROUPS = {
      all: '',
      earnings: 'earnings_release',
      filings: 'filing',
      filing: 'filing',
      headlines: 'headline',
      headline: 'headline',
      fed: 'fed_speech,fed_headline,macro_print',
      macro: 'fed_speech,fed_headline,macro_print',
      audio: 'transcript_chunk,digest',
    }
    if (args.length === 2 && ['read', 'story'].includes(low(args[0]))
        && /^\d{1,12}$/.test(args[1])) {
      return { type: 'nav', hash: `#/wire/${args[1]}` }
    }
    if (args.length === 1 && ['top', 'latest'].includes(low(args[0]))) {
      return { type: 'wire_order', order: low(args[0]) }
    }
    if (args.length === 1 && low(args[0]) in WIRE_GROUPS) {
      return { type: 'nav', hash: '#/wire', wireFilter: WIRE_GROUPS[low(args[0])] }
    }
    if (args.length === 1 && ['live', 'health', 'stop'].includes(low(args[0]))) {
      return { type: 'nav', hash: '#/wire' }
    }
    if (args.length === 1 && SYM.test(args[0])) return research(args[0], 'wire')
  }
  if (cmd === 'arm') {
    if (args.length >= 2 && SYM.test(args[0]) && /^https?:\/\//i.test(args[1])) {
      return {
        type: 'wire_arm',
        symbol: args[0].toUpperCase(),
        url: args[1],
        label: args.slice(2).join(' ') || `${args[0].toUpperCase()} live call`,
      }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]arm SYM https://… \\[label][/]` }
  }
  if (cmd === 'sessions' && args.length >= 1) {
    return { type: 'nav', hash: '#/wire' }
  }
  if (cmd === 'lookup' && args.length >= 2 && SYM.test(args[0]) && args[1].startsWith('--')) {
    return parseSymbolFlag(args[0], args.slice(1))
  }
  if (cmd in VIEWS && args.length >= 1 && SYM.test(args[0])) {
    const plan = research(args[0], VIEWS[cmd])
    // CLI parity: `chart SYM 6m` picks the range, `opt SYM 2026-09-18` the
    // expiry. The extra arg rides on the nav plan; the view consumes it.
    if ((cmd === 'ta' || cmd === 'chart' || cmd === 'c') && args[1]) {
      const r = normalizeRange(args[1])
      if (!r) {
        return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]chart SYM 1d·5d·1w·1m·3m·6m·ytd·1y·2y·5y[/]` }
      }
      plan.range = r
    }
    if ((cmd === 'opt' || cmd === 'options' || cmd === 'chain') && args[1]) {
      if (!DATE.test(args[1])) {
        return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]opt SYM 2026-09-18[/]` }
      }
      plan.expiry = args[1]
    }
    return plan
  }

  if ((cmd === 'w' || cmd === 'watch') && args.length === 1 && SYM.test(args[0])) {
    return { type: 'watch', symbol: args[0].toUpperCase() }
  }
  if ((cmd === 'uw' || cmd === 'unwatch') && args.length === 1 && SYM.test(args[0])) {
    return { type: 'unwatch', symbol: args[0].toUpperCase() }
  }
  if (cmd === 'wl' || cmd === 'watchlist') {
    const sub = low(args[0] || '')
    if (sub === 'list' && args.length === 1) return { type: 'wl_list' }
    if ((sub === 'up' || sub === 'down') && args.length === 2 && SYM.test(args[1])) {
      return { type: 'wl_move', symbol: args[1].toUpperCase(), delta: sub === 'up' ? -1 : 1 }
    }
    if (sub === 'move' && args.length === 3 && SYM.test(args[1]) && /^\d+$/.test(args[2])) {
      return { type: 'wl_slot', symbol: args[1].toUpperCase(), slot: Number(args[2]) }
    }
    return {
      type: 'msg',
      text: `[bold ${INF}]usage[/] [${DIM}]wl · wl list · wl up|down SYM · wl move SYM N[/]`,
    }
  }

  // alert SYM >|< N  ·  alert SYM rsi > 70  ·  alert SYM sma > 50  ·  alert SYM vol > 2
  // plus CLI subcommands: alert list · alert rm N · alert edit N [SYM] <cond>
  if (cmd === 'alert' || cmd === 'al') {
    const usage = `[bold ${INF}]usage[/] [${DIM}]alert SYM > 123.45 · alert SYM rsi > 70 · alert SYM sma > 50 · alert SYM vol > 2 · alert list · alert edit N … · alert rm N[/]`
    if (!args.length) return { type: 'nav', hash: '#/alerts' }
    const sub = low(args[0])
    if (sub === 'list' && args.length === 1) return { type: 'alert_list' }
    if (['rm', 'del', 'delete'].includes(sub) && args.length === 2 && /^\d+$/.test(args[1])) {
      return { type: 'alert_rm', id: Number(args[1]) }
    }
    if (sub === 'edit' && args.length >= 2 && /^\d+$/.test(args[1])) {
      const id = Number(args[1])
      const tail = args.slice(2).join(' ')
      const em = tail.match(/^(?:([A-Za-z0-9.^=-]{1,12})\s+)?(rsi|sma|vol|volume)?\s*([<>])\s*([\d.]+)$/i)
      if (!em) return { type: 'msg', text: usage }
      // If no indicator keyword was matched and m[1] is an indicator word, disambiguate
      let sym = em[1] ? em[1].toUpperCase() : null
      let kind = low(em[2] || '')
      if (!kind && sym && ['RSI', 'SMA', 'VOL', 'VOLUME'].includes(sym)) {
        kind = low(sym)
        sym = null
      }
      const alertType = kind === 'rsi' ? 'rsi' : kind === 'sma' ? 'sma_cross' : kind ? 'volume' : 'price'
      if (alertType === 'volume' && em[3] === '<') return { type: 'msg', text: usage }
      return {
        type: 'alert_edit',
        id,
        symbol: sym,
        alertType,
        operator: em[3],
        value: Number(em[4]),
      }
    }
    const m = args.join(' ')
      .match(/^([A-Za-z0-9.^=-]{1,12})\s*(rsi|sma|vol|volume)?\s*([<>])\s*([\d.]+)$/i)
    if (!m) return { type: 'msg', text: usage }
    const kind = low(m[2] || '')
    const alertType = kind === 'rsi' ? 'rsi' : kind === 'sma' ? 'sma_cross' : kind ? 'volume' : 'price'
    // volume alerts are a "N× the 20-day average" multiple — under-average
    // volume isn't a signal anyone arms, and addAlert would force `>` anyway
    if (alertType === 'volume' && m[3] === '<') return { type: 'msg', text: usage }
    return {
      type: 'alert',
      symbol: m[1].toUpperCase(),
      alertType,
      operator: m[3],
      value: Number(m[4]),
    }
  }

  // console + session commands the CLI has and this bar didn't
  if (cmd === 'clear' || cmd === 'cls') return { type: 'clear' }
  if (cmd === 'lang') {
    const want = low(args[0] || '')
    if (!args.length) return { type: 'lang', locale: null }        // toggle
    if (want === 'en' || want === 'zh') return { type: 'lang', locale: want }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]lang · lang en · lang zh[/]` }
  }
  if (cmd === 'copy' || cmd === 'cp') {
    const n = args.length ? Number(args[0]) : null
    if (args.length && !Number.isInteger(n)) {
      return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]copy · copy 3 (nth console entry)[/]` }
    }
    return { type: 'copy', n }
  }
  // whatif [buy|sell] AAPL 100 — routes to #/portfolio/whatif when args are given,
  // or #/portfolio/sizing on bare `whatif`
  if (cmd === 'whatif' || cmd === 'wi') {
    if (!args.length) {
      return {
        type: 'nav_msg',
        hash: '#/portfolio/sizing',
        text: `[${DIM}]whatif runs on the sizing page — position math, no order tickets here[/]`,
      }
    }
    let action = 'BUY'
    let rest = args
    if (['buy', 'sell'].includes(low(args[0]))) {
      action = args[0].toUpperCase()
      rest = args.slice(1)
    }
    if (rest.length >= 2 && SYM.test(rest[0]) && /^\d+$/.test(rest[1])) {
      const symbol = rest[0].toUpperCase()
      const qty = Number(rest[1])
      return {
        type: 'nav_msg',
        hash: '#/portfolio/whatif',
        action,
        symbol,
        qty,
        text: `[${DIM}]what-if ${action} ${qty} ${symbol}[/]`,
      }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]whatif \\[buy|sell] SYM QTY[/]` }
  }
  if (cmd === 'margin' && args.length >= 1 && SYM.test(args[0])) {
    const symbol = args[0].toUpperCase()
    const qty = args[1] && /^\d+$/.test(args[1]) ? Number(args[1]) : null
    return {
      type: 'nav_msg',
      hash: '#/portfolio/whatif',
      action: 'BUY',
      symbol,
      ...(qty ? { qty } : {}),
      text: `[${DIM}]margin preview for ${symbol}${qty ? ` (${qty})` : ''}[/]`,
    }
  }
  if ((cmd === 'tt' || cmd === 'timetravel' || cmd === 'asof') && args.length >= 1) {
    if (DATE.test(args[0])) {
      return { type: 'nav', hash: '#/portfolio/timetravel', date: args[0] }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]tt \\[YYYY-MM-DD][/]` }
  }
  if ((cmd === 'bt' || cmd === 'backtest' || cmd === 'replay') && args.length >= 1) {
    let benchmark = null
    let ccy = null
    for (let i = 0; i < args.length; i++) {
      if (low(args[i]) === 'ccy' && args[i + 1] && ['usd', 'cad'].includes(low(args[i + 1]))) {
        ccy = args[i + 1].toUpperCase()
        i++
      } else if (['usd', 'cad'].includes(low(args[i])) && !benchmark && i > 0) {
        ccy = args[i].toUpperCase()
      } else if (!benchmark && SYM.test(args[i])) {
        benchmark = args[i].toUpperCase()
      }
    }
    return {
      type: 'nav',
      hash: '#/portfolio/backtest',
      ...(benchmark ? { benchmark } : {}),
      ...(ccy ? { ccy } : {}),
    }
  }
  if ((cmd === 'shadows' || cmd === 'shadow' || cmd === 'counterfactual') && args.length >= 1) {
    const sym = low(args[0]) === 'vs' && args[1] ? args[1] : args[0]
    return {
      type: 'nav',
      hash: '#/portfolio/backtest',
      ...(sym && SYM.test(sym) ? { benchmark: sym.toUpperCase() } : {}),
    }
  }
  if ((cmd === 'event' || cmd === 'ev') && args.length >= 1) {
    return {
      type: 'nav',
      hash: '#/markets/calendar',
      eventFilter: args.join(' ').toLowerCase(),
    }
  }

  // vs A B [C…] [period] → compare; screen A B → valuation grid
  if ((cmd === 'vs' || cmd === 'compare' || cmd === 'screen') && args.length >= 1) {
    let syms = args
    let range = null
    if (cmd !== 'screen' && args.length >= 2) {
      const trailing = normalizeRange(args[args.length - 1])
      if (trailing) {
        syms = args.slice(0, -1)
        range = trailing
      }
    }
    if (syms.length >= 1 && syms.every((a) => SYM.test(a))) {
      return {
        type: 'screen',
        symbols: syms.map((a) => a.toUpperCase()),
        view: cmd === 'screen' ? 'valuation' : 'compare',
        ...(range ? { range } : {}),
      }
    }
  }

  // group · group NAME SYM… · group rm NAME  (CLI watchlist groups)
  if (cmd === 'group' || cmd === 'groups' || cmd === 'grp' || cmd === 'bucket') {
    if (!args.length) return { type: 'group_list' }
    if (low(args[0]) === 'rm' && args.length === 2) {
      return { type: 'group_rm', name: args[1] }
    }
    if (args.length >= 2 && args.slice(1).every((a) => SYM.test(a))) {
      return { type: 'group_add', name: args[0], symbols: args.slice(1).map((a) => a.toUpperCase()) }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]group · group megacaps AAPL MSFT GOOGL · group rm megacaps[/]` }
  }

  // memory · memory add TEXT · memory edit N TEXT · memory rm N · memory N
  if (cmd === 'memory' || cmd === 'mem') {
    if (!args.length) return { type: 'mem_list' }
    const sub = low(args[0])
    if (sub === 'add' && args.length >= 2) {
      return { type: 'mem_add', text: args.slice(1).join(' ') }
    }
    if (sub === 'edit' && args.length >= 3 && /^\d+$/.test(args[1])) {
      return { type: 'mem_edit', id: Number(args[1]), text: args.slice(2).join(' ') }
    }
    if (['rm', 'delete', 'del'].includes(sub) && args.length === 2 && /^\d+$/.test(args[1])) {
      return { type: 'mem_rm', id: Number(args[1]) }
    }
    if (/^\d+$/.test(sub)) return { type: 'mem_show', id: Number(sub) }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]mem · mem add TEXT · mem edit N TEXT · mem rm N · mem N[/]` }
  }

  // journal · journal add TEXT · journal rm N|N-M · journal search TERM · journal save [N] · journal import [N] · journal N
  if (cmd === 'journal' || cmd === 'jr' || cmd === 'j') {
    if (!args.length) return { type: 'journal_list' }
    const sub = low(args[0])
    if (sub === 'add' && args.length >= 2) {
      return { type: 'journal_add', text: args.slice(1).join(' ') }
    }
    if (['rm', 'delete', 'del'].includes(sub) && args.length === 2
        && /^\d+(-\d+)?$/.test(args[1])) {
      return { type: 'journal_rm', range: args[1] }
    }
    if (sub === 'search' && args.length >= 2) {
      return { type: 'journal_search', term: args.slice(1).join(' ') }
    }
    if (sub === 'save') {
      const count = args[1] && /^\d+$/.test(args[1]) ? Number(args[1]) : 1
      return { type: 'journal_save', count }
    }
    if (sub === 'import') {
      const count = args[1] && /^\d+$/.test(args[1]) ? Number(args[1]) : 10
      return { type: 'journal_import', count }
    }
    if (/^\d+$/.test(sub)) return { type: 'journal_show', id: Number(sub) }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]journal · journal add TEXT · journal rm N · journal search TERM · journal save \\[N] · journal N[/]` }
  }

  // sig · signals · board — saved signal boards (screenDefs.js)
  if (cmd === 'sig' || cmd === 'signals' || cmd === 'board') {
    const usage = `[bold ${INF}]usage[/] [${DIM}]sig · sig add NAME rsi<30 above:sma200 vol>1.5 \\[rank FIELD \\[asc|desc]] · sig NAME · sig rm NAME[/]`
    if (!args.length || (args.length === 1 && low(args[0]) === 'list')) {
      return { type: 'sig_list' }
    }
    const sub = low(args[0])
    if (sub === 'add') {
      if (args.length < 3) return { type: 'msg', text: usage }
      const parsed = parseSignalAddArgs(args.slice(1))
      if (!parsed.name || !parsed.predicates.length || parsed.rejected.length) {
        return { type: 'msg', text: usage }
      }
      return {
        type: 'sig_add',
        name: parsed.name,
        predicates: parsed.predicates,
        rankBy: parsed.rankBy,
        rankDir: parsed.rankDir,
      }
    }
    if (['rm', 'del', 'delete'].includes(sub) && args.length >= 2) {
      return { type: 'sig_rm', name: args.slice(1).join(' ') }
    }
    return { type: 'sig_open', name: args.join(' ') }
  }

  // short SYM / si SYM — short interest profile in the console
  if (cmd === 'short' || cmd === 'si') {
    if (args.length === 1 && SYM.test(args[0])) {
      return { type: 'short', symbol: args[0].toUpperCase() }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]short SYM[/]` }
  }

  // memos [SYM] · memo [latest|N|rm N|SYM]
  if (cmd === 'memos') {
    if (!args.length) return { type: 'memos_list', symbol: null }
    if (args.length === 1 && SYM.test(args[0])) {
      return { type: 'memos_list', symbol: args[0].toUpperCase() }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]memos \\[SYM][/]` }
  }
  if (cmd === 'memo') {
    if (!args.length) return { type: 'memos_list', symbol: null }
    const sub = low(args[0])
    if (['rm', 'del', 'delete'].includes(sub) && args.length === 2 && /^\d+$/.test(args[1])) {
      return { type: 'memo_rm', id: Number(args[1]) }
    }
    if (sub === 'latest') {
      const symbol = args[1] && SYM.test(args[1]) ? args[1].toUpperCase() : null
      return { type: 'memo_show', id: 'latest', symbol }
    }
    if (/^\d+$/.test(args[0])) {
      const symbol = args[1] && SYM.test(args[1]) ? args[1].toUpperCase() : null
      return { type: 'memo_show', id: Number(args[0]), symbol }
    }
    if (args.length === 1 && SYM.test(args[0])) {
      return research(args[0], null)
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]memos \\[SYM] · memo latest \\[SYM] · memo N · memo rm N[/]` }
  }

  // analyze TARGET · dive TARGET — stage a deep-dive prompt in AI chat
  if (cmd === 'analyze' || cmd === 'dive') {
    if (!args.length) return { type: 'nav', hash: '#/chat' }
    return { type: 'chat', q: `Deep-dive analysis on ${args.join(' ')}` }
  }

  // note · notes · fills — trade fill annotations
  if (cmd === 'note' || cmd === 'notes' || cmd === 'fills') {
    if (!args.length || (args.length === 1 && low(args[0]) === 'list')) {
      return { type: 'note_list' }
    }
    const sub = low(args[0])
    if (['rm', 'del', 'remove', 'delete'].includes(sub) && args.length === 2 && /^\d+$/.test(args[1])) {
      return { type: 'note_rm', index: Number(args[1]) }
    }
    if (/^\d+$/.test(args[0]) && args.length >= 2) {
      return { type: 'note_set', index: Number(args[0]), text: args.slice(1).join(' ') }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]note · note N TEXT · note rm N[/]` }
  }

  // div SYM — dividend profile + payout history in the console
  if (cmd === 'div' || cmd === 'dividend' || cmd === 'dividends') {
    if (args.length === 1 && SYM.test(args[0])) {
      return { type: 'div', symbol: args[0].toUpperCase() }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]div SYM[/]` }
  }

  // cat · cat rm N · cat add DATE [SYM] [type] label…
  if (cmd === 'cat' || cmd === 'catalyst' || cmd === 'catalysts' || cmd === 'cx') {
    if (!args.length) return { type: 'catalyst_list' }
    if (low(args[0]) === 'rm' && args.length === 2 && /^\d+$/.test(args[1])) {
      return { type: 'catalyst_rm', id: Number(args[1]) }
    }
    if (low(args[0]) === 'add' && args.length >= 3 && DATE.test(args[1])) {
      let i = 2
      let symbol = null
      let ctype = 'other'
      // A symbol must be typed in CAPS ("AAPL") — that's what separates it
      // from a lowercase label word ("tariff …"). Type words are lowercase.
      if (CATALYST_TYPES.includes(low(args[i]))) {
        ctype = low(args[i])
        i++
      } else if (SYM.test(args[i]) && args[i] === args[i].toUpperCase() && args.length > i + 1) {
        symbol = args[i]
        i++
        if (CATALYST_TYPES.includes(low(args[i])) && args.length > i + 1) {
          ctype = low(args[i])
          i++
        }
      }
      const label = args.slice(i).join(' ')
      if (label) return { type: 'catalyst_add', date: args[1], symbol, ctype, label }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]cat · cat rm N · cat add 2026-09-09 AAPL product Fall keynote[/]` }
  }

  // AI session controls: model · effort · fast · dials · history · prompt
  if (cmd === 'model' || cmd === 'models') {
    if (!args.length) return { type: 'model_get' }
    return { type: 'model_set', model: low(args[0]) }
  }
  if (cmd === 'effort') {
    if (!args.length) return { type: 'effort_get' }
    const level = low(args[0])
    if (['low', 'medium', 'high', 'xhigh', 'max'].includes(level)) {
      return { type: 'effort_set', effort: level }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]effort · effort low·medium·high·xhigh[/]` }
  }
  if (cmd === 'fast') {
    if (!args.length) return { type: 'fast_set', enabled: null }
    const v = low(args[0])
    if (['on', '1', 'true'].includes(v)) return { type: 'fast_set', enabled: true }
    if (['off', '0', 'false'].includes(v)) return { type: 'fast_set', enabled: false }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]fast · fast on · fast off[/]` }
  }
  if (cmd === 'dials') {
    if (!args.length) return { type: 'dials_get' }
    const patch = {}
    for (const tok of args) {
      const k = low(tok)
      if (LENGTHS.some((l) => l.key === k)) patch.length = k
      else if (TONES.some((t) => t.key === k)) patch.tone = k
      else if (k === 'disconfirm' || k === '+disconfirm') patch.disconfirm = true
      else if (k === 'nodisconfirm' || k === '-disconfirm') patch.disconfirm = false
      else return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]dials · dials \\[flash|brief|standard|deep] \\[analyst|trader|catalyst|risk|blunt|skeptic] \\[disconfirm][/]` }
    }
    return { type: 'dials_set', patch }
  }
  if (cmd === 'history' || cmd === 'hist') {
    if (!args.length) return { type: 'history_list', page: 1 }
    const sub = low(args[0])
    if (sub === 'clear') return { type: 'history_clear' }
    if (sub === 'peek' && args[1] && /^\d+$/.test(args[1])) {
      return { type: 'history_peek', id: Number(args[1]) }
    }
    if (sub === 'search' && args.length >= 2) {
      return { type: 'history_search', term: args.slice(1).join(' ') }
    }
    if (['rm', 'del', 'delete'].includes(sub) && args[1] && /^\d+(-\d+)?$/.test(args[1])) {
      return { type: 'history_rm', range: args[1] }
    }
    if (/^\d+$/.test(sub)) return { type: 'history_list', page: Number(sub) }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]history \\[N] · history peek N · history search TERM · history rm N · history clear[/]` }
  }
  if (cmd === 'prompt') {
    if (!args.length) return { type: 'prompt_get' }
    if (low(args[0]) === 'clear' && args.length === 1) return { type: 'prompt_set', text: '' }
    return { type: 'prompt_set', text: args.join(' ') }
  }
  if (cmd === 'spark') {
    if (!args.length) return { type: 'spark', mode: null }
    const mode = low(args[0])
    if (mode === 'price' || mode === 'vol' || mode === 'volume') {
      return { type: 'spark', mode: mode === 'volume' ? 'vol' : mode }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]spark · spark price · spark vol[/]` }
  }
  if ((cmd === 'compact' || cmd === 'c') && !args.length) {
    return { type: 'compact' }
  }
  if ((cmd === 'refresh' || cmd === 'reload') && !args.length) {
    return { type: 'refresh' }
  }
  if (cmd === 'export') {
    return { type: 'export', target: low(args[0] || 'console') }
  }

  if (cmd === 'chat' || cmd === 'ai') {
    return args.length ? { type: 'chat', q: args.join(' ') } : { type: 'nav', hash: '#/chat' }
  }

  if (cmd === 'h' || cmd === 'help' || cmd === '?') {
    if (!args.length) return { type: 'msg', text: HELP_TEXT }
    const topicText = formatHelpTopic(args[0])
    if (topicText) return { type: 'msg', text: topicText }
    return {
      type: 'msg',
      text: `[red]unknown help topic:[/] ${args[0]} [${DIM}]— topics: symbols · market · watchlist · portfolio · research · chat · keys · all[/]`,
    }
  }
  if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
    return { type: 'msg', text: "it's a browser — close the tab :)" }
  }

  // SYM --flag (v4.3 CLI symbol options)
  if (SYM.test(parts[0]) && args[0]?.startsWith('--')) {
    return parseSymbolFlag(parts[0], args)
  }

  // bare symbol → research. `verify` says the console must confirm the
  // symbol exists before it moves: an unrecognised string is a typo, not a
  // navigation.
  if (parts.length === 1 && SYM.test(parts[0])) {
    return { ...research(parts[0]), verify: parts[0].toUpperCase() }
  }

  return null
}

/** One-line "what this will do", for UIs that preview a plan before running it. */
export function describePlan(plan) {
  if (!plan) return ''
  switch (plan.type) {
    case 'nav':
    case 'nav_msg':
      return [plan.hash.replace('#/', '') || 'dashboard', plan.range, plan.expiry]
        .filter(Boolean).join(' · ')
    case 'watch': return `watch ${plan.symbol}`
    case 'unwatch': return `unwatch ${plan.symbol}`
    case 'wl_move': return `move ${plan.symbol} ${plan.delta < 0 ? 'up' : 'down'}`
    case 'wl_slot': return `move ${plan.symbol} to #${plan.slot}`
    case 'alert': return `arm ${plan.alertType || 'price'} alert on ${plan.symbol}`
    case 'alert_edit': return `update alert #${plan.id}`
    case 'screen': return `${plan.view}: ${plan.symbols.join(' ')}`
    case 'sig_add': return `save signal board ${plan.name}`
    case 'sig_open': return `open signal board ${plan.name}`
    case 'chat': return `ask the AI chat`
    case 'div': return `${plan.symbol} dividends`
    case 'short': return `${plan.symbol} short interest`
    case 'model_set': return `switch model to ${plan.model}`
    case 'effort_set': return `set effort to ${plan.effort}`
    case 'msg': return 'usage'
    default: return plan.type.replace(/_/g, ' ')
  }
}

export { hrefFor }
