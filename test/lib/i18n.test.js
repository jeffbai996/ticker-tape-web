import { describe, it, expect, beforeEach } from 'vitest'
import { t, tl, getLocale, setLocale, onLocaleChange } from '../../src/lib/i18n.js'

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
})
