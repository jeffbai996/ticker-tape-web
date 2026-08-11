// Source-contract tests: the cap and the drop are enforced in the libs (tested
// there), but the whole point of this pass is that the user SEES the refusal.
// Preact pages aren't mounted anywhere in this suite, so — same idiom as
// dashboard_row.test.js — the guarantee we can hold is that each surface still
// wires a visible notice to its failed add.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
const screen = read('src/pages/screen.jsx')
const watchlists = read('src/pages/watchlists.jsx')
const sidebar = read('src/components/Sidebar.jsx')
const dashboard = read('src/pages/dashboard.jsx')
const i18n = read('src/lib/i18n.js')

describe('screen symbol cap', () => {
  it('reports how many typed symbols the 8-slot screen dropped', () => {
    expect(screen).toContain('const kept = unique.slice(0, MAX_SCREEN_SYMBOLS)')
    expect(screen).toContain('dropped: unique.length - kept.length')
    expect(screen).toContain('const { symbols, dropped } = useMemo(() => parseSymbols(raw), [raw])')
    expect(screen).toContain('<SymbolInput value={raw} onChange={update} dropped={dropped} />')
  })

  it('renders the +N hint next to the input, in the watchlist chip idiom', () => {
    expect(screen).toContain('+{dropped} {tl(\'dropped\')}')
  })
})

describe('watchlist cap notices', () => {
  it('names the cap once, translated, with the max interpolated', () => {
    expect(i18n).toContain("'watchlists.full': {")
    expect(i18n).toMatch(/'watchlists\.full': \{[\s\S]*?\{max\}[\s\S]*?zh:[^\n]*\{max\}/)
  })

  it('tells the dashboard add row that the board is full, not that SYM is junk', () => {
    expect(dashboard).toContain('function AddSymbolRow({ onAdd, isPresent, isFull, cap })')
    expect(dashboard).toContain("tt('watchlists.full', { max: cap })")
    expect(dashboard).toContain('<AddSymbolRow onAdd={addSymbol} isPresent={isPresent} isFull={listFull} cap={listCap} />')
  })

  it('surfaces a refused add from the toolbar search dropdown', () => {
    expect(dashboard).toContain('const [notice, setNotice] = useState(\'\')')
    expect(dashboard).toMatch(/notice && \([\s\S]{0,200}text-down/)
  })

  it('gives the sidebar rail its own refusal line', () => {
    expect(sidebar).toContain('function AddSymbol({ onAdd, isFull, cap })')
    expect(sidebar).toContain("tt('watchlists.full', { max: cap })")
    expect(sidebar).toMatch(/err && <span[^>]*text-down/)
  })

  it('keeps a symbol on its source list when the destination is full', () => {
    // send() used to add-then-remove unconditionally: a full destination ate
    // the add and the remove still fired, deleting the ticker outright.
    expect(watchlists).toContain('if (!addTo(destId, symbol) && destFull())')
    expect(watchlists).toMatch(/notice && <div[^>]*text-down/)
  })
})

describe('export feedback', () => {
  it('flags a failed execCommand copy instead of resetting to idle', () => {
    expect(watchlists).toContain("try { if (document.execCommand('copy')) flash(); else fail() } catch { fail() }")
    expect(watchlists).not.toContain("try { if (document.execCommand('copy')) flash() } catch")
  })
})
