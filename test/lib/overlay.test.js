import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Overlay } from '../../src/components/Overlay.jsx'

// Behavioural cover for the shared overlay primitive. Written with h() rather
// than JSX because the vitest config carries no JSX transform — the rest of the
// suite tests logic modules and source contracts.

const flush = () => new Promise((resolve) => setTimeout(resolve, 25))
let host = null

beforeEach(() => {
  document.body.innerHTML = '<button id="opener">open</button><div id="host"></div>'
  host = document.getElementById('host')
})

afterEach(() => {
  render(null, host)
  document.body.innerHTML = ''
})

const open = async (props = {}, children = []) => {
  render(h(Overlay, { onClose: () => {}, label: 'test dialog', ...props }, children), host)
  await flush()
  return host.querySelector('[role="dialog"]')
}

describe('Overlay', () => {
  it('announces itself as a labelled modal dialog', async () => {
    const dialog = await open({ label: 'Chat sessions' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Chat sessions')
  })

  it('prefers a labelling element over a bare label', async () => {
    const dialog = await open({ label: 'ignored', labelledBy: 'title-id' })
    expect(dialog.getAttribute('aria-labelledby')).toBe('title-id')
    expect(dialog.hasAttribute('aria-label')).toBe(false)
  })

  it('moves focus into the dialog and returns it to the opener on close', async () => {
    const opener = document.getElementById('opener')
    opener.focus()
    await open({}, [h('button', { id: 'inside' }, 'a')])
    expect(document.activeElement.id).toBe('inside')
    render(null, host)
    await flush()
    expect(document.activeElement.id).toBe('opener')
  })

  it('focuses the panel itself when it holds nothing focusable', async () => {
    const dialog = await open({}, ['just text'])
    expect(document.activeElement).toBe(dialog)
  })

  it('closes on Escape and on a backdrop click, but not on a click inside', async () => {
    const onClose = vi.fn()
    const dialog = await open({ onClose }, [h('button', { id: 'inside' }, 'a')])
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    document.getElementById('inside').click()
    expect(onClose).toHaveBeenCalledTimes(1)

    dialog.parentElement.click()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('honours a surface that opted out of Escape and backdrop dismissal', async () => {
    const onClose = vi.fn()
    const dialog = await open({ onClose, closeOnEscape: false, closeOnBackdrop: false })
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    dialog.parentElement.click()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cycles Tab inside the dialog', async () => {
    const dialog = await open({}, [
      h('button', { id: 'first' }, 'one'),
      h('button', { id: 'last' }, 'two'),
    ])
    const last = document.getElementById('last')
    last.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    dialog.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement.id).toBe('first')

    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    dialog.dispatchEvent(back)
    expect(document.activeElement.id).toBe('last')
  })

  it('contains page scroll while open and restores it on close', async () => {
    document.body.style.overflow = 'auto'
    await open({})
    expect(document.body.style.overflow).toBe('hidden')
    render(null, host)
    await flush()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('applies transition classes only when the user tolerates motion', async () => {
    const real = globalThis.matchMedia
    globalThis.matchMedia = () => ({ matches: false })
    let dialog = await open({ class: 'panel', motionClass: 'transition-opacity' })
    expect(dialog.getAttribute('class')).toBe('panel transition-opacity')
    expect(dialog.hasAttribute('data-reduced-motion')).toBe(false)

    render(null, host)
    globalThis.matchMedia = () => ({ matches: true })
    dialog = await open({ class: 'panel', motionClass: 'transition-opacity' })
    expect(dialog.getAttribute('class')).toBe('panel')
    expect(dialog.getAttribute('data-reduced-motion')).toBe('true')
    globalThis.matchMedia = real
  })

  it('leaves page scroll alone for a bare panel with no scrim', async () => {
    document.body.style.overflow = 'auto'
    const dialog = await open({ backdrop: false, class: 'rail' })
    expect(document.body.style.overflow).toBe('auto')
    // the panel is the whole overlay — no backdrop element wraps it
    expect(dialog.parentElement).toBe(host)
  })
})
