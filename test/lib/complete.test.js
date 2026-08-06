import { describe, expect, it } from 'vitest'
import { completions, applyCompletion, COMMAND_WORDS } from '../../src/lib/complete.js'

const SYMS = ['AAPL', 'AMD', 'NVDA']

describe('completions', () => {
  it('completes a command verb from its prefix', () => {
    expect(completions('jour', SYMS)).toContain('journal')
    expect(completions('ch', SYMS)).toEqual(expect.arrayContaining(['chart', 'chat']))
  })

  it('completes a symbol once a verb is typed', () => {
    expect(completions('chart a', SYMS)).toEqual(['chart AAPL', 'chart AMD'])
  })

  it('offers symbols and verbs together on the first token', () => {
    const out = completions('a', SYMS)
    expect(out).toContain('AAPL')
    expect(out).toContain('alert')
  })

  it('is case-insensitive but keeps each word in its own case', () => {
    expect(completions('NV', SYMS)).toEqual(['NVDA'])
    expect(completions('JOURNAL', SYMS)).toEqual(['journal'])
  })

  it('returns nothing for an empty or exhausted prefix', () => {
    expect(completions('', SYMS)).toEqual([])
    expect(completions('zzzz', SYMS)).toEqual([])
  })

  it('knows the whole documented grammar', () => {
    for (const verb of ['chart', 'alert', 'watch', 'journal', 'backtest', 'brief'])
      expect(COMMAND_WORDS).toContain(verb)
  })
})

describe('applyCompletion', () => {
  // tab completes to the longest shared prefix rather than guessing which
  // of several matches the user meant
  it('extends to the common prefix when several match', () => {
    expect(applyCompletion('jo', ['journal', 'journey'])).toBe('journ')
  })

  it('completes fully and adds a space when only one matches', () => {
    expect(applyCompletion('jour', ['journal'])).toBe('journal ')
  })

  it('replaces only the last token', () => {
    expect(applyCompletion('chart nv', ['chart NVDA'])).toBe('chart NVDA ')
  })

  it('leaves the line alone when nothing matches', () => {
    expect(applyCompletion('zzz', [])).toBe('zzz')
  })
})
