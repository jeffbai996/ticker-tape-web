// @vitest-environment node
import { expect, it } from 'vitest'
import { earningsTone } from '../../src/lib/earningsTone.js'

it('marks a report today as imminent', () => {
  expect(earningsTone(0)).toBe('text-imminent font-bold')
})
it('turns bold red within three days using the locale-independent danger colour', () => {
  expect(earningsTone(1)).toBe('text-danger font-bold')
  expect(earningsTone(3)).toBe('text-danger font-bold')
})
it('turns orange for the rest of the week', () => {
  expect(earningsTone(4)).toBe('text-soon')
  expect(earningsTone(7)).toBe('text-soon')
})
it('stays amber inside three weeks and neutral beyond', () => {
  expect(earningsTone(8)).toBe('text-accent')
  expect(earningsTone(21)).toBe('text-accent')
  expect(earningsTone(22)).toBe('text-ink-2')
})
