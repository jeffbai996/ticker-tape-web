import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { ChartMount, chartModuleCache } from '../../src/components/LazyChart.jsx'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

// Preact flushes effects after paint — via requestAnimationFrame where the host
// has one, else a 100ms setTimeout fallback. jsdom has neither by default, so
// the suite installs a rAF that fires on the next macrotask (same trick as
// test/lib/overlay.test.js) and then polls rather than guessing a delay.
const waitFor = async (fn, ms = 2000) => {
  const until = Date.now() + ms
  for (;;) {
    try { return fn() } catch (err) {
      if (Date.now() > until) throw err
      await new Promise((r) => setTimeout(r, 10))
    }
  }
}

// A real static import — `import … 'lightweight-charts'` at the head of a line.
// Deliberately does not match `import('lightweight-charts')` (no whitespace
// after the keyword) or the library's name inside a comment.
const STATIC_IMPORT = /^\s*import\s[^\n]*['"]lightweight-charts['"]/m

describe('the chart library is off the first paint', () => {
  const EAGER = ['src/pages/dashboard.jsx', 'src/pages/portfolio.jsx']

  it.each(EAGER)('%s never imports lightweight-charts statically', (path) => {
    expect(source(path)).not.toMatch(STATIC_IMPORT)
  })

  it.each(EAGER)('%s draws its chart through the lazy boundary', (path) => {
    const src = source(path)
    expect(src).toContain("import { ChartMount } from '../components/LazyChartMount.jsx'")
    expect(src).toContain('<ChartMount')
  })

  it('keeps the only reference to the library dynamic', () => {
    const src = source('src/components/LazyChart.jsx')
    expect(src).toContain("import('lightweight-charts')")
    expect(src).not.toMatch(STATIC_IMPORT)
  })

  // Letting the whole namespace escape the import() costs 22 kB: Rollup can no
  // longer prove which exports are dead and ships every series type.
  it('names the exports it needs so the chunk stays tree-shaken', () => {
    expect(source('src/components/LazyChart.jsx'))
      .toContain('.then(({ createChart, AreaSeries }) => ({ createChart, AreaSeries }))')
  })

  it('keeps the widget options, series, and cleanup that were there before', () => {
    const dash = source('src/pages/dashboard.jsx')
    // The move must not quietly restyle the mini chart or drop its bounds.
    expect(dash).toContain('boundedTimeScale(false)')
    expect(dash).toContain('chart.addSeries(AreaSeries')
    expect(dash).toContain("lineColor: '#f59e0b'")
    expect(dash).toContain('chart.remove()')
    const port = source('src/pages/portfolio.jsx')
    expect(port).toContain('timeScale: boundedTimeScale(false)')
    expect(port).toContain('chart.addSeries(AreaSeries')
    expect(port).toContain('chart.remove()')
  })
})

describe('chartModuleCache', () => {
  it('fetches the module once however many widgets ask for it', async () => {
    let calls = 0
    const mod = { createChart: () => {} }
    const load = chartModuleCache(async () => { calls += 1; return mod })

    const [a, b] = await Promise.all([load(), load()])
    expect(a).toBe(mod)
    expect(b).toBe(mod)
    expect(await load()).toBe(mod)
    expect(calls).toBe(1)
  })

  // Same lesson as LazyPage: a chunk fetch fails when the tab has been open
  // across a deploy and the hashed file is gone. Caching THAT pins every chart
  // on its placeholder until the tab is reloaded.
  it('does not cache a rejection — the next mount may ask again', async () => {
    let calls = 0
    const load = chartModuleCache(async () => {
      calls += 1
      if (calls === 1) throw new Error('Failed to fetch dynamically imported module')
      return { ok: true }
    })

    await expect(load()).rejects.toThrow(/Failed to fetch/)
    expect(await load()).toEqual({ ok: true })
    expect(calls).toBe(2)
  })
})

describe('ChartMount', () => {
  let host = null
  let hadRaf = null

  beforeEach(() => {
    hadRaf = globalThis.requestAnimationFrame
    if (typeof hadRaf !== 'function') {
      globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
      globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
    }
    document.body.innerHTML = '<div id="host"></div>'
    host = document.getElementById('host')
  })

  afterEach(() => {
    render(null, host)
    document.body.innerHTML = ''
    if (typeof hadRaf !== 'function') {
      delete globalThis.requestAnimationFrame
      delete globalThis.cancelAnimationFrame
    }
  })

  const lib = { createChart: () => ({}), AreaSeries: {} }
  const draw = (props) => render(h(ChartMount, {
    load: async () => lib,
    class: 'h-[110px] w-full',
    placeholder: h('span', { class: 'ph' }, 'loading…'),
    ...props,
  }), host)

  it('reserves the widget box before the library lands, and never moves it', async () => {
    draw({ mount: () => {} })
    const box = host.firstElementChild
    expect(box.className).toContain('h-[110px]')
    expect(box.className).toContain('w-full')
    expect(host.querySelector('.ph')).not.toBe(null)

    // The box the caller sized is the same node once the chart is in it.
    await waitFor(() => expect(host.querySelector('.ph')).toBe(null))
    expect(host.firstElementChild).toBe(box)
    expect(box.className).toContain('h-[110px]')
  })

  it('hands the mount callback a real element and the loaded module', async () => {
    const seen = []
    draw({ mount: (el, mod) => { seen.push([el, mod]) } })
    await waitFor(() => expect(seen.length).toBe(1))
    const [el, mod] = seen[0]
    expect(el.isConnected).toBe(true)
    expect(host.contains(el)).toBe(true)
    expect(mod).toBe(lib)
  })

  it('does not re-create a live chart when the widget above it re-renders', async () => {
    const mount = vi.fn(() => () => {})
    draw({ mount, deps: ['AAPL'] })
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1))

    // A fresh `mount` closure every render is exactly what a widget does when
    // a quote ticks; it must not tear the chart down.
    draw({ mount: (...a) => mount(...a), deps: ['AAPL'] })
    draw({ mount: (...a) => mount(...a), deps: ['AAPL'] })
    await new Promise((r) => setTimeout(r, 60))
    expect(mount).toHaveBeenCalledTimes(1)
  })

  it('tears the old chart down and rebuilds it when the deps change', async () => {
    const cleanup = vi.fn()
    const symbols = []
    const mk = (sym) => ({
      mount: () => { symbols.push(sym); return cleanup },
      deps: [sym],
    })
    draw(mk('AAPL'))
    await waitFor(() => expect(symbols).toEqual(['AAPL']))

    draw(mk('MSFT'))
    await waitFor(() => expect(symbols).toEqual(['AAPL', 'MSFT']))
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('runs the chart cleanup on unmount', async () => {
    const cleanup = vi.fn()
    draw({ mount: () => cleanup })
    await waitFor(() => expect(host.querySelector('.ph')).toBe(null))
    render(null, host)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('shows the error node instead of spinning forever when the chunk never lands', async () => {
    render(h(ChartMount, {
      load: async () => { throw new Error('Failed to fetch dynamically imported module') },
      class: 'h-[110px]',
      mount: () => {},
      placeholder: h('span', { class: 'ph' }, 'loading…'),
      error: h('span', { class: 'err' }, 'no chart'),
    }), host)
    await waitFor(() => expect(host.querySelector('.err')).not.toBe(null))
    expect(host.querySelector('.ph')).toBe(null)
    // Still the caller's box: a failed load must not collapse the layout.
    expect(host.firstElementChild.className).toContain('h-[110px]')
  })
})

describe('bundle budget', () => {
  const script = source('scripts/bundle_budget.sh')

  it('holds the entry chunk to the tightened budget', () => {
    expect(script).toContain('BUDGET="${1:-90000}"')
    expect(script).toContain('dist/assets/index-*.js')
  })

  // The entry chunk alone never saw this regression: lightweight-charts sat in
  // its own file that index.html modulepreloaded, so the browser still paid for
  // it on first paint. Budget what the browser actually fetches before paint.
  it('budgets the whole eager first-paint set, not just the entry chunk', () => {
    expect(script).toContain('FIRST_PAINT_BUDGET="${2:-370000}"')
    expect(script).toContain('modulepreload')
    expect(script).toContain('dist/index.html')
  })

  it('stays wired to npm run budget', () => {
    expect(source('package.json')).toContain('"budget": "bash scripts/bundle_budget.sh"')
  })
})
