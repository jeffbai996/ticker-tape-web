import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SYMBOL_RE, SYMBOL_ANY_CASE_RE } from '../../src/lib/symbols.js'

const src = (name) => readFileSync(resolve(process.cwd(), 'src/lib', name), 'utf8')

describe('canonical symbol validation', () => {
  it('accepts the Yahoo ticker charset in upper case', () => {
    for (const sym of ['NVDA', 'BRK-B', 'BF.B', '^GSPC', 'GC=F', 'BTC-USD', 'A']) {
      expect(SYMBOL_RE.test(sym)).toBe(true)
    }
  })

  it('rejects junk, empties, and over-long input', () => {
    for (const bad of ['', '<script>', 'NV DA', 'NVDA;DROP', 'A'.repeat(13), 'nvda']) {
      expect(SYMBOL_RE.test(bad)).toBe(false)
    }
  })

  it('keeps a case-insensitive variant for the pre-upcase entry points', () => {
    expect(SYMBOL_ANY_CASE_RE.test('nvda')).toBe(true)
    expect(SYMBOL_ANY_CASE_RE.test('NvDa')).toBe(true)
    expect(SYMBOL_ANY_CASE_RE.test('nv da')).toBe(false)
    expect(SYMBOL_ANY_CASE_RE.test('A'.repeat(13))).toBe(false)
  })

  it('is stateless — no /g flag, so shared reuse cannot drift lastIndex', () => {
    expect(SYMBOL_RE.global).toBe(false)
    expect(SYMBOL_ANY_CASE_RE.global).toBe(false)
    expect(SYMBOL_RE.test('NVDA')).toBe(true)
    expect(SYMBOL_RE.test('NVDA')).toBe(true)
  })

  it('leaves no private copies behind in the modules that validate symbols', () => {
    for (const name of ['watchlist.js', 'watchlists.js', 'catalysts.js', 'usergroups.js',
                        'widgets.js', 'route.js', 'tools.js']) {
      const source = src(name)
      expect(source).not.toMatch(/const\s+SYM(?:BOL)?_RE\s*=\s*\//)
      expect(source).toMatch(/from '\.\/symbols\.js'/)
    }
  })
})
