import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { researchSource } from './researchSource.js'

const src = researchSource()
const route = fs.readFileSync('src/lib/route.js', 'utf8')

describe('research tab shortcuts', () => {
  it('gives dividends the key past 0 rather than leaving it mouse-only', () => {
    expect(src).toContain("'filings', 'profile',\n                   'dividends']")
    expect(src).toContain("if (e.key !== '-' && !/^[0-9]$/.test(e.key)) return")
    expect(src).toContain("const i = e.key === '-' ? 10 : e.key === '0' ? 9 : Number(e.key) - 1")
  })

  it('prints the hint the keyboard actually honours', () => {
    expect(src).toContain("{ti < 10 ? (ti + 1) % 10 : '-'})")
    expect(src).toContain('{ti < 11 && (')
  })

  it('keeps [ / ] cycling on whatever subview is open, dividends included', () => {
    // the walk rebuilds the hash with the CURRENT view, so a tab only stays
    // put if route.js still recognises it
    expect(src).toContain("location.hash = `#/research/${next.toLowerCase()}${route.view ? '/' + route.view : ''}`")
    expect(route).toContain("'dividends'")
  })
})

describe('research quote header', () => {
  it('says so when the quote feed has gone quiet', () => {
    expect(src).toContain('function StaleQuoteTag()')
    // the lane moved a directory deeper — same import, re-pointed path
    expect(src).toContain("import { lastGoodTs } from '../../lib/feed.js'")
    expect(src).toContain('<StaleQuoteTag />')
    // same 5-minute threshold and tone as the sidebar's banner
    expect(src).toContain('if (mins < 5) return null')
    expect(src).toContain("⚠ {tl('STALE')}")
  })
})

describe('dead code', () => {
  it('drops the unused symbol wire view', () => {
    expect(src).not.toContain('SymbolWireView')
    expect(src).not.toContain('research.no_wire_config')
    expect(src).not.toContain('research.wire_unreachable')
  })
})
