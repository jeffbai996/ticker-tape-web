import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { researchSource } from './researchSource.js'

const research = researchSource()
const screen = readFileSync(resolve(process.cwd(), 'src/pages/screen.jsx'), 'utf8')
const nav = readFileSync(resolve(process.cwd(), 'src/lib/nav.js'), 'utf8')
const earningsDay = readFileSync(resolve(process.cwd(), 'src/components/EarningsDay.jsx'), 'utf8')

describe('options butterfly ladder', () => {
  it('renders one joined ladder, not two sibling tables', () => {
    expect(research).toContain('function OptionsLadder')
    expect(research).not.toContain('function OptionSide')
    // calls mirrored left, puts right, strike spine in the center
    expect(research).toContain("sideTds(row, 'call')")
    expect(research).toContain("sideTds(row, 'put')")
    expect(research).toContain("return side === 'call' ? cells : cells.reverse()")
    expect(research).toContain('colSpan={13}')
  })

  it('prices the expected move from the ATM straddle', () => {
    expect(research).toContain('function straddleSummary')
    // one implementation, in optionsIntel: the strip, the intel panel and the
    // chart bands print the same number only if they call the same function
    expect(research).toContain('const em = expectedMove(chain)')
    expect(research).toContain('movePct: em.pct')
    expect(research).not.toContain('function optMid')
  })

  it('prices the earnings card off that same straddle, not a second one', () => {
    // expmove.js used to carry its own expectedMovePct/mid pair, which chose
    // the nearest call and the nearest put independently — a strangle on any
    // chain whose two sides quote different strikes
    expect(earningsDay).toContain("import { expectedMove } from '../lib/optionsIntel.js'")
    expect(earningsDay).toContain('expectedMove(chain)?.pct')
    expect(earningsDay).not.toContain('expectedMovePct')
    const expmove = readFileSync(resolve(process.cwd(), 'src/lib/expmove.js'), 'utf8')
    expect(expmove).not.toContain('expectedMovePct')
    expect(expmove).not.toContain('export function mid')
  })

  it('replaces the expiry dropdown with a DTE pill row', () => {
    expect(research).toContain('function ExpiryPills')
    expect(research).not.toContain("tl('EXPIRY')")
  })
})

describe('dividends fill the thin surfaces', () => {
  it('research dividends view charts payment history and splits', () => {
    expect(research).toContain('fetchDivHistory(symbol)')
    expect(research).toContain('fetchSplits(symbol)')
    expect(research).toContain("tl('Payment history')")
  })

  it('screening gains a dividends tab wired through nav', () => {
    expect(nav).toContain("{ id: 'dividends', label: 'Dividends' }")
    expect(screen).toContain('function DividendScreen')
    expect(screen).toContain("view === 'dividends' && <DividendScreen")
  })
})
