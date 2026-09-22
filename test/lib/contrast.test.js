import { it, expect, beforeEach } from 'vitest'
import { getHighContrast, saveHighContrast, activityColor } from '../../src/lib/contrast.js'

beforeEach(() => localStorage.clear())
it('defaults off, applies immediately, persists, and resets', () => {
  expect(getHighContrast()).toBe(false)
  const root = { dataset: { marketColors: 'cn' } }
  saveHighContrast(true, localStorage, root)
  expect(root.dataset).toEqual({ marketColors: 'cn', contrast: 'high' })
  expect(getHighContrast()).toBe(true)
  saveHighContrast(false, localStorage, root)
  expect(root.dataset.contrast).toBe('standard')
  expect(getHighContrast()).toBe(false)
})
it('handles unavailable storage without failing to paint', () => {
  const store = { getItem() { throw Error() }, setItem() { throw Error() } }
  const root = { dataset: {} }
  expect(getHighContrast(store)).toBe(false)
  saveHighContrast(true, store, root)
  expect(root.dataset.contrast).toBe('high')
})
it('distinguishes empty, quiet, moderate and busy intervals', () => {
  expect(new Set([0, 1, 5, 10].map(n => activityColor(n, 10))).size).toBe(4)
  expect(activityColor(0, 0)).toBe('#79828d')
  expect(activityColor(10, 10)).toBe('#ffb000')
})
