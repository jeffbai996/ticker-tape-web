// The `ticker>` command line — CLI command grammar mapped onto web routes
// and actions. Pure parser: returns a plan, the CommandBar executes it.

import { hrefFor } from './route.js'
import { CATALYST_TYPES } from './catalysts.js'

const SYM = /^[A-Za-z0-9.^=-]{1,12}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

// Multi-line help in the CLI help screen's exact register: bold-info command
// column, dim descriptions, amber ═══ sections (rendered via lib/rich.js).
const INF = '#00c8ff'
const DIM = '#808080'
const ACC = '#ffc800'
const row = (cmd, desc) => `[bold ${INF}]${cmd.padEnd(18)}[/][${DIM}]${desc}[/]`
const row2 = (c1, d1, c2, d2) => `${row(c1, d1.padEnd(24))}${row(c2, d2)}`
const section = (title) => `[bold ${ACC}]═══ ${title} ═══[/]`
export const HELP_TEXT = [
  section('research'),
  row2('SYM', 'open research', 'ta|chart SYM', 'chart + technicals'),
  row2('intra SYM', 'intraday + VWAP', 'opt SYM', 'options chain'),
  row2('ei SYM', 'earnings impact', 'an SYM', 'analysts'),
  row2('ins SYM', 'insider activity', 'n SYM', 'news'),
  row2('hold SYM', 'holders', 'fil SYM', 'SEC filings'),
  row2('prof SYM', 'company profile', 'wire SYM', 'fragwire trail'),
  section('screens'),
  row2('vs A B \\[C…]', 'compare', 'screen A B', 'valuation grid'),
  row2('m s hm movers', 'markets views', 'er · cal', 'earnings · calendar'),
  row2('market sectors …', 'full names work too', 'wire · today', 'wire · calendar'),
  row2('pos acct cockpit', 'portfolio views', 'carry timeline', 'more portfolio'),
  row2('b|brief', 'briefing + AI', 'pos · acct', 'demo portfolio'),
  row2('alerts', 'alert center', 'chat \\[q]', 'AI chat'),
  row('bt|backtest', 'fills ledger replay'),
  section('actions'),
  row2('w|uw SYM', 'watch / unwatch', 'alert SYM > N', 'arm price alert'),
  row2('cat', 'list catalysts', 'cat rm N', 'remove catalyst'),
  row('cat add DATE …', '\\[SYM] \\[type] label — type: product conf policy capex macro'),
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
    movers: '#/markets/movers', er: '#/markets/earnings', cal: '#/markets/calendar',
    wl: '#/', t: '#/', pos: '#/portfolio', acct: '#/portfolio/account',
    pnl: '#/portfolio', alerts: '#/alerts', port: '#/portfolio',
    b: '#/brief', brief: '#/brief', briefing: '#/brief',
    bt: '#/portfolio/backtest', backtest: '#/portfolio/backtest',
    market: '#/markets', markets: '#/markets', sectors: '#/markets/sectors',
    commodities: '#/markets/commodities', heatmap: '#/markets/heatmap',
    earnings: '#/markets/earnings', calendar: '#/markets/calendar',
    today: '#/markets/calendar', positions: '#/portfolio',
    account: '#/portfolio/account', cockpit: '#/portfolio/cockpit',
    carry: '#/portfolio/carry', timeline: '#/portfolio/timeline',
    sizing: '#/portfolio/sizing', wire: '#/wire',
    dash: '#/', dashboard: '#/', research: '#/research',
  }
  if (cmd in NAVS && !args.length) return { type: 'nav', hash: NAVS[cmd] }

  // per-symbol views
  const VIEWS = {
    ta: null, chart: null, n: null, news: null,
    intra: 'intraday', opt: 'options', options: 'options',
    ei: 'earnings', ins: 'insider', insider: 'insider',
    an: 'analysts', analysts: 'analysts',
    hold: 'holders', holders: 'holders', fil: 'filings', filings: 'filings',
    prof: 'profile', profile: 'profile', memo: null,
    ratings: 'analysts', technicals: null, lookup: null,
  }
  if (cmd === 'wire' && args.length === 1 && SYM.test(args[0])) {
    return research(args[0], 'wire')
  }
  if (cmd in VIEWS && args.length >= 1 && SYM.test(args[0])) {
    return research(args[0], VIEWS[cmd])
  }

  if ((cmd === 'w' || cmd === 'watch') && args.length === 1 && SYM.test(args[0])) {
    return { type: 'watch', symbol: args[0].toUpperCase() }
  }
  if ((cmd === 'uw' || cmd === 'unwatch') && args.length === 1 && SYM.test(args[0])) {
    return { type: 'unwatch', symbol: args[0].toUpperCase() }
  }

  // alert SYM >|< N   ·   bare `alert` lists them
  if (cmd === 'alert') {
    if (!args.length) return { type: 'nav', hash: '#/alerts' }
    const m = args.join(' ').match(/^([A-Za-z0-9.^=-]{1,12})\s*([<>])\s*([\d.]+)$/)
    if (m) return { type: 'alert', symbol: m[1].toUpperCase(), operator: m[2], value: Number(m[3]) }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]alert SYM > 123.45[/]` }
  }

  // vs A B [C…] → compare; screen A B → valuation grid
  if ((cmd === 'vs' || cmd === 'screen') && args.length >= 1 && args.every((a) => SYM.test(a))) {
    return {
      type: 'screen',
      symbols: args.map((a) => a.toUpperCase()),
      view: cmd === 'vs' ? 'compare' : 'valuation',
    }
  }

  // cat · cat rm N · cat add DATE [SYM] [type] label…
  if (cmd === 'cat' || cmd === 'catalyst') {
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

  if (cmd === 'chat') {
    return args.length ? { type: 'chat', q: args.join(' ') } : { type: 'nav', hash: '#/chat' }
  }

  if (cmd === 'h' || cmd === 'help' || cmd === '?') {
    return { type: 'msg', text: HELP_TEXT }
  }
  if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
    return { type: 'msg', text: "it's a browser — close the tab :)" }
  }

  // bare symbol → research
  if (parts.length === 1 && SYM.test(parts[0])) return research(parts[0])

  return null
}

export { hrefFor }
