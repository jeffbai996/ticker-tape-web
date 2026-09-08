import { describe, expect, it } from 'vitest'
import { plainTraceText } from '../../src/lib/chatTrace.js'

describe('plainTraceText', () => {
  it('removes markdown emphasis from compact status copy', () => {
    expect(plainTraceText('**Planning data fetching strategy**'))
      .toBe('Planning data fetching strategy')
    expect(plainTraceText('__Checking the tape__')).toBe('Checking the tape')
  })
})
