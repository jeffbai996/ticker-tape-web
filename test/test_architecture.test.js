import { readFileSync, readdirSync } from 'node:fs'
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
})
