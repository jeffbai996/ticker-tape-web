// The `ticker>` command line — CLI command grammar mapped onto web routes
// and actions. Pure parser: returns a plan, the CommandBar executes it.

import { hrefFor } from './route.js'
import { CATALYST_TYPES } from './catalysts.js'

const SYM = /^[A-Za-z0-9.^=-]{1,12}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const RANGE_KEYS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y']

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
  row2('corr', 'correlation grid', 'margin|trades', 'account · fills'),
  section('actions'),
  row2('w|uw SYM', 'watch / unwatch', 'alert SYM > N', 'arm price alert'),
  row2('cat', 'list catalysts', 'cat rm N', 'remove catalyst'),
  row('cat add DATE …', '\\[SYM] \\[type] label — type: product conf policy capex macro'),
  row2('group NAME SYM…', 'name a bucket', 'group rm NAME', 'ungroup'),
  row2('div SYM', 'dividend history', 'chart SYM 6m', 'range works now'),
  row('opt SYM DATE', 'jump straight to a 2026-09-18 expiry'),
  section('notes'),
  row2('mem \\[add TEXT]', 'AI memories', 'mem edit·rm N', 'update · delete'),
  row2('journal \\[add …]', 'trade journal', 'journal search T', 'find old thinking'),
  section('console'),
  row2('clear', 'wipe the console', 'copy \\[N]', 'copy output to clipboard'),
  row2('lang \\[en|zh]', 'switch language', 'h · q', 'help · quit'),
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
    // ── CLI parity pass (Jeff 2026-08-04: "still missing some cli commands").
    // Every alias below already had a page here; only the word was missing.
    r: '#/research', e: '#/markets/earnings', surprises: '#/markets/earnings',
    corr: '#/screen/correlation', correlation: '#/screen/correlation',
    screening: '#/screen', compare: '#/screen/compare',
    valuation: '#/screen/valuation',
    watchlist: '#/', tape: '#/',
    hf: '#/portfolio/cockpit',              // CLI's "high finance" cockpit
    trades: '#/portfolio/timeline',         // fills, in date order
    margin: '#/portfolio/account', cushion: '#/portfolio/account',
    headroom: '#/portfolio/account',
    heat: '#/markets/heatmap', comm: '#/markets/commodities',
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
    // CLI spellings that had no web equivalent word
    impact: 'earnings', earn: 'earnings', rating: 'analysts', detail: null,
  }
  if (cmd === 'wire' && args.length === 1 && SYM.test(args[0])) {
    return research(args[0], 'wire')
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

  // alert SYM >|< N   ·   bare `alert` lists them
  if (cmd === 'alert') {
    if (!args.length) return { type: 'nav', hash: '#/alerts' }
    const m = args.join(' ').match(/^([A-Za-z0-9.^=-]{1,12})\s*([<>])\s*([\d.]+)$/)
    if (m) return { type: 'alert', symbol: m[1].toUpperCase(), operator: m[2], value: Number(m[3]) }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]alert SYM > 123.45[/]` }
  }

  // console + session commands the CLI has and this bar didn't
  if (cmd === 'clear' || cmd === 'cls') return { type: 'clear' }
  if (cmd === 'lang') {
    const want = low(args[0] || '')
    if (!args.length) return { type: 'lang', locale: null }        // toggle
    if (want === 'en' || want === 'zh') return { type: 'lang', locale: want }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]lang · lang en · lang zh[/]` }
  }
  if (cmd === 'copy') {
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
  if (cmd === 'group' || cmd === 'groups') {
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
  if (cmd === 'journal' || cmd === 'jr') {
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
  if (cmd === 'div' || cmd === 'dividends') {
    if (args.length === 1 && SYM.test(args[0])) {
      return { type: 'div', symbol: args[0].toUpperCase() }
    }
    return { type: 'msg', text: `[bold ${INF}]usage[/] [${DIM}]div SYM[/]` }
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
