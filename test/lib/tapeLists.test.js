import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAIN_TAPE_OFF, isTapeList, tapeSymbols, toggleTapeList,
} from '../../src/lib/tapeLists.js'

const lists = [{ id: 'a', symbols: ['MU', 'X'] }, { id: 'b', symbols: ['Y', 'X'] }]

beforeEach(() => localStorage.clear())

describe('main tape list preference', () => {
  it('starts enabled, then can be explicitly switched off and back on', () => {
    expect(isTapeList('main')).toBe(true)

    toggleTapeList('main')
    expect(isTapeList('main')).toBe(false)

    toggleTapeList('main')
    expect(isTapeList('main')).toBe(true)
  })
})

describe('tapeSymbols', () => {
  it('is the main list alone when nothing opted in', () => {
    expect(tapeSymbols(['MU', 'Z'], lists, [])).toEqual(['MU', 'Z'])
  })
  it('appends opted-in lists without duplicates, in opt-in order', () => {
    expect(tapeSymbols(['MU'], lists, ['b', 'a'])).toEqual(['MU', 'Y', 'X'])
  })
  it('ignores ids that no longer exist', () => {
    expect(tapeSymbols(['MU'], lists, ['gone'])).toEqual(['MU'])
  })
  it('omits the main list when the reader has switched it off', () => {
    expect(tapeSymbols(['MU', 'Z'], lists, [MAIN_TAPE_OFF])).toEqual([])
    expect(tapeSymbols(['MU', 'Z'], lists, [MAIN_TAPE_OFF, 'a'])).toEqual(['MU', 'X'])
  })
})
