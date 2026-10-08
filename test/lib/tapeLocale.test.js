/** The tape can read in a language of its own (Jeff 2026-10-08: "add a selector
 *  for ticker tape language in the settings menu so that the user can override
 *  the tape language"). By default it follows the app. */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '../../src/lib/i18n.js'
import { getTapeLocaleSetting, onTapeLocaleChange, setTapeLocaleSetting, tapeLocale } from '../../src/lib/tapeLocale.js'
import { loadZhTable, tapeName } from '../../src/lib/zhNames.js'

beforeAll(async () => { await loadZhTable() })
beforeEach(() => { localStorage.clear(); setLocale('en') })

describe('tape language', () => {
  it('follows the app until the reader picks one', () => {
    expect(getTapeLocaleSetting()).toBe('auto')
    expect(tapeLocale()).toBe('en')
    setLocale('zh')
    expect(tapeLocale()).toBe('zh')
  })
  it('a chosen language holds whatever the app is set to', () => {
    setTapeLocaleSetting('zh')
    expect(tapeLocale()).toBe('zh')
    setLocale('zh')
    setTapeLocaleSetting('en')
    expect(tapeLocale()).toBe('en')
  })
  it('ignores a value it does not know', () => {
    setTapeLocaleSetting('fr')
    expect(getTapeLocaleSetting()).toBe('auto')
  })
  it('tells listeners when the choice changes', () => {
    const seen = vi.fn()
    const off = onTapeLocaleChange(seen)
    setTapeLocaleSetting('zh')
    off()
    setTapeLocaleSetting('en')
    expect(seen).toHaveBeenCalledTimes(1)
  })
  it('drives the names the tape shows', () => {
    setTapeLocaleSetting('zh')
    expect(tapeName('NVDA')).toBe('英伟达')
    setLocale('zh')
    setTapeLocaleSetting('en')
    expect(tapeName('NVDA')).toBeNull()
  })
})
