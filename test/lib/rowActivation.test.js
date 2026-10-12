import { describe, expect, it, vi } from 'vitest'
import { rowActivation } from '../../src/lib/rowActivation.js'

function keyEvent(key, { fromChild = false } = {}) {
  const row = {}
  return { key, currentTarget: row, target: fromChild ? {} : row, preventDefault: vi.fn() }
}

describe('rowActivation', () => {
  it('makes the row focusable and announces it as a link', () => {
    const props = rowActivation(() => {})
    expect(props.tabIndex).toBe(0)
    expect(props.role).toBe('link')
  })

  it('activates on click', () => {
    const go = vi.fn()
    rowActivation(go).onClick('click')
    expect(go).toHaveBeenCalledWith('click')
  })

  it('activates on Enter and Space pressed on the row itself', () => {
    const go = vi.fn()
    const { onKeyDown } = rowActivation(go)
    const enter = keyEvent('Enter')
    onKeyDown(enter)
    onKeyDown(keyEvent(' '))
    expect(go).toHaveBeenCalledTimes(2)
    expect(enter.preventDefault).toHaveBeenCalled()
  })

  it('leaves keys from a control inside the row to that control', () => {
    const go = vi.fn()
    const ev = keyEvent('Enter', { fromChild: true })
    rowActivation(go).onKeyDown(ev)
    expect(go).not.toHaveBeenCalled()
    expect(ev.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores other keys', () => {
    const go = vi.fn()
    rowActivation(go).onKeyDown(keyEvent('ArrowDown'))
    expect(go).not.toHaveBeenCalled()
  })
})

describe('rowActivation for rows that expand in place', () => {
  it('announces itself as a button', () => {
    expect(rowActivation(() => {}, { role: 'button' }).role).toBe('button')
  })
})
