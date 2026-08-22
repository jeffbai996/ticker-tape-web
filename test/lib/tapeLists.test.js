import { describe, expect, it } from 'vitest'
import { tapeSymbols } from '../../src/lib/tapeLists.js'

const lists = [{ id: 'a', symbols: ['MU', 'X'] }, { id: 'b', symbols: ['Y', 'X'] }]

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
})
