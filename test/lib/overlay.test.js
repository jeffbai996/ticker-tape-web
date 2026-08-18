import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Overlay } from '../../src/components/Overlay.jsx'

// Behavioural cover for the shared overlay primitive. Written with h() rather
// than JSX because the vitest config carries no JSX transform — the rest of the
// suite tests logic modules and source contracts.

// Preact flushes effects after paint: via requestAnimationFrame when the
// host has one, else a 100ms setTimeout fallback. jsdom has no rAF, so a 25ms
// flush raced that fallback and the focus assertions flaked under a loaded
// suite. Give the environment a rAF that fires on the next macrotask and the
// effects land deterministically before flush() resolves.
const flush = () => new Promise((resolve) => setTimeout(resolve, 40))
// poll a condition instead of trusting one flush — a loaded suite can hold
// a macrotask well past the effect window
const waitFor = async (pred, ms = 800) => {
  const t0 = Date.now()
  while (!pred()) {
    if (Date.now() - t0 > ms) return false
    await new Promise((r) => setTimeout(r, 10))
  }
  return true
}
let host = null
let hadRaf = null

beforeEach(() => {
  hadRaf = globalThis.requestAnimationFrame
  if (typeof hadRaf !== 'function') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  }
  document.body.innerHTML = '<button id="opener">open</button><div id="host"></div>'
  host = document.getElementById('host')
})

afterEach(() => {
  render(null, host)
  document.body.innerHTML = ''
  if (typeof hadRaf !== 'function') {
    delete globalThis.requestAnimationFrame
    delete globalThis.cancelAnimationFrame
  }
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
    await waitFor(() => document.activeElement?.id === 'inside')
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
    expect(await waitFor(() => document.body.style.overflow === 'hidden')).toBe(true)
    render(null, host)
    expect(await waitFor(() => document.body.style.overflow === 'auto')).toBe(true)
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
