import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MdLite } from '../../src/components/AiReport.jsx'

let root
beforeEach(() => { root = document.createElement('div') })
afterEach(() => render(null, root))

function mountMd(text) {
  render(h(MdLite, { text }), root)
  return root
}

describe('report markdown', () => {
  it('renders a bold-only line as a heading, the way local models title sections', () => {
    const heading = mountMd('**Current Setup**\nThe index fell 6%.').firstElementChild
    expect(heading.textContent).toBe('Current Setup')
    expect(heading.className).toContain('text-accent')
    expect(heading.querySelector('b')).toBeNull()
  })

  it('treats a bold label with a trailing colon as a heading too', () => {
    const heading = mountMd('**Bull case:**').firstElementChild
    expect(heading.className).toContain('text-accent')
    expect(heading.textContent).toBe('Bull case:')
  })

  it('keeps bold inside a sentence as inline emphasis', () => {
    const line = mountMd('Price is **below** the 200dma.').firstElementChild
    expect(line.className).not.toContain('text-accent')
    expect(line.querySelector('b').textContent).toBe('below')
  })

  it('reads five and six hash headings as headings', () => {
    expect(mountMd('##### Levels').firstElementChild.textContent).toBe('Levels')
    expect(mountMd('###### Levels').firstElementChild.className).toContain('text-accent')
  })
})
