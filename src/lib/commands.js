// The `ticker>` command line — CLI command grammar mapped onto web routes
// and actions. Pure parser: returns a plan, the CommandBar executes it.

import { hrefFor } from './route.js'

const SYM = /^[A-Za-z0-9.^=-]{1,12}$/

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
  }
  if (cmd in NAVS && !args.length) return { type: 'nav', hash: NAVS[cmd] }

  // per-symbol views
  const VIEWS = {
    ta: null, chart: null, n: null, news: null,
    intra: 'intraday', opt: 'options', options: 'options',
    ei: 'earnings', ins: 'insider', insider: 'insider',
    an: 'analysts', analysts: 'analysts',
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
    return { type: 'msg', text: 'usage: alert SYM > 123.45' }
  }

  // vs A B [C…] → compare; screen A B → valuation grid
  if ((cmd === 'vs' || cmd === 'screen') && args.length >= 1 && args.every((a) => SYM.test(a))) {
    return {
      type: 'screen',
      symbols: args.map((a) => a.toUpperCase()),
      view: cmd === 'vs' ? 'compare' : 'valuation',
    }
  }

  if (cmd === 'chat') {
    return args.length ? { type: 'chat', q: args.join(' ') } : { type: 'nav', hash: '#/chat' }
  }

  if (cmd === 'h' || cmd === 'help' || cmd === '?') {
    return { type: 'msg', text: 'SYM · ta/chart/intra/opt/ei/ins/an/n SYM · vs A B · screen A B · w/uw SYM · alert SYM > N · m s hm movers er cal · pos acct · alerts · chat [q]' }
  }
  if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
    return { type: 'msg', text: "it's a browser — close the tab :)" }
  }

  // bare symbol → research
  if (parts.length === 1 && SYM.test(parts[0])) return research(parts[0])

  return null
}

export { hrefFor }
