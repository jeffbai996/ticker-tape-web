import { h, render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusPill } from '../../src/components/StatusPill.jsx'

const root = document.createElement('div')
afterEach(() => render(null, root))

function classesFor(tone) {
  render(h(StatusPill, { tone }, 'x'), root)
  return root.firstChild.className.split(/\s+/)
}

describe('status pill colors', () => {
  it('keeps fired and clear off the swappable gain/loss palette', () => {
    for (const tone of ['fired', 'clear']) {
      const classes = classesFor(tone)
      expect(classes.some((c) => /-(up|down)(\/|$)/.test(c))).toBe(false)
    }
  })

  it('paints fired with the fixed alarm color and clear with the fixed healthy color', () => {
    expect(classesFor('fired')).toContain('bg-bad')
    expect(classesFor('clear')).toContain('text-good')
  })
})
