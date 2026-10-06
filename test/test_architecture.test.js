import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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

  it('runs tests before the build and browser smoke that gate publication', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8')
    const commands = workflow.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
    const stages = ['npm ci', 'npm test', 'npm run build', 'npm run probe', 'actions/deploy-pages@']
    const offsets = stages.map((stage) => commands.indexOf(stage))
    expect(offsets.every((offset) => offset >= 0)).toBe(true)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    expect(commands).toContain('pull_request:')
  })

  it('cloud sync starts only in the private build and is not bundled into the public one', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.jsx'), 'utf8')
    // gated behind the build flag AND dynamically imported, so the sync
    // modules are absent from the public bundle rather than merely inert
    expect(main).toMatch(/if \(import\.meta\.env\.VITE_PRIVATE === '1'\)/)
    expect(main).toMatch(/import\('\.\/lib\/portfolioSync\.js'\)/)
    expect(main).not.toMatch(/^import .*portfolioSync\.js'/m)
  })

  it('family sync is gone: no build flag, capability, or worker route remains', () => {
    // Removed 2026-10-06. The public build must never carry private data.
    for (const file of ['src/main.jsx', 'src/lib/nav.js', 'src/lib/cloudsave.js', 'src/lib/portfolioSync.js', 'vite.config.js', 'worker/worker.js']) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).not.toMatch(/VITE_FAMILY_BUILD|VITE_SYNC_CAPABILITY|FAMILY_SYNC_TOKEN|Bearer /)
    }
    for (const file of ['src/lib/watchlistSync.js', 'worker/capdoc.js', 'worker/portfolios.js', 'worker/watchlists.js', 'scripts/deploy_family.sh', 'scripts/backup_portfolios.py']) {
      expect(existsSync(resolve(process.cwd(), file)), file).toBe(false)
    }
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

  it('does not log every market-data invocation', () => {
    const config = readFileSync(resolve(process.cwd(), 'worker/wrangler.toml'), 'utf8')
    const logConfig = config.match(/\[observability\.logs\]([\s\S]*?)(?:\n\[|$)/)?.[1] || ''
    expect(config).toMatch(/\[observability\][\s\S]*enabled\s*=\s*true/)
    expect(logConfig).toMatch(/head_sampling_rate\s*=\s*1/)
    expect(logConfig).toMatch(/invocation_logs\s*=\s*false/)
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

// A private ticker list once lived in a test here. It is retired, and only a
// digest of its sorted contents is kept, so this file cannot be what leaks it.
// A run of RETIRED_SIZE consecutive HK / Shanghai / Shenzhen tickers in any
// source file, in any order, whose sorted contents hash to RETIRED_SHA256
// fails the suite. The failure names the file, never the tickers.
const RETIRED_SIZE = 20
const RETIRED_SHA256 = 'd0971e8f60388babdf533c473c44473e3a788629ff53a2fad494ddf3b0e2248f'

const TICKER = /\b\d{4,6}\.(?:HK|SS|SZ)\b/gi
const SCAN_ROOTS = ['src', 'test', 'scripts', 'docs', 'worker', 'public', 'README.md', 'CLAUDE.md']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])
const TEXT_FILE = /\.(?:js|jsx|mjs|cjs|json|md|py|sh|txt|csv|html|css|toml|ya?ml)$/i
const MAX_SCAN_BYTES = 8 * 1024 * 1024

// brokers print Hong Kong codes zero-padded to five digits ("00700.HK")
const canonicalTicker = (raw) => {
  const s = raw.toUpperCase()
  return s.endsWith('.HK') ? s.replace(/^0+(?=\d{4}\.)/, '') : s
}

const tickerDigest = (tickers) => createHash('sha256').update([...tickers].sort().join(',')).digest('hex')

/** Does `text` hold `size` consecutive tickers whose sorted list hashes to `sha`? */
function holdsTickerSet(text, sha, size) {
  const found = (text.match(TICKER) || []).map(canonicalTicker)
  for (let i = 0; i + size <= found.length; i += 1) {
    if (tickerDigest(found.slice(i, i + size)) === sha) return true
  }
  return false
}

function* scanFiles(path) {
  let info
  try { info = statSync(path) } catch { return }
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) {
      if (!SKIP_DIRS.has(name)) yield* scanFiles(join(path, name))
    }
  } else if (TEXT_FILE.test(path) && info.size <= MAX_SCAN_BYTES) {
    yield path
  }
}

describe('retired private ticker list', () => {
  const sample = ['0005.HK', '600519.SS', '000001.SZ']

  it('stores a well-formed digest, not a ticker list', () => {
    expect(RETIRED_SHA256).toMatch(/^[0-9a-f]{64}$/)
    expect(RETIRED_SIZE).toBeGreaterThan(1)
  })

  it('finds a listed set in any order, with other text around it', () => {
    const text = "// noise 9988.HK\nconst a = ['000001.SZ', '0005.HK', '600519.SS']\n// 300750.SZ"
    expect(holdsTickerSet(text, tickerDigest(sample), 3)).toBe(true)
  })

  it('reads a broker-padded or lower-case code as the same ticker', () => {
    expect(holdsTickerSet("['00005.HK', '600519.SS', '000001.sz']", tickerDigest(sample), 3)).toBe(true)
  })

  it('ignores a near miss and a partial set', () => {
    expect(holdsTickerSet("['0005.HK', '600519.SS', '9988.HK']", tickerDigest(sample), 3)).toBe(false)
    expect(holdsTickerSet("['0005.HK', '600519.SS']", tickerDigest(sample), 3)).toBe(false)
  })

  it('keeps the retired list out of every source file', () => {
    const offenders = []
    let scanned = 0
    for (const root of SCAN_ROOTS) {
      for (const file of scanFiles(join(process.cwd(), root))) {
        scanned += 1
        if (holdsTickerSet(readFileSync(file, 'utf8'), RETIRED_SHA256, RETIRED_SIZE)) {
          offenders.push(relative(process.cwd(), file))
        }
      }
    }
    expect(scanned).toBeGreaterThan(100)   // the scan really walked the tree
    expect(offenders).toEqual([])
  })
})
