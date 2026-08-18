import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVE_KEY, EXPORT_KEYS, EXPORT_KEY_PREFIXES, MAX_WORKSPACES,
  PREFERENCES_VERSION, WORKSPACE_VERSION,
  applyWorkspace, capturedAgo, captureWorkspace, deleteWorkspace, exportPreferences,
  findWorkspace, getActiveWorkspace, importPreferences, listWorkspaces, normalizeLayout,
  renameWorkspace, saveWorkspace, setActiveWorkspace, summarizeLayout, workspaceHash,
} from '../../src/lib/workspaces.js'
import { parseCommand, HELP_TEXT } from '../../src/lib/commands.js'
import { COMMAND_WORDS, completions } from '../../src/lib/complete.js'
import { executePlan } from '../../src/lib/execute.js'
import { getWidgets, setWidgets } from '../../src/lib/widgets.js'
import { parseRich } from '../../src/lib/rich.js'

const control = readFileSync(resolve(process.cwd(), 'src/components/WorkspacesControl.jsx'), 'utf8')
const dashboard = readFileSync(resolve(process.cwd(), 'src/pages/dashboard.jsx'), 'utf8')
const plain = (text) => parseRich(text).map((s) => s.text).join('')

const GETTERS = {
  listId: () => 'megacaps',
  viewMode: () => 'grouped',
  sort: () => 'manual',
  spark: () => 'area',
  sparkWindow: () => 'DAY',
  widgets: () => [
    { id: 1, type: 'pulse' }, { id: 2, type: 'markets' },
    { id: 3, type: 'chart', symbol: 'AAPL' },
  ],
  marketView: () => 'sectors',
  researchSymbol: () => 'msft',
}

beforeEach(() => {
  localStorage.clear()
  location.hash = ''
})

describe('workspace schema', () => {
  it('captures a versioned layout snapshot and nothing transient', () => {
    const ws = captureWorkspace(GETTERS, 'opening')
    expect(ws.v).toBe(WORKSPACE_VERSION)
    expect(ws.name).toBe('opening')
    expect(typeof ws.capturedAt).toBe('number')
    expect(ws.layout).toEqual({
      listId: 'megacaps',
      viewMode: 'grouped',
      sort: 'manual',
      spark: 'area',
      sparkWindow: 'DAY',
      widgets: [{ type: 'pulse' }, { type: 'markets' }, { type: 'chart', symbol: 'AAPL' }],
      marketView: 'sectors',
      researchSymbol: 'MSFT',
    })
    // quotes, prices and anything not in the schema never make it in
    expect(Object.keys(ws)).toEqual(['v', 'name', 'capturedAt', 'layout'])
  })

  it('omits fields whose getter is missing or throws', () => {
    const ws = captureWorkspace({
      viewMode: () => 'flat',
      spark: () => { throw new Error('no dom') },
    }, 'thin')
    expect(ws.layout).toEqual({ viewMode: 'flat' })
  })

  it('normalizes hostile layouts: unknown keys dropped, enums validated', () => {
    expect(normalizeLayout({
      viewMode: 'sideways',
      sort: 'change',
      spark: 'plaid',
      sparkWindow: '1M',
      listId: 'NOT A SLUG',
      widgets: [{ type: 'pulse' }, { type: 'rootkit' }, { type: 'chart' }],
      researchSymbol: 'not a symbol',
      marketView: 'nowhere',
      accessToken: 'sk-abc',
      proxy_url: 'https://private.example',
      quotes: { AAPL: 1 },
    })).toEqual({
      sort: 'change',
      sparkWindow: '1M',
      widgets: [{ type: 'pulse' }],
    })
  })

  it('caps the widget list and the number of saved workspaces', () => {
    const many = Array.from({ length: 40 }, () => ({ type: 'pulse' }))
    expect(normalizeLayout({ widgets: many }).widgets.length).toBeLessThanOrEqual(12)
    for (let i = 0; i < MAX_WORKSPACES + 4; i++) saveWorkspace(`ws${i}`, { viewMode: 'flat' })
    expect(listWorkspaces().length).toBe(MAX_WORKSPACES)
    expect(findWorkspace('ws0')).toBeNull()
  })
})

describe('workspace store', () => {
  it('saves, lists, finds, renames and deletes by name', () => {
    expect(listWorkspaces()).toEqual([])
    const ws = saveWorkspace('opening', captureWorkspace(GETTERS).layout)
    expect(ws.name).toBe('opening')
    expect(listWorkspaces().map((w) => w.name)).toEqual(['opening'])
    expect(findWorkspace('OPENING').layout.listId).toBe('megacaps')

    expect(renameWorkspace('opening', 'event day')).toBe(true)
    expect(findWorkspace('opening')).toBeNull()
    expect(findWorkspace('event day').layout.spark).toBe('area')

    expect(renameWorkspace('missing', 'x')).toBe(false)
    expect(deleteWorkspace('event day')).toBe(true)
    expect(deleteWorkspace('event day')).toBe(false)
    expect(listWorkspaces()).toEqual([])
  })

  it('overwrites a same-name workspace instead of duplicating it', () => {
    saveWorkspace('research', { viewMode: 'grouped' })
    saveWorkspace('RESEARCH', { viewMode: 'flat' })
    expect(listWorkspaces().length).toBe(1)
    expect(findWorkspace('research').layout.viewMode).toBe('flat')
  })

  it('refuses empty names and survives corrupt storage', () => {
    expect(saveWorkspace('   ', { viewMode: 'flat' })).toBeNull()
    localStorage.setItem('workspaces_v1', '{not json')
    expect(listWorkspaces()).toEqual([])
  })

  it('remembers which workspace is active, and forgets a deleted one', () => {
    saveWorkspace('opening', { viewMode: 'flat' })
    setActiveWorkspace('opening')
    expect(getActiveWorkspace()).toBe('opening')
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('opening')
    deleteWorkspace('opening')
    expect(getActiveWorkspace()).toBeNull()
  })
})

describe('applying a workspace', () => {
  it('calls only the setters it has values and functions for', () => {
    const setters = {
      setListId: vi.fn(), setViewMode: vi.fn(), setSpark: vi.fn(),
      setSparkWindow: vi.fn(), setSort: vi.fn(), setWidgets: vi.fn(),
      navigate: vi.fn(),
    }
    const ws = captureWorkspace(GETTERS, 'opening')
    const applied = applyWorkspace(ws, setters)
    expect(setters.setListId).toHaveBeenCalledWith('megacaps')
    expect(setters.setViewMode).toHaveBeenCalledWith('grouped')
    expect(setters.setSparkWindow).toHaveBeenCalledWith('DAY')
    expect(setters.setWidgets).toHaveBeenCalledWith([
      { type: 'pulse' }, { type: 'markets' }, { type: 'chart', symbol: 'AAPL' },
    ])
    expect(applied).toContain('spark')
    // no setter for these two on this surface — captured, simply not applied
    expect(applied).not.toContain('marketView')
    expect(applyWorkspace(null, setters)).toEqual([])
  })

  it('re-validates on the way out, so a tampered store cannot inject state', () => {
    localStorage.setItem('workspaces_v1', JSON.stringify([
      { v: 1, name: 'evil', capturedAt: 1, layout: { viewMode: 'flat', proxy_url: 'https://x', spark: 'nope' } },
    ]))
    const setSpark = vi.fn()
    const setViewMode = vi.fn()
    applyWorkspace(findWorkspace('evil'), { setSpark, setViewMode })
    expect(setViewMode).toHaveBeenCalledWith('flat')
    expect(setSpark).not.toHaveBeenCalled()
  })

  // A main-board capture stores no listId (normalizeLayout drops the null), so
  // without an explicit reset the landing preference from wherever the user
  // happened to be survives the apply — and `#/` resolves straight back to it
  // (resolveDashboardLanding), so the "main board" workspace never lands on
  // the main board.
  it('returns a board workspace with no named list to the main board', () => {
    const setListId = vi.fn()
    const navigate = vi.fn()
    const ws = captureWorkspace({
      ...GETTERS, listId: () => null, marketView: () => null, researchSymbol: () => null,
    }, 'opening')
    expect(ws.layout.listId).toBeUndefined()
    const applied = applyWorkspace(ws, { setListId, navigate })
    expect(setListId).toHaveBeenCalledWith(null)
    expect(applied).toContain('listId')
    expect(navigate).toHaveBeenCalledWith('#/')
  })

  it('leaves the board alone when the workspace lands somewhere else', () => {
    const setListId = vi.fn()
    for (const layout of [{ researchSymbol: 'MSFT' }, { marketView: 'sectors' }]) {
      applyWorkspace({ v: 1, name: 'x', layout }, { setListId, navigate: vi.fn() })
    }
    expect(setListId).not.toHaveBeenCalled()
  })

  it('routes research first, then a market view, then the board', () => {
    expect(workspaceHash({ researchSymbol: 'MSFT', marketView: 'sectors', listId: 'megacaps' }))
      .toBe('#/research/msft')
    expect(workspaceHash({ marketView: 'sectors', listId: 'megacaps' })).toBe('#/markets/sectors')
    expect(workspaceHash({ listId: 'megacaps' })).toBe('#/watchlists/megacaps')
    expect(workspaceHash({})).toBe('#/')
  })
})

describe('workspace summary line', () => {
  it('reads as one mono line: list · view · sparks · widgets', () => {
    const { layout } = captureWorkspace(GETTERS, 'opening')
    expect(summarizeLayout(layout, { listName: 'megacaps' }))
      .toBe('megacaps · sectors · DAY sparks · 3 widgets')
    expect(summarizeLayout({ viewMode: 'flat', spark: 'off', widgets: [{ type: 'pulse' }] }))
      .toBe('main board · all · no sparks · 1 widget')
    expect(summarizeLayout({})).toBe('main board')
  })

  it('renders capture age in terminal shorthand', () => {
    const now = Date.parse('2026-08-18T12:00:00Z')
    expect(capturedAgo(now - 20_000, now)).toBe('just now')
    expect(capturedAgo(now - 5 * 60_000, now)).toBe('5m ago')
    expect(capturedAgo(now - 3 * 3600_000, now)).toBe('3h ago')
    expect(capturedAgo(now - 4 * 86400_000, now)).toBe('4d ago')
    expect(capturedAgo(null, now)).toBe('')
  })
})

describe('preference export/import', () => {
  it('exports a versioned blob holding only allowlisted layout keys', () => {
    localStorage.setItem('dashboard_spark_v1', 'line')
    localStorage.setItem('dashboard_sort_v1:megacaps', 'change')
    localStorage.setItem('locale_v1', 'zh')
    const blob = exportPreferences()
    expect(blob.v).toBe(PREFERENCES_VERSION)
    expect(typeof blob.exportedAt).toBe('number')
    expect(blob.keys).toEqual({
      dashboard_spark_v1: 'line',
      'dashboard_sort_v1:megacaps': 'change',
      locale_v1: 'zh',
    })
  })

  it('NEVER exports a private endpoint, sync capability or token key', () => {
    localStorage.setItem('proxy_url', 'https://private.example/api')
    localStorage.setItem('watchlist_sync_cap_v1', 'cap-secret-token')
    localStorage.setItem('tape-wire-url', 'https://private.example/wire')
    localStorage.setItem('some_api_token', 'sk-live-123')
    localStorage.setItem('dashboard_spark_v1', 'line')
    const blob = exportPreferences()
    const serialized = JSON.stringify(blob)
    for (const secret of ['proxy_url', 'watchlist_sync_cap_v1', 'tape-wire-url',
                          'some_api_token', 'cap-secret-token', 'private.example', 'sk-live-123']) {
      expect(serialized).not.toContain(secret)
    }
    expect(Object.keys(blob.keys)).toEqual(['dashboard_spark_v1'])
    for (const key of EXPORT_KEYS) {
      expect(key).not.toMatch(/token|cap|url|proxy|secret|key/i)
    }
    expect(EXPORT_KEY_PREFIXES.every((p) => EXPORT_KEYS.some((k) => p.startsWith(k)))).toBe(true)
  })

  it('imports allowlisted keys and rejects everything else — no round trip for secrets', () => {
    const result = importPreferences({
      v: PREFERENCES_VERSION,
      keys: {
        dashboard_view_mode_v1: 'flat',
        'dashboard_sort_v1:megacaps': 'price',
        proxy_url: 'https://attacker.example',
        watchlist_sync_cap_v1: 'stolen-cap',
        __proto__: 'polluted',
        arbitrary_key: 'x',
      },
    })
    expect(result.imported.sort()).toEqual(['dashboard_sort_v1:megacaps', 'dashboard_view_mode_v1'])
    expect(result.rejected).toEqual(expect.arrayContaining(['proxy_url', 'watchlist_sync_cap_v1', 'arbitrary_key']))
    expect(localStorage.getItem('dashboard_view_mode_v1')).toBe('flat')
    expect(localStorage.getItem('proxy_url')).toBeNull()
    expect(localStorage.getItem('watchlist_sync_cap_v1')).toBeNull()
    expect(localStorage.getItem('arbitrary_key')).toBeNull()
    expect(Object.prototype.polluted).toBeUndefined()
  })

  it('rejects a blob from another schema version or of the wrong shape', () => {
    for (const bad of [null, 'nope', {}, { v: 99, keys: { locale_v1: 'zh' } }, { v: 1, keys: null }]) {
      const out = importPreferences(bad)
      expect(out.error).toBeTruthy()
      expect(out.imported).toEqual([])
    }
    expect(localStorage.getItem('locale_v1')).toBeNull()
    // non-string values are data, not preferences
    const out = importPreferences({ v: PREFERENCES_VERSION, keys: { locale_v1: { evil: true } } })
    expect(out.imported).toEqual([])
    expect(out.rejected).toEqual(['locale_v1'])
  })

  it('round-trips saved workspaces themselves', () => {
    saveWorkspace('opening', { viewMode: 'flat' })
    const blob = exportPreferences()
    localStorage.clear()
    importPreferences(blob)
    expect(findWorkspace('opening').layout.viewMode).toBe('flat')
  })
})

describe('bulk widget setter', () => {
  it('replaces the rail in one shot, assigning ids and dropping junk', () => {
    setWidgets([{ type: 'movers' }, { type: 'rootkit' }, { type: 'chart', symbol: 'aapl' }])
    const rail = getWidgets()
    expect(rail.map((w) => w.type)).toEqual(['movers', 'chart'])
    expect(rail[1].symbol).toBe('AAPL')
    expect(new Set(rail.map((w) => w.id)).size).toBe(2)
  })
})

describe('ws command grammar', () => {
  it('parses apply, save, list, rename and delete', () => {
    expect(parseCommand('ws')).toEqual({ type: 'ws_list' })
    expect(parseCommand('ws list')).toEqual({ type: 'ws_list' })
    expect(parseCommand('workspaces')).toEqual({ type: 'ws_list' })
    expect(parseCommand('ws opening')).toEqual({ type: 'ws_apply', name: 'opening' })
    expect(parseCommand('ws event day')).toEqual({ type: 'ws_apply', name: 'event day' })
    expect(parseCommand('ws save opening')).toEqual({ type: 'ws_save', name: 'opening' })
    expect(parseCommand('ws rm opening')).toEqual({ type: 'ws_rm', name: 'opening' })
    expect(parseCommand('ws rename opening / event day'))
      .toEqual({ type: 'ws_rename', from: 'opening', to: 'event day' })
    expect(plain(parseCommand('ws rename nope').text)).toContain('usage')
    expect(plain(parseCommand('ws save').text)).toContain('usage')
  })

  it('completes the verb and documents itself in help', () => {
    for (const verb of ['ws', 'workspace', 'workspaces']) expect(COMMAND_WORDS).toContain(verb)
    expect(completions('w', [])).toContain('ws')
    expect(completions('works', [])).toEqual(expect.arrayContaining(['workspace', 'workspaces']))
    const help = plain(HELP_TEXT)
    expect(help).toContain('ws')
    expect(help).toContain('saved layouts')
  })
})

describe('ws command actions', () => {
  const run = (line) => {
    const printed = []
    executePlan(parseCommand(line), line, { print: (_cmd, text) => printed.push(plain(text)) })
    return printed.join('\n')
  }

  it('saves the live layout, lists it, and applies it without a reload', () => {
    localStorage.setItem('dashboard_view_mode_v1', 'flat')
    localStorage.setItem('dashboard_spark_v1', 'line')
    expect(run('ws save opening')).toContain('opening')
    expect(findWorkspace('opening').layout.viewMode).toBe('flat')
    expect(run('ws list')).toContain('opening')

    localStorage.setItem('dashboard_view_mode_v1', 'grouped')
    const events = []
    const onWs = (e) => events.push(e.detail)
    addEventListener('tape:workspace', onWs)
    const out = run('ws opening')
    removeEventListener('tape:workspace', onWs)
    expect(out).toContain('opening')
    expect(localStorage.getItem('dashboard_view_mode_v1')).toBe('flat')
    expect(events[0].name).toBe('opening')
    expect(getActiveWorkspace()).toBe('opening')
    expect(location.hash).toBe('#/')
  })

  it('says so when the workspace is missing, and deletes on request', () => {
    expect(run('ws ghost')).toContain('no workspace')
    saveWorkspace('opening', { viewMode: 'flat' })
    expect(run('ws rm opening')).toContain('opening')
    expect(listWorkspaces()).toEqual([])
    expect(run('ws list')).toContain('no workspaces')
  })
})

describe('workspaces board control', () => {
  it('sits in the single toolbar row as a compact board control', () => {
    expect(dashboard).toContain('<WorkspacesControl')
    expect(dashboard).toContain("import { WorkspacesControl } from '../components/WorkspacesControl.jsx'")
    // one row: it lives inside the existing controls cluster, no new flex row
    const cluster = dashboard.slice(dashboard.indexOf('class="dashboard-controls'))
    expect(cluster.indexOf('<WorkspacesControl')).toBeGreaterThan(0)
    expect(cluster.indexOf('<WorkspacesControl')).toBeLessThan(cluster.indexOf('</div>\n\n'))
    expect(control).toContain('board-control')
    expect(control).toContain('shrink-0')
  })

  it('is a mono hairline list — amber active row, no cards', () => {
    expect(control).toMatch(/font-mono/)
    expect(control).toMatch(/text-accent/)
    expect(control).toMatch(/border-line/)
    expect(control).not.toMatch(/shadow-lg|rounded-2xl|bg-gradient/)
    expect(control).toContain('summarizeLayout')
    expect(control).toContain('capturedAgo')
  })

  // It shipped on a `ws-pop` class nobody ever wrote, so the panel had no
  // position and laid out inside the toolbar row instead of over it.
  it('anchors on the same popover class as the other toolbar menu', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')
    const cls = control.match(/class="([a-z-]*pop[a-z-]*)/)?.[1]
    expect(cls).toBeTruthy()
    expect(css).toContain(`.${cls} {`)
    expect(cls).toBe('board-menu-pop')
    expect(dashboard).toContain('board-menu-pop')
  })

  it('drives from the keyboard and closes on Escape', () => {
    // the panel takes focus on open, or none of these keys ever reach it
    expect(control).toContain('popRef.current?.focus')
    expect(control).toContain("case 'ArrowDown'")
    expect(control).toContain("case 'ArrowUp'")
    expect(control).toContain("case 'Enter'")
    expect(control).toContain("case 'Escape'")
  })

  it('renders its save/rename prompt through the shared Overlay', () => {
    expect(control).toContain("import { Overlay } from './Overlay.jsx'")
    expect(control).toContain('<Overlay')
    expect(control).not.toContain('window.prompt')
  })

  it('translates its chrome', () => {
    expect(control).toContain("tl('Workspaces')")
    expect(control).toMatch(/tl\('Save as/)
  })
})
