import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'


const ROOT = resolve(process.cwd(), 'test')

// Existing source-contract debt. New test files must exercise exports or a
// rendered surface; removing an entry is deliberately easy as each old suite
// is converted.
const SOURCE_CONTRACT_ALLOWLIST = new Set([
  'compile.test.js',
  'lib/ai_controls.test.js',
  'lib/archive.test.js',
  'lib/cap_notices.test.js',
  'lib/chartScale.test.js',
  'lib/chartsuite-drawings.test.js',
  'lib/chat_rail.test.js',
  'lib/chat_text_zoom.test.js',
  'lib/commandbar.test.js',
  'lib/console_store.test.js',
  'lib/dialog.test.js',
  'lib/event_workspace.test.js',
  'lib/feedSymbols.test.js',
  'lib/feed_cadence.test.js',
  'lib/feed_focus.test.js',
  'lib/feed_indicator.test.js',
  'lib/i18n.test.js',
  'lib/idle_cpu.test.js',
  'lib/inview.test.js',
  'lib/lazy_chart.test.js',
  'lib/lazy_routes.test.js',
  'lib/markets_visual.test.js',
  'lib/marquee.test.js',
  'lib/mobile_search.test.js',
  'lib/mobile_typography.test.js',
  'lib/mobile_viewport.test.js',
  'lib/options_ladder.test.js',
  'lib/portfolio_accounts.test.js',
  'lib/public_parity.test.js',
  'lib/pwa.test.js',
  'lib/quoteColumns.test.js',
  'lib/research_header.test.js',
  'lib/research_split.test.js',
  'lib/research_tabs.test.js',
  'lib/shell_nav.test.js',
  'lib/statusbar_mobile.test.js',
  'lib/symbol_re.test.js',
  'lib/thesis_view.test.js',
  'lib/thread_ui.test.js',
  'lib/tickFlash.test.js',
  'lib/visibility.test.js',
  'lib/watchlist_card_navigation.test.js',
  'lib/watchlist_export.test.js',
  'lib/wire_layout.test.js',
  'lib/wire_mirror.test.js',
  'lib/wire_recovery.test.js',
])

function testFiles(dir = ROOT) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return testFiles(path)
    return entry.name.endsWith('.test.js') ? [path] : []
  })
}

describe('test architecture', () => {
  it('does not add source-text contract suites outside the debt ledger', () => {
    const sourceContracts = testFiles()
      .filter((path) => path !== resolve(ROOT, 'test_architecture.test.js'))
      .filter((path) => /readFileSync|researchSource\(|researchFiles\(/.test(
        readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path).replaceAll('\\', '/'))
      .sort()

    expect(sourceContracts).toEqual([...SOURCE_CONTRACT_ALLOWLIST].sort())
  })

  it('the public deploy carries NO family capability — it did until 2026-08-25, which put the shared bearer in a world-readable bundle', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8')
    // Judge the steps, not the prose: the comment above the build step names
    // both variables precisely so this can never quietly come back.
    const steps = workflow.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
    // This is the regression that matters. The family build moved to its own
    // host; if either of these comes back, the public bundle leaks the
    // capability to the family portfolio book again.
    expect(steps).not.toMatch(/VITE_FAMILY_BUILD/)
    expect(steps).not.toMatch(/VITE_SYNC_CAPABILITY/)
    expect(steps).not.toMatch(/secrets\.SYNC_CAPABILITY/)
  })

  it('capability sync starts only in builds that have a capability', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.jsx'), 'utf8')
    // gated behind the build flags AND dynamically imported, so the portfolio
    // sync module is absent from the public bundle rather than merely inert
    expect(main).toMatch(/VITE_FAMILY_BUILD === '1' \|\| import\.meta\.env\.VITE_PRIVATE === '1'/)
    expect(main).toMatch(/import\('\.\/lib\/portfolioSync\.js'\)/)
    expect(main).not.toMatch(/^import .*portfolioSync\.js'/m)
  })

  it('the capability still rides the header transport and is never a literal', () => {
    const sync = readFileSync(resolve(process.cwd(), 'src/lib/watchlistSync.js'), 'utf8')
    expect(sync).toContain('import.meta.env.VITE_SYNC_CAPABILITY')
    expect(sync).not.toMatch(/[a-f0-9]{32}/)          // never a literal value
    // capability never in a URL — it would land in access logs and history
    expect(sync).toContain('Bearer ')
    expect(sync).not.toMatch(/watchlists\/\$\{/)
  })

  it('this public repo does not redistribute a proprietary font', () => {
    // The Anthropic Sans woff2 was committed here and served from the public
    // site until 2026-08-25 (Jeff: "do not use Anth sans in the public
    // build"). The UI face is the Google-linked Plus Jakarta Sans instead.
    const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')
    expect(css).not.toMatch(/font-family:\s*"Anthropic Sans"/)
    expect(css).not.toMatch(/AnthropicSans/)
    expect(existsSync(resolve(process.cwd(), 'public/fonts'))).toBe(false)
  })

  it('keeps paid AI routes out of the public Worker bundle', () => {
    const source = readFileSync(resolve(process.cwd(), 'worker/worker.js'), 'utf8')
    expect(source).not.toContain("from './chat.js'")
    expect(source).toContain("return jsonResp({ error: 'Not found' }, 404)")
  })
})

describe('research rail scroll container', () => {
  // A max-h flex column shrinks its children before it scrolls, because each
  // card's overflow-hidden zeroes the automatic min-height. The AI report card
  // collapsed to a 24px sliver this way (2026-08-21). shrink-0 must travel
  // with the max-h/overflow pair.
  it('rail cards are shrink-proof inside the sticky scroll column', () => {
    const rail = readFileSync(resolve(process.cwd(), 'src/pages/research/rail.jsx'), 'utf8')
    const wrapper = rail.split('\n').find((l) => l.includes('data-research-rail-modules'))
    expect(wrapper).toBeTruthy()
    if (wrapper.includes('max-h-') || wrapper.includes('overflow-y-auto')) {
      expect(wrapper).toContain('shrink-0')
    }
  })
})
