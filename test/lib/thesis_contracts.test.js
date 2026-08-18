import { describe, expect, it } from 'vitest'
import { thesisAnalysisPrompt, thesisHealth, thesisSignals } from '../../src/lib/thesis.js'

describe('Thesis Watcher data contracts', () => {
  it('reports GOOD until a recorded breaker fires', () => {
    const good = thesisHealth([
      { verdict: 'CLEAR' }, { verdict: 'INSUFFICIENT_DATA' },
    ])
    expect(good).toMatchObject({ state: 'GOOD', fired: 0, clear: 1, review: 1 })

    expect(thesisHealth([{ verdict: 'FIRED' }, { verdict: 'CLEAR' }]))
      .toMatchObject({ state: 'BREACHED', fired: 1, clear: 1, review: 0 })
  })

  it('uses only Fragwire events tagged as thesis-relevant, newest first', () => {
    const rows = thesisSignals([
      { id: 1, headline: 'Sector chatter', ts_event: 30, meta: { thesis: 1 } },
      { id: 2, headline: 'Earlier core signal', ts_event: 40, meta: { thesis: 2 } },
      { id: 3, headline: 'Latest core signal', ts_event: 50, meta: { thesis: 3 } },
      { id: 4, headline: '', ts_event: 60, meta: { thesis: 3 } },
    ])
    expect(rows.map((row) => row.id)).toEqual([3, 2])
  })

  it('grounds the analysis prompt in supplied conditions and source signals', () => {
    const prompt = thesisAnalysisPrompt(
      [{ id: 'capex_cut', verdict: 'CLEAR', description: 'Capex has not been cut.' }],
      [{ headline: 'Provider maintains capex plan', source: 'newswire', url: 'https://example.com/a' }],
    )
    expect(prompt).toContain('capex_cut [CLEAR]: Capex has not been cut.')
    expect(prompt).toContain('newswire: Provider maintains capex plan (https://example.com/a)')
    expect(prompt).toContain('Do not mark any breaker as fired.')
  })
})
