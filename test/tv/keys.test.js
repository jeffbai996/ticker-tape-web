import { describe, expect, it } from 'vitest'
import { actionForKey, REGISTERED_KEYS } from '../../tv/lib/keys.js'

const key = (keyCode, extra = {}) => ({ keyCode, key: '', ...extra })

describe('TV remote key mapping', () => {
  it('maps the D-pad and Enter to navigation actions', () => {
    expect(actionForKey(key(38))).toBe('up')
    expect(actionForKey(key(40))).toBe('down')
    expect(actionForKey(key(37))).toBe('left')
    expect(actionForKey(key(39))).toBe('right')
    expect(actionForKey(key(13))).toBe('enter')
  })

  it('maps the Samsung Back key to back and leaves Escape to the app', () => {
    expect(actionForKey(key(10009))).toBe('back')
    expect(actionForKey(key(27, { key: 'Escape' }))).toBeNull()
  })

  it('leaves Backspace to text fields', () => {
    expect(actionForKey(key(8, { key: 'Backspace' }))).toBeNull()
  })

  it('maps the four colour keys', () => {
    expect(actionForKey(key(403))).toBe('red')
    expect(actionForKey(key(404))).toBe('green')
    expect(actionForKey(key(405))).toBe('yellow')
    expect(actionForKey(key(406))).toBe('blue')
  })

  it('never treats a typed letter as a colour key', () => {
    expect(actionForKey(key(82, { key: 'r' }))).toBeNull()
    expect(actionForKey(key(71, { key: 'g' }))).toBeNull()
  })

  it('maps channel up and down, and PageUp/PageDown, to page moves', () => {
    expect(actionForKey(key(427))).toBe('pageUp')
    expect(actionForKey(key(428))).toBe('pageDown')
    expect(actionForKey(key(33, { key: 'PageUp' }))).toBe('pageUp')
  })

  it('returns null for keys the remote layer does not handle', () => {
    expect(actionForKey(key(65, { key: 'a' }))).toBeNull()
  })

  it('registers only keys Tizen withholds until asked', () => {
    expect(REGISTERED_KEYS).toContain('ColorF0Red')
    expect(REGISTERED_KEYS).toContain('ChannelUp')
    expect(REGISTERED_KEYS).not.toContain('ArrowUp')
  })
})
