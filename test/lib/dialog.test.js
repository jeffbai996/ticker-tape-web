import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  FOCUSABLE_SELECTOR, createScrollLock, focusables, isBackdropDismiss,
  prefersReducedMotion, shouldCloseOnKey, tabTarget,
} from '../../src/lib/dialog.js'

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

// P1 from the design audit: "chat drawers use clickable backdrop divs without
// dialog semantics or a shared focus-trap contract". One contract now lives in
// src/lib/dialog.js (pure) + src/components/Overlay.jsx (the thin component).

const mount = (html) => {
  document.body.innerHTML = `<div id="panel">${html}</div>`
  return document.getElementById('panel')
}

beforeEach(() => { document.body.innerHTML = '' })

describe('focusables', () => {
  it('collects the tabbable elements in DOM order', () => {
    const panel = mount(`
      <button id="a">a</button>
      <a id="b" href="#/x">b</a>
      <input id="c" />
      <textarea id="d"></textarea>
      <select id="e"></select>
      <div id="f" tabindex="0"></div>
    `)
    expect(focusables(panel).map((el) => el.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('skips disabled, hidden, negative-tabindex and aria-hidden controls', () => {
    const panel = mount(`
      <button id="ok">ok</button>
      <button id="off" disabled>off</button>
      <button id="skip" tabindex="-1">skip</button>
      <input id="secret" type="hidden" />
      <button id="gone" hidden>gone</button>
      <div aria-hidden="true"><button id="masked">masked</button></div>
      <a id="nohref">no href</a>
    `)
    expect(focusables(panel).map((el) => el.id)).toEqual(['ok'])
  })

  it('returns an empty list for a missing root', () => {
    expect(focusables(null)).toEqual([])
  })

  it('exports the selector so callers can reuse it', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button')
    expect(FOCUSABLE_SELECTOR).toContain('textarea')
  })
})

describe('tabTarget — where Tab should land inside a trapped dialog', () => {
  const list = ['a', 'b', 'c']

  it('lets the browser handle a move that stays inside the dialog', () => {
    expect(tabTarget(list, 'a', false)).toBe(null)
    expect(tabTarget(list, 'b', true)).toBe(null)
  })

  it('wraps forward off the last element', () => {
    expect(tabTarget(list, 'c', false)).toBe('a')
  })

  it('wraps backward off the first element', () => {
    expect(tabTarget(list, 'a', true)).toBe('c')
  })

  it('pulls focus back in when it sits outside the dialog', () => {
    expect(tabTarget(list, 'elsewhere', false)).toBe('a')
    expect(tabTarget(list, 'elsewhere', true)).toBe('c')
  })

  it('has nowhere to go in an empty dialog', () => {
    expect(tabTarget([], 'a', false)).toBe(null)
  })

  it('keeps a single focusable element focused', () => {
    expect(tabTarget(['only'], 'only', false)).toBe('only')
    expect(tabTarget(['only'], 'only', true)).toBe('only')
  })
})

describe('shouldCloseOnKey', () => {
  it('closes on Escape', () => {
    expect(shouldCloseOnKey({ key: 'Escape' })).toBe(true)
  })

  it('ignores every other key', () => {
    expect(shouldCloseOnKey({ key: 'Enter' })).toBe(false)
    expect(shouldCloseOnKey({ key: 'Esc' })).toBe(false)
  })

  it('stands down when the surface opted out of Escape', () => {
    expect(shouldCloseOnKey({ key: 'Escape' }, { escape: false })).toBe(false)
  })

  it('respects a handler that already consumed the key', () => {
    expect(shouldCloseOnKey({ key: 'Escape', defaultPrevented: true })).toBe(false)
  })

  it('does not eat the Escape that cancels an IME composition', () => {
    expect(shouldCloseOnKey({ key: 'Escape', isComposing: true })).toBe(false)
  })

  it('survives a missing event', () => {
    expect(shouldCloseOnKey(null)).toBe(false)
  })
})

describe('isBackdropDismiss', () => {
  const backdrop = { id: 'backdrop' }

  it('dismisses on a click that landed on the backdrop itself', () => {
    expect(isBackdropDismiss({ target: backdrop, currentTarget: backdrop })).toBe(true)
  })

  it('ignores a click that started inside the dialog panel', () => {
    expect(isBackdropDismiss({ target: { id: 'panel' }, currentTarget: backdrop })).toBe(false)
  })

  it('ignores secondary mouse buttons', () => {
    expect(isBackdropDismiss({ target: backdrop, currentTarget: backdrop, button: 2 })).toBe(false)
  })

  it('stands down when the surface opted out of backdrop dismissal', () => {
    expect(isBackdropDismiss({ target: backdrop, currentTarget: backdrop }, { backdrop: false })).toBe(false)
  })
})

describe('prefersReducedMotion', () => {
  it('reads the media query', () => {
    expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true)
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false)
  })

  it('assumes motion is fine when the platform has no matchMedia', () => {
    expect(prefersReducedMotion(null)).toBe(false)
  })

  it('never throws on a hostile matchMedia', () => {
    expect(prefersReducedMotion(() => { throw new Error('nope') })).toBe(false)
  })
})

describe('createScrollLock', () => {
  it('locks once for nested dialogs and restores the original overflow', () => {
    const el = { style: { overflow: 'auto' } }
    const lock = createScrollLock(() => el)
    lock.acquire()
    expect(el.style.overflow).toBe('hidden')
    lock.acquire()
    lock.release()
    // the outer dialog is still open — the page stays contained
    expect(el.style.overflow).toBe('hidden')
    lock.release()
    expect(el.style.overflow).toBe('auto')
  })

  it('ignores an unbalanced release', () => {
    const el = { style: { overflow: '' } }
    const lock = createScrollLock(() => el)
    lock.release()
    lock.acquire()
    expect(el.style.overflow).toBe('hidden')
    lock.release()
    expect(el.style.overflow).toBe('')
    expect(lock.depth()).toBe(0)
  })

  it('is inert without a target', () => {
    const lock = createScrollLock(() => null)
    expect(() => { lock.acquire(); lock.release() }).not.toThrow()
  })
})

describe('the shared overlay contract is what the surfaces actually use', () => {
  const overlay = src('src/components/Overlay.jsx')

  it('the primitive carries dialog semantics, a label, and the trap', () => {
    expect(overlay).toMatch(/role="dialog"/)
    expect(overlay).toMatch(/aria-modal="true"/)
    expect(overlay).toMatch(/aria-label=/)
    expect(overlay).toMatch(/aria-labelledby=/)
    expect(overlay).toMatch(/tabTarget/)
    expect(overlay).toMatch(/createScrollLock/)
    // Escape stays on the one window-level hook, not a second listener
    expect(overlay).toMatch(/import \{ useEscape \} from '\.\.\/hooks\.js'/)
    // focus returns to whatever opened the dialog
    expect(overlay).toMatch(/opener/)
    expect(overlay).toMatch(/prefersReducedMotion/)
  })

  const surfaces = {
    'src/components/Palette.jsx': 1,
    'src/pages/chat.jsx': 3,
    'src/pages/research.jsx': 1,
  }

  for (const [path, count] of Object.entries(surfaces)) {
    it(`${path} routes its overlays through Overlay`, () => {
      const code = src(path)
      expect(code).toMatch(/import \{ Overlay \} from/)
      expect(code.match(/<Overlay\b/g) || []).toHaveLength(count)
      // no hand-rolled clickable backdrop divs left behind
      expect(code).not.toMatch(/<div class="fixed inset-0 z-50 bg-black/)
    })
  }

  it('keeps the phone palette sheet full-screen and the 16px input', () => {
    const palette = src('src/components/Palette.jsx')
    expect(palette).toMatch(/max-sm:h-full/)
    expect(palette).toMatch(/max-sm:text-\[16px\]/)
  })
})
