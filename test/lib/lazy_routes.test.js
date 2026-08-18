import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, h } from 'preact'
import { lazyPage } from '../../src/components/LazyPage.jsx'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

const LAZY_ROUTES = [
  ['watchlists', 'WatchlistsPage'],
  ['markets', 'Markets'],
  ['research', 'Research'],
  ['screen', 'Screen'],
  ['alerts', 'Alerts'],
  ['portfolio', 'Portfolio'],
  ['chat', 'Chat'],
  ['chatPreview', 'ChatPreview'],
  ['brief', 'Brief'],
  ['wire', 'Wire'],
  ['console', 'ConsolePage'],
]

// preact defers effects to a frame; poll rather than guess a delay
async function waitFor(fn, ms = 2000) {
  const until = Date.now() + ms
  for (;;) {
    try { return fn() } catch (err) {
      if (Date.now() > until) throw err
      await new Promise((r) => setTimeout(r, 10))
    }
  }
}

describe('route-level code splitting', () => {
  const pages = source('src/pages/index.jsx')

  it.each(LAZY_ROUTES)('loads the %s page from its own chunk', (file, name) => {
    expect(pages).toContain(`lazyPage(() => import('./${file}.jsx').then((m) => m.${name}))`)
    expect(pages).not.toContain(`import { ${name} } from './${file}.jsx'`)
  })

  it('keeps the landing dashboard in the entry chunk', () => {
    expect(pages).toContain("import { Dashboard } from './dashboard.jsx'")
    expect(pages).not.toContain("import('./dashboard.jsx')")
  })

  it('keeps a measurable budget on the entry chunk', () => {
    const script = source('scripts/bundle_budget.sh')
    expect(script).toContain('BUDGET="${1:-420000}"')
    expect(script).toContain('dist/assets/index-*.js')
    expect(source('package.json')).toContain('"budget": "bash scripts/bundle_budget.sh"')
  })

  it('keeps the shell and the command grammar eager', () => {
    const app = source('src/app.jsx')
    const bar = source('src/components/CommandBar.jsx')
    for (const line of ['StatusBar', 'Tape', 'Sidebar', 'CommandBar', 'Palette']) {
      expect(app).toContain(`import { ${line}`)
    }
    expect(app).not.toContain('import(')
    expect(bar).toContain("from '../lib/commands.js'")
    expect(bar).toContain("from '../lib/complete.js'")
    expect(bar).toContain("from '../lib/execute.js'")
    expect(bar).not.toContain('import(')
  })
})

describe('lazyPage', () => {
  it('shows a loading state, then the page, then renders it synchronously', async () => {
    let loads = 0
    const Page = lazyPage(async () => {
      loads += 1
      return ({ sym }) => h('div', { class: 'page' }, sym)
    })

    const host = document.createElement('div')
    render(h(Page, { sym: 'SPY' }), host)
    expect(host.textContent).toContain('loading')
    expect(host.querySelector('.page')).toBe(null)

    await waitFor(() => expect(host.querySelector('.page')?.textContent).toBe('SPY'))

    // Re-entry (back button, tab switch) must not flash the fallback again.
    const second = document.createElement('div')
    render(h(Page, { sym: 'QQQ' }), second)
    expect(second.querySelector('.page').textContent).toBe('QQQ')
    expect(loads).toBe(1)
  })
})
