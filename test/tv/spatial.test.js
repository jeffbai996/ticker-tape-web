import { describe, expect, it } from 'vitest'
import { backAction, nextHashStack, pickNext } from '../../tv/lib/spatial.js'

const box = (id, left, top, width = 100, height = 40) => ({
  id, rect: { left, top, right: left + width, bottom: top + height, width, height },
})

describe('pickNext', () => {
  // A 3x3 grid of 100x40 boxes with 20px gaps.
  const grid = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) grid.push(box(`${r}${c}`, c * 120, r * 60))
  }
  const at = (id) => grid.find((b) => b.id === id).rect

  it('moves one cell in each direction on a grid', () => {
    expect(pickNext(at('11'), grid, 'up').id).toBe('01')
    expect(pickNext(at('11'), grid, 'down').id).toBe('21')
    expect(pickNext(at('11'), grid, 'left').id).toBe('10')
    expect(pickNext(at('11'), grid, 'right').id).toBe('12')
  })

  it('returns null at an edge instead of wrapping', () => {
    expect(pickNext(at('00'), grid, 'up')).toBeNull()
    expect(pickNext(at('02'), grid, 'right')).toBeNull()
  })

  it('never selects the box it starts from', () => {
    expect(pickNext(at('11'), [box('11', 120, 60)], 'down')).toBeNull()
  })

  it('prefers a box in the same column over a nearer one off to the side', () => {
    const from = box('from', 0, 0, 200, 40).rect
    const candidates = [
      box('aligned', 0, 200, 200, 40),
      box('side', 400, 60, 100, 40),
    ]
    expect(pickNext(from, candidates, 'down').id).toBe('aligned')
  })

  it('reaches a box that is offset but still clearly in that direction', () => {
    const from = box('from', 0, 0).rect
    expect(pickNext(from, [box('diag', 150, 300)], 'down').id).toBe('diag')
  })

  it('ignores boxes behind the direction of travel', () => {
    const from = box('from', 0, 100).rect
    expect(pickNext(from, [box('above', 0, 0)], 'down')).toBeNull()
  })

  it('moves between rows of a list whose items overlap by a pixel', () => {
    const rows = [box('a', 0, 0, 600, 41), box('b', 0, 40, 600, 41), box('c', 0, 80, 600, 41)]
    expect(pickNext(rows[0].rect, rows, 'down').id).toBe('b')
    expect(pickNext(rows[1].rect, rows, 'down').id).toBe('c')
    expect(pickNext(rows[2].rect, rows, 'up').id).toBe('b')
  })
})

describe('backAction', () => {
  it('closes the top layer first', () => {
    expect(backAction({ layerOpen: true, textFocused: false, atHome: false })).toBe('close-layer')
  })

  it('leaves a text field before anything else', () => {
    expect(backAction({ layerOpen: true, textFocused: true, atHome: true })).toBe('blur')
  })

  it('steps back through pages, then exits from the home page', () => {
    expect(backAction({ layerOpen: false, textFocused: false, atHome: false })).toBe('history')
    expect(backAction({ layerOpen: false, textFocused: false, atHome: true })).toBe('exit')
  })
})

describe('nextHashStack', () => {
  it('pushes a new page', () => {
    expect(nextHashStack(['#/'], '#/markets')).toEqual(['#/', '#/markets'])
  })

  it('pops when the new hash is the previous page, which is what Back produces', () => {
    expect(nextHashStack(['#/', '#/markets', '#/research/aapl'], '#/markets')).toEqual(['#/', '#/markets'])
  })

  it('ignores a repeat of the current page', () => {
    expect(nextHashStack(['#/', '#/markets'], '#/markets')).toEqual(['#/', '#/markets'])
  })
})
