import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  t, tl, getLocale, setLocale, onLocaleChange, hasLabelTranslation,
} from '../../src/lib/i18n.js'

beforeEach(() => setLocale('en'))

describe('t', () => {
  it('returns the en string by default', () => {
    expect(t('common.loading')).toBe('loading…')
  })

  it('switches with the locale', () => {
    setLocale('zh')
    expect(t('common.loading')).toBe('加载中…')
  })

  it('interpolates params', () => {
    expect(t('research.no_insider', { sym: 'SPY' })).toContain('SPY')
  })

  it('falls back to the key for unknown strings', () => {
    expect(t('nope.missing')).toBe('nope.missing')
  })
})

describe('tl', () => {
  it('passes labels through in en', () => {
    expect(tl('Gold')).toBe('Gold')
  })

  it('translates known labels in zh and passes unknown ones through', () => {
    setLocale('zh')
    expect(tl('Gold')).toBe('黄金')
    expect(tl('Some Unknown Label')).toBe('Some Unknown Label')
  })

  it('uses the canonical Chinese market term for watchlists', () => {
    setLocale('zh')
    expect(tl('Watchlists')).toBe('自选股')
    expect(tl('Watchlist')).toBe('自选股')
    expect(tl('Create watchlist')).toBe('新建自选股')
    expect(tl('Watchlist name')).toBe('自选股名称')
  })

  it('covers every literal UI label routed through tl', () => {
    const root = resolve(process.cwd(), 'src')
    const files = readdirSync(root, { recursive: true })
      .filter((name) => /\.(?:js|jsx)$/.test(name) && name !== 'lib/i18n.js')
    const missing = new Set()
    for (const name of files) {
      const source = readFileSync(resolve(root, name), 'utf8')
      for (const match of source.matchAll(/\btl\(\s*(['"])(.*?)\1\s*\)/g)) {
        if (!hasLabelTranslation(match[2])) missing.add(match[2])
      }
    }
    expect([...missing].sort()).toEqual([])
  })
})

describe('locale state', () => {
  it('persists and notifies listeners', () => {
    let seen = null
    const off = onLocaleChange((l) => { seen = l })
    setLocale('zh')
    expect(getLocale()).toBe('zh')
    expect(seen).toBe('zh')
    expect(localStorage.getItem('locale_v1')).toBe('zh')
    off()
  })

  it('ignores unknown locales', () => {
    setLocale('fr')
    expect(getLocale()).toBe('en')
  })

  it('does not resize the page when the locale changes', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')
    expect(css).not.toMatch(/html:lang\(zh-CN\)[^{]*\{[^}]*\bzoom\s*:/)
  })
})
