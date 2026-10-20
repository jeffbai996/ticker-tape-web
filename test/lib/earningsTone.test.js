// @vitest-environment node
import { expect, it } from 'vitest'
import { earningsTone } from '../../src/lib/earningsTone.js'

it('marks a report today as imminent', () => {
  expect(earningsTone(0)).toBe('text-imminent font-bold')
})
it('turns red inside a week using the locale-independent danger colour', () => {
  expect(earningsTone(1)).toBe('text-danger')
  expect(earningsTone(7)).toBe('text-danger')
})
it('stays amber inside three weeks and neutral beyond', () => {
  expect(earningsTone(8)).toBe('text-accent')
  expect(earningsTone(21)).toBe('text-accent')
  expect(earningsTone(22)).toBe('text-ink-2')
})
