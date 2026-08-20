import { beforeEach, describe, expect, it } from 'vitest'
import { consumeAlertPrefill } from '../../src/pages/alerts.jsx'


describe('alert prefill handoff', () => {
  beforeEach(() => sessionStorage.clear())

  it('returns the research quote once and clears the handoff', () => {
    sessionStorage.setItem('alert_prefill', JSON.stringify({
      symbol: 'ACME', value: 123.45,
    }))

    expect(consumeAlertPrefill()).toEqual({ symbol: 'ACME', value: 123.45 })
    expect(consumeAlertPrefill()).toEqual({})
    expect(sessionStorage.getItem('alert_prefill')).toBeNull()
  })

  it('fails closed when storage contains malformed data', () => {
    sessionStorage.setItem('alert_prefill', '{bad json')
    expect(consumeAlertPrefill()).toEqual({})
  })
})
