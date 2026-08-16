// The `ticker>` command line — CLI command grammar mapped onto web routes
// and actions. Pure parser: returns a plan, the CommandBar executes it.

import { hrefFor } from './route.js'
import { CATALYST_TYPES } from './catalysts.js'

const SYM = /^[A-Za-z0-9.^=-]{1,12}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const RANGE_KEYS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y']

// Multi-line help in the CLI help screen's register: one fixed-width command
// rail, dim descriptions, amber sections. Keep the hierarchy and wording in
// sync with ticker-tape/screens/help.py, omitting CLI-only operations rather
// than advertising commands the browser cannot execute.
const INF = '#00c8ff'
const DIM = '#808080'
const ACC = '#ffc800'
const row = (cmd, desc) => `[bold ${INF}]${cmd.padEnd(Math.max(28, cmd.length + 2))}[/][${DIM}]${desc}[/]`
const section = (title) => `[bold ${ACC}]═══ ${title.toUpperCase()} ═══[/]`
export const HELP_TEXT = [
  section('keyboard shortcuts'),
  row('t', 'Thesis Watcher'),
  row('s', 'Sector performance'),
  row('e', 'Earnings calendar'),
  row('?', 'This help screen'),
  row('q', 'Close message'),
  section('commands'),
  row('<TICKER>', 'Stock lookup (e.g. AAPL)'),
  row('m, market', 'Market overview'),
  row('ta <SYM>', 'Technical analysis'),
  row('news \\[SYM]', 'News feed — all or by symbol'),
  row('wire \\[SYM|read N|story N]', 'Live events wire (fragwire)'),
  row('today', "Day sheet — today's calendar"),
  row('chart <SYM> \\[period]', 'Price chart (1d/5d/1m/3m/6m/ytd/1y/2y/5y)'),
  row('vs <SYM> <SYM> ...', 'Compare symbols'),
  row('intra <SYM>', 'Intraday bars with VWAP'),
  row('impact <SYM>', 'Earnings impact history'),
  row('screen <SYM> <SYM>', 'Valuation comparison table'),
  row('insider <SYM>', 'Insider transactions'),
  row('options <SYM> \\[exp]', 'Options chain with IV'),
  row('div / rating <SYM>', 'Dividends / analyst ratings'),
  row('corr / heatmap', 'Correlation matrix / performance heatmap'),
  row('calendar', 'Economic calendar (upcoming data + events)'),
  row('catalyst \\[cmd]', 'Catalyst calendar — add/list/remove'),
  row('commodities', 'Commodity futures'),
  row('surprises', 'Earnings surprise tracker'),
  section('portfolio'),
  row('watch / unwatch <SYM>', 'Add/remove watchlist symbol'),
  row('wl', 'Show watchlist'),
  row('alert \\[condition]', 'Smart alerts (price, RSI, volume)'),
  row('group \\[name] \\[SYMs]', 'Manage watchlist groups'),
  row('journal \\[cmd]', 'Trade journal (add/search/remove)'),
  section('ibkr'),
  row('ibkr / pos / acct / pnl', 'Portfolio / positions / account'),
  row('whatif \\[buy/sell] <SYM> <QTY>', 'Pre-trade sizing workspace'),
  row('trades', "Today's executions"),
  row('dash', 'Margin dashboard'),
  row('cockpit / hf', 'Risk cockpit'),
  row('carry', 'Cost of carry'),
  row('detail <SYM>', 'Position research detail'),
  row('timeline', 'Portfolio history'),
  row('backtest \\[SYM]', 'Thesis replay'),
  row('tt / asof', 'Time travel'),
  row('breakers / tw', 'Thesis Watcher'),
  row('brief', 'Morning briefing'),
  section('ai chat'),
  row('chat \\[question]', 'AI chat (multi-model)'),
  row('resume', 'Open the latest chat session'),
  row('memory \\[cmd]', 'Persistent memories'),
  section('other'),
  row('copy \\[N]', 'Copy console output to clipboard'),
  row('lang / clear', 'Language / clear console'),
  row('quit, q', 'Close message'),
].join('\n')

const low = (s) => s.toLowerCase()
const research = (sym, view) =>
  ({ type: 'nav', hash: `#/research/${low(sym)}${view ? `/${view}` : ''}` })

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
    account: '#/portfolio/account', ibkr: '#/portfolio', cockpit: '#/portfolio/cockpit', risk: '#/portfolio/cockpit',
    carry: '#/portfolio/carry', cost: '#/portfolio/carry', timeline: '#/portfolio/timeline', tl: '#/portfolio/timeline', nlv: '#/portfolio/timeline',
    sizing: '#/portfolio/sizing', wire: '#/wire', news: '#/wire',
    dash: '#/portfolio/account', dashboard: '#/', research: '#/research',
    // ── CLI parity pass (Jeff 2026-08-04: "still missing some cli commands").
    // Every alias below already had a page here; only the word was missing.
    r: '#/research', surprises: '#/markets/earnings',
    corr: '#/screen/correlation', correlation: '#/screen/correlation',
    screening: '#/screen', scr: '#/screen', compare: '#/screen/compare',
    valuation: '#/screen/valuation',
    watchlist: '#/', tape: '#/',
    hf: '#/portfolio/cockpit',              // CLI's "high finance" cockpit
    trades: '#/portfolio/trades',           // fills, in date order
    margin: '#/portfolio/account', cushion: '#/portfolio/account',
    headroom: '#/portfolio/account',
    heat: '#/markets/heatmap', comm: '#/markets/commodities',
    tt: '#/portfolio/timetravel', asof: '#/portfolio/timetravel',
    breakers: '#/portfolio/thesis', tw: '#/portfolio/thesis',
    resume: '#/chat',
  }
  if (cmd in NAVS && !args.length) return { type: 'nav', hash: NAVS[cmd] }

  // per-symbol views
  const VIEWS = {
    ta: null, chart: null, n: 'news', news: 'news',
    i: 'intraday', intra: 'intraday', opt: 'options', options: 'options', chain: 'options',
    ei: 'earnings', ins: 'insider', insider: 'insider',
    an: 'analysts', analysts: 'analysts',
    hold: 'holders', holders: 'holders', fil: 'filings', filings: 'filings',
    prof: 'profile', profile: 'profile', memo: null,
    ratings: 'analysts', technicals: null, lookup: null,
    // CLI spellings that had no web equivalent word
    impact: 'earnings', earn: 'earnings', rating: 'analysts', pt: 'analysts', detail: null,
  }
  if (cmd === 'wire') {
    if (args.length === 2 && ['read', 'story'].includes(low(args[0]))
        && /^\d{1,12}$/.test(args[1])) {
      return { type: 'nav', hash: `#/wire/${args[1]}` }
    }
    if (args.length === 1 && ['live', 'health'].includes(low(args[0]))) {
      return { type: 'nav', hash: '#/wire' }
    }
    if (args.length === 1 && SYM.test(args[0])) return research(args[0], 'wire')
  }
  if (cmd in VIEWS && args.length >= 1 && SYM.test(args[0])) {
    const plan = research(args[0], VIEWS[cmd])
    // CLI parity: `chart SYM 6m` picks the range, `opt SYM 2026-09-18` the
    // expiry. The extra arg rides on the nav plan; the view consumes it.
    if ((cmd === 'ta' || cmd === 'chart') && args[1]) {
      const r = args[1].toUpperCase()
      if (!RANGE_KEYS.includes(r)) {
        return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]chart SYM 1d·5d·1m·3m·6m·ytd·1y·2y·5y[/]` }
      }
      plan.range = r
    }
    if ((cmd === 'opt' || cmd === 'options') && args[1]) {
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

  // alert SYM >|< N  ·  alert SYM rsi > 70  ·  alert SYM vol > 2
  // (the alerts page has always stored a type; only the grammar was price-only)
  if (cmd === 'alert' || cmd === 'al') {
    const usage = `[bold ${INF}]usage[/] [${DIM}]alert SYM > 123.45 · alert SYM rsi > 70 · alert SYM vol > 2[/]`
    if (!args.length) return { type: 'nav', hash: '#/alerts' }
    const m = args.join(' ')
      .match(/^([A-Za-z0-9.^=-]{1,12})\s*(rsi|vol|volume)?\s*([<>])\s*([\d.]+)$/i)
    if (!m) return { type: 'msg', text: usage }
    const kind = low(m[2] || '')
    const alertType = kind === 'rsi' ? 'rsi' : kind ? 'volume' : 'price'
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
  // whatif buy NVDA 100 — the sizing page is the web's version of that math
  if (cmd === 'whatif' || cmd === 'wi') {
    return {
      type: 'nav_msg',
      hash: '#/portfolio/sizing',
      text: `[${DIM}]whatif runs on the sizing page — position math, no order tickets here[/]`,
    }
  }

  // vs A B [C…] → compare; screen A B → valuation grid
  if ((cmd === 'vs' || cmd === 'compare' || cmd === 'screen') && args.length >= 1 && args.every((a) => SYM.test(a))) {
    return {
      type: 'screen',
      symbols: args.map((a) => a.toUpperCase()),
      view: cmd === 'screen' ? 'valuation' : 'compare',
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
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]group · group semis NVDA AMD TSM · group rm semis[/]` }
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

  // journal · journal add TEXT · journal rm N|N-M · journal search TERM · journal N
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
    if (/^\d+$/.test(sub)) return { type: 'journal_show', id: Number(sub) }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]journal · journal add TEXT · journal rm N · journal search TERM · journal N[/]` }
  }

  // div SYM — dividend profile + payout history in the console
  if (cmd === 'div' || cmd === 'dividend' || cmd === 'dividends') {
    if (args.length === 1 && SYM.test(args[0])) {
      return { type: 'div', symbol: args[0].toUpperCase() }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]div SYM[/]` }
  }

  // cat · cat rm N · cat add DATE [SYM] [type] label…
  if (cmd === 'cat' || cmd === 'catalyst' || cmd === 'cx') {
    if (!args.length) return { type: 'catalyst_list' }
    if (low(args[0]) === 'rm' && args.length === 2 && /^\d+$/.test(args[1])) {
      return { type: 'catalyst_rm', id: Number(args[1]) }
    }
    if (low(args[0]) === 'add' && args.length >= 3 && DATE.test(args[1])) {
      let i = 2
      let symbol = null
      let ctype = 'other'
      // A symbol must be typed in CAPS ("NVDA") — that's what separates it
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
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]cat · cat rm N · cat add 2026-09-09 NVDA product GTC keynote[/]` }
  }

  if (cmd === 'chat' || cmd === 'ai') {
    return args.length ? { type: 'chat', q: args.join(' ') } : { type: 'nav', hash: '#/chat' }
  }

  if (cmd === 'h' || cmd === 'help' || cmd === '?') {
    return { type: 'msg', text: HELP_TEXT }
  }
  if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
    return { type: 'msg', text: "it's a browser — close the tab :)" }
  }

  // bare symbol → research. `verify` says the console must confirm the
  // symbol exists before it moves: an unrecognised string is a typo, not a
  // navigation (Jeff 2026-08-07).
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
    case 'alert': return `arm ${plan.alertType || 'price'} alert on ${plan.symbol}`
    case 'screen': return `${plan.view}: ${plan.symbols.join(' ')}`
    case 'chat': return `ask the AI chat`
    case 'div': return `${plan.symbol} dividends`
    case 'msg': return 'usage'
    default: return plan.type.replace(/_/g, ' ')
  }
}

export { hrefFor }
