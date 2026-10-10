import { describe, expect, it } from 'vitest'
import { INITIAL_FOCUS, moveFocus, windowStart } from '../../tv/lib/focus.js'

const sizes = { board: 20, rail: 6, page: 8 }

describe('TV focus model', () => {
  it('starts on the first board row', () => {
    expect(INITIAL_FOCUS).toEqual({ zone: 'board', board: 0, rail: 0 })
  })

  it('moves down and up within the board and stops at the ends', () => {
    let f = moveFocus(INITIAL_FOCUS, 'down', sizes)
    expect(f.board).toBe(1)
    f = moveFocus({ ...f, board: 19 }, 'down', sizes)
    expect(f.board).toBe(19)
    f = moveFocus({ ...f, board: 0 }, 'up', sizes)
    expect(f.board).toBe(0)
  })

  it('pages by the visible row count', () => {
    expect(moveFocus(INITIAL_FOCUS, 'pageDown', sizes).board).toBe(8)
    expect(moveFocus({ ...INITIAL_FOCUS, board: 18 }, 'pageDown', sizes).board).toBe(19)
    expect(moveFocus({ ...INITIAL_FOCUS, board: 3 }, 'pageUp', sizes).board).toBe(0)
  })

  it('crosses to the rail on right and back on left, keeping each index', () => {
    let f = moveFocus({ ...INITIAL_FOCUS, board: 5, rail: 2 }, 'right', sizes)
    expect(f.zone).toBe('rail')
    f = moveFocus(f, 'down', sizes)
    expect(f.rail).toBe(3)
    f = moveFocus(f, 'left', sizes)
    expect(f).toEqual({ zone: 'board', board: 5, rail: 3 })
  })

  it('stays on the board when the rail is empty', () => {
    expect(moveFocus(INITIAL_FOCUS, 'right', { ...sizes, rail: 0 }).zone).toBe('board')
  })

  it('moves to the rail when the board is empty', () => {
    expect(moveFocus(INITIAL_FOCUS, 'down', { ...sizes, board: 0 }).zone).toBe('rail')
  })

  it('clamps a stale index after the board shrinks', () => {
    expect(moveFocus({ ...INITIAL_FOCUS, board: 12 }, 'none', { ...sizes, board: 4 }).board).toBe(3)
  })

  it('scrolls the window only when focus leaves it', () => {
    expect(windowStart(0, 0, 20, 8)).toBe(0)
    expect(windowStart(0, 7, 20, 8)).toBe(0)
    expect(windowStart(0, 8, 20, 8)).toBe(1)
    expect(windowStart(10, 9, 20, 8)).toBe(9)
    expect(windowStart(15, 19, 20, 8)).toBe(12)
    expect(windowStart(5, 2, 3, 8)).toBe(0)
  })
})
