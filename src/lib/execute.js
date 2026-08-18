// Runs a parsed command plan (lib/commands.js is the pure parser). Lifted out
// of the CommandBar so the palette can execute the same grammar through the
// same code path instead of a second, drifting copy.

import { watch, unwatch } from './watchlist.js'
import { addAlert, conditionText } from './alerts.js'
import { addCatalyst, removeCatalyst, loadCatalysts } from './catalysts.js'
import { getCached } from './feed.js'
import { symbolExists } from './symbolSearch.js'
import { loadUserGroups, saveUserGroup, removeUserGroup } from './usergroups.js'
import { loadMemories, addMemory, editMemory, removeMemory } from './chatMemory.js'
import {
  loadJournal, addJournalEntry, removeJournalEntry, searchJournal,
} from './journal.js'
import { fetchDividends } from './history.js'
import { fetchFundamentals } from './fundamentals.js'
import { fmtPrice, fmtPct } from './format.js'
import { parseRich } from './rich.js'
import { getLocale, setLocale } from './i18n.js'
import {
  capturedAgo, deleteWorkspace, findWorkspace, listWorkspaces, renameWorkspace,
  saveWorkspace, summarizeLayout,
} from './workspaces.js'
import { applyToBoard, captureBoard } from './workspaceState.js'

/** One-line quote echo from the feed cache, if the symbol is priced. */
function quoteEcho(symbol) {
  const q = getCached(symbol)?.quote
  if (!q?.price) return null
  const up = (q.pct ?? 0) >= 0
  const tone = up ? 'green' : 'red'
  return `[bold]${symbol}[/] ${fmtPrice(q.price)} [${tone}]${up ? '▲' : '▼'} ${fmtPct(q.pct)}[/]`
}

/**
 * Execute one plan. `ctx` is the console the output goes to:
 *   print(cmd, text) · getLog() → console entries · clearConsole()
 * A caller with no console (the palette) can pass no-ops.
 */
export function executePlan(plan, cmd, ctx = {}) {
  const print = ctx.print || (() => {})
  const getLog = ctx.getLog || (() => [])
  const clearConsole = ctx.clearConsole || (() => {})

  if (plan.type === 'nav' && plan.verify) {
    // a symbol we can't confirm is a typo — say so and stay put rather than
    // dumping the user on a dead research page (Jeff 2026-08-07)
    print(cmd, `[#808080]looking up[/] ${plan.verify}…`)
    symbolExists(plan.verify, { cached: (s) => getCached(s)?.quote })
      .then((ok) => {
        if (!ok) {
          print(cmd, `[red]no such symbol:[/] ${plan.verify}`)
          return
        }
        location.hash = plan.hash
        print(cmd, quoteEcho(plan.verify) || `→ ${plan.hash.replace('#/', '')}`)
      })
      .catch(() => print(cmd, `[red]couldn't check[/] ${plan.verify} [#808080]— stayed put, try again[/]`))
    return
  }

  if (plan.type === 'nav') {
    // chart range / options expiry ride-alongs: storage covers a view that
    // mounts after the hash change, the event covers one already mounted.
    if (plan.range) {
      sessionStorage.setItem('chart_range', plan.range)
      window.dispatchEvent(new CustomEvent('tape:chart-range', { detail: plan.range }))
    }
    if (plan.expiry) {
      sessionStorage.setItem('opt_expiry', plan.expiry)
      window.dispatchEvent(new CustomEvent('tape:opt-expiry', { detail: plan.expiry }))
    }
    location.hash = plan.hash
    const sym = plan.hash.match(/#\/research\/([a-z0-9.^=-]+)/)?.[1]?.toUpperCase()
    print(cmd, (sym && quoteEcho(sym)) || `→ ${plan.hash.replace('#/', '') || 'dashboard'}`)
  } else if (plan.type === 'watch') {
    print(cmd, watch(plan.symbol) ? `[green]✓[/] watching [bold]${plan.symbol}[/]` : `[red]${plan.symbol}: already watched or invalid[/]`)
  } else if (plan.type === 'unwatch') {
    print(cmd, unwatch(plan.symbol) ? `[green]✓[/] unwatched [bold]${plan.symbol}[/]` : `[red]${plan.symbol}: not on the list[/]`)
  } else if (plan.type === 'alert') {
    try {
      const a = addAlert({
        symbol: plan.symbol,
        type: plan.alertType || 'price',
        operator: plan.operator,
        value: plan.value,
      })
      print(cmd, `[green]✓ armed[/] [#00c8ff]${conditionText(a)}[/]`)
    } catch (err) {
      print(cmd, String(err.message || err))
    }
  } else if (plan.type === 'screen') {
    localStorage.setItem('screen_symbols', plan.symbols.join(' '))
    location.hash = `#/screen/${plan.view === 'compare' ? 'compare' : 'valuation'}`
    print(cmd, `${plan.view}: ${plan.symbols.join(' ')}`)
  } else if (plan.type === 'catalyst_add') {
    try {
      const c = addCatalyst({ date: plan.date, symbol: plan.symbol, type: plan.ctype, label: plan.label })
      print(cmd, `catalyst #${c.id}: ${c.date}  ${c.symbol === 'MACRO' ? '' : `${c.symbol} `}[${c.type}] ${c.label}`)
    } catch (err) {
      print(cmd, String(err.message || err))
    }
  } else if (plan.type === 'catalyst_rm') {
    print(cmd, removeCatalyst(plan.id) ? `removed catalyst #${plan.id}` : `no catalyst #${plan.id}`)
  } else if (plan.type === 'catalyst_list') {
    const cats = [...loadCatalysts()].sort((a, b) => a.date.localeCompare(b.date))
    print(cmd, cats.length
      ? cats.map((c) => `#${c.id}  ${c.date}  ${c.symbol === 'MACRO' ? '' : `${c.symbol} `}[${c.type}] ${c.label}`).join('\n')
      : 'no catalysts — cat add 2026-09-09 NVDA product GTC keynote')
  } else if (plan.type === 'chat') {
    sessionStorage.setItem('chat_prefill', plan.q)
    location.hash = '#/chat'
    print(cmd, `→ chat: ${plan.q}`)
  } else if (plan.type === 'nav_msg') {
    location.hash = plan.hash
    print(cmd, plan.text)
  } else if (plan.type === 'clear') {
    clearConsole()
  } else if (plan.type === 'lang') {
    const next = plan.locale || (getLocale() === 'en' ? 'zh' : 'en')
    setLocale(next)
    print(cmd, `[green]✓[/] ${next === 'zh' ? '中文' : 'english'}`)
  } else if (plan.type === 'copy') {
    // `copy` = last output, `copy N` = that console entry, CLI-style
    const log = getLog()
    const entry = plan.n == null ? log[log.length - 1] : log[plan.n - 1]
    if (!entry) {
      print(cmd, `[red]nothing at ${plan.n ?? 'the end'} of the console[/]`)
    } else {
      const plain = parseRich(entry.text).map((s) => s.text).join('')
      navigator.clipboard?.writeText(`${entry.cmd}\n${plain}`)
        .then(() => print(cmd, `[green]✓[/] copied ${plan.n ? `#${plan.n}` : 'last output'}`))
        .catch(() => print(cmd, '[red]clipboard blocked by the browser[/]'))
    }
  } else if (plan.type === 'group_list') {
    const groups = Object.entries(loadUserGroups())
    print(cmd, groups.length
      ? groups.map(([n, syms]) => `[bold #00c8ff]${n.padEnd(14)}[/]${syms.join(' ')}`).join('\n')
      : 'no groups — group semis NVDA AMD TSM')
  } else if (plan.type === 'group_add') {
    const saved = saveUserGroup(plan.name, plan.symbols)
    if (!saved) {
      print(cmd, `[red]bad group — name must be a word, symbols must be symbols[/]`)
    } else {
      // a group you can't see is useless: pull members onto the watchlist
      const added = saved.filter((s) => watch(s))
      print(cmd, `[green]✓[/] group [bold]${plan.name}[/]: ${saved.join(' ')}`
        + (added.length ? ` [#808080](+${added.length} to watchlist)[/]` : ''))
    }
  } else if (plan.type === 'group_rm') {
    print(cmd, removeUserGroup(plan.name)
      ? `[green]✓[/] removed group [bold]${plan.name}[/]`
      : `[red]no group "${plan.name}"[/]`)
  } else if (plan.type === 'mem_list') {
    const mems = loadMemories()
    print(cmd, mems.length
      ? mems.map((m) => `[bold #00c8ff]#${String(m.id).padEnd(3)}[/]${m.text.slice(0, 70).padEnd(72)}[#808080]${new Date(m.ts).toISOString().slice(0, 10)}[/]`).join('\n')
      : 'no memories — mem add TEXT, or ask the AI chat to remember something')
  } else if (plan.type === 'mem_add') {
    const m = addMemory(plan.text)
    print(cmd, m ? `[green]✓[/] memory #${m.id} saved` : '[red]empty memory[/]')
  } else if (plan.type === 'mem_edit') {
    print(cmd, editMemory(plan.id, plan.text)
      ? `[green]✓[/] memory #${plan.id} updated` : `[red]no memory #${plan.id}[/]`)
  } else if (plan.type === 'mem_rm') {
    print(cmd, removeMemory(plan.id)
      ? `[green]✓[/] memory #${plan.id} deleted` : `[red]no memory #${plan.id}[/]`)
  } else if (plan.type === 'mem_show') {
    const m = loadMemories().find((x) => x.id === plan.id)
    print(cmd, m
      ? `[bold]#${m.id}[/]  ${m.text}\n[#808080]saved ${new Date(m.ts).toLocaleString()}[/]`
      : `[red]no memory #${plan.id}[/]`)
  } else if (plan.type === 'journal_list') {
    const entries = loadJournal().slice(-15)
    print(cmd, entries.length
      ? entries.map((e) => `[bold #00c8ff]#${String(e.id).padEnd(3)}[/]${e.text.replace(/\n/g, ' ').slice(0, 60).padEnd(62)}[#808080]${new Date(e.ts).toISOString().slice(0, 10)}${e.symbols.length ? `  [${e.symbols.join(' ')}]` : ''}[/]`).join('\n')
      : 'no journal entries — journal add TEXT')
  } else if (plan.type === 'journal_add') {
    const e = addJournalEntry(plan.text)
    print(cmd, e
      ? `[green]✓[/] journal #${e.id} saved [#808080](${e.symbols.length ? e.symbols.join(' ') : 'no symbols'})[/]`
      : '[red]empty entry[/]')
  } else if (plan.type === 'journal_rm') {
    const m = plan.range.match(/^(\d+)(?:-(\d+))?$/)
    const lo = Number(m[1])
    const hi = Number(m[2] || m[1])
    let n = 0
    for (let i = lo; i <= hi; i++) if (removeJournalEntry(i)) n++
    print(cmd, n ? `[green]✓[/] deleted ${n} journal ${n === 1 ? 'entry' : 'entries'}` : `[red]nothing in #${plan.range}[/]`)
  } else if (plan.type === 'journal_search') {
    const hits = searchJournal(plan.term).slice(-10)
    print(cmd, hits.length
      ? hits.map((e) => `[bold #00c8ff]#${String(e.id).padEnd(3)}[/]${e.text.replace(/\n/g, ' ').slice(0, 64)}  [#808080]${new Date(e.ts).toISOString().slice(0, 10)}[/]`).join('\n')
      : `[#808080]nothing matching "${plan.term}"[/]`)
  } else if (plan.type === 'journal_show') {
    const e = loadJournal().find((x) => x.id === plan.id)
    print(cmd, e
      ? `[bold]#${e.id}[/]  [#808080]${new Date(e.ts).toLocaleString()}${e.symbols.length ? `  [${e.symbols.join(' ')}]` : ''}[/]\n${e.text}`
      : `[red]no journal #${plan.id}[/]`)
  } else if (plan.type === 'div') {
    const sym = plan.symbol
    print(cmd, `[#808080]fetching ${sym} dividends…[/]`)
    Promise.all([
      fetchDividends(sym).catch(() => []),
      fetchFundamentals(sym).catch(() => null),
    ]).then(([hist, f]) => {
      const lines = []
      if (f?.dividendYield != null || f?.dividendRate != null) {
        const bits = []
        if (f.dividendRate != null) bits.push(`rate $${f.dividendRate.toFixed(2)}/yr`)
        if (f.dividendYield != null) bits.push(`yield ${(f.dividendYield * 100).toFixed(2)}%`)
        if (f.payoutRatio != null) bits.push(`payout ${(f.payoutRatio * 100).toFixed(0)}%`)
        if (f.exDividendDate != null) bits.push(`ex-div ${new Date(f.exDividendDate * 1000).toISOString().slice(0, 10)}`)
        lines.push(`[bold]${sym}[/] ${bits.join(' · ')}`)
      }
      if (hist.length) {
        lines.push(...hist.slice(0, 10).map((d) =>
          `${new Date(d.date * 1000).toISOString().slice(0, 10)}  [green]$${+d.amount.toFixed(4)}[/]`))
        if (hist.length > 10) lines.push(`[#808080]… ${hist.length - 10} more in the last 5y[/]`)
      }
      print(cmd, lines.length ? lines.join('\n') : `[#808080]${sym} pays no dividend[/]`)
    })
  } else if (plan.type === 'ws_list') {
    const items = listWorkspaces()
    print(cmd, items.length
      ? items.map((ws) => `[bold #00c8ff]${ws.name.padEnd(16)}[/]${summarizeLayout(ws.layout).padEnd(46)}[#808080]${capturedAgo(ws.capturedAt)}[/]`).join('\n')
      : 'no workspaces — ws save opening')
  } else if (plan.type === 'ws_save') {
    const ws = saveWorkspace(plan.name, captureBoard(plan.name).layout)
    print(cmd, ws
      ? `[green]✓[/] workspace [bold]${ws.name}[/] [#808080]${summarizeLayout(ws.layout)}[/]`
      : '[red]bad workspace name[/]')
  } else if (plan.type === 'ws_apply') {
    const ws = findWorkspace(plan.name)
    if (!ws) {
      print(cmd, `[red]no workspace "${plan.name}"[/] [#808080]— ws list[/]`)
    } else {
      // no reload, no refetch: this moves the same switches the toolbar moves
      applyToBoard(ws)
      print(cmd, `[green]✓[/] [bold]${ws.name}[/] [#808080]${summarizeLayout(ws.layout)}[/]`)
    }
  } else if (plan.type === 'ws_rm') {
    print(cmd, deleteWorkspace(plan.name)
      ? `[green]✓[/] deleted workspace [bold]${plan.name}[/]`
      : `[red]no workspace "${plan.name}"[/]`)
  } else if (plan.type === 'ws_rename') {
    print(cmd, renameWorkspace(plan.from, plan.to)
      ? `[green]✓[/] [bold]${plan.from}[/] → [bold]${plan.to}[/]`
      : `[red]can't rename "${plan.from}" — missing, or "${plan.to}" is taken[/]`)
  } else if (plan.type === 'msg') {
    print(cmd, plan.text)
  }
}
