// The remote layer: turns D-pad, OK, Back, colour and channel keys into
// focus movement and app actions on top of the unmodified web app.
//
// The listener sits on window in the bubble phase and is registered before
// the app mounts. Handlers on the focused element (palette and suggestion
// lists, the rail separator, role=button rows) run first and call
// preventDefault when they consume a key, so anything prevented is left alone.
import { actionForKey } from './lib/keys.js'
import { backAction, nextHashStack, pickNext } from './lib/spatial.js'
import { exitApp, openExternal } from './platform.js'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Moving belts: their links scroll past continuously, and the static index
// strip and the wire already carry the same items.
const SKIP = '.tape-scroll, .strip-drift, [aria-hidden="true"], [inert]'

const LAYERS = '[aria-modal="true"], dialog[open], [data-layer]'

const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date'])

function isTextEntry(el) {
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true
  return el.tagName === 'INPUT' && TEXT_TYPES.has((el.type || 'text').toLowerCase())
}

function isShown(el) {
  if (el.closest(SKIP)) return false
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

/** The topmost modal surface; navigation never leaves it. */
function scopeRoot() {
  const modal = [...document.querySelectorAll('[aria-modal="true"], dialog[open]')].pop()
  return modal || document.getElementById('app') || document.body
}

function candidates(root) {
  return [...root.querySelectorAll(FOCUSABLE)]
    .filter(isShown)
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
}

function land(el) {
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  lastRect = el.getBoundingClientRect()
}

// Where focus was before a field was left with Back, so the next arrow
// press continues from there instead of from the top of the page.
let lastRect = null

function move(dir) {
  const root = scopeRoot()
  const active = document.activeElement
  const fromEl = active && active !== document.body && root.contains(active) ? active : null
  const list = candidates(root)
  if (!list.length) return
  const from = fromEl ? fromEl.getBoundingClientRect() : lastRect
  if (!from) {
    // Nothing focused yet: start at the top-left control of the content area.
    const main = list.filter(({ el }) => el.closest('main'))
    const pool = main.length ? main : list
    const first = pool.reduce((a, b) => (b.rect.top + b.rect.left < a.rect.top + a.rect.left ? b : a))
    land(first.el)
    return
  }
  const next = pickNext(from, list, dir)
  if (next) land(next.el)
}

/** Left/Right step a closed <select> through its options, as TV pickers do. */
function stepSelect(select, delta) {
  const i = select.selectedIndex + delta
  if (i < 0 || i >= select.options.length) return
  select.selectedIndex = i
  select.dispatchEvent(new Event('input', { bubbles: true }))
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function pressEscape(target) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
}

const layerSignature = () => [...document.querySelectorAll(LAYERS)]
  .map((el) => el.tagName + (el.id || el.className)).join('|')

// Pages visited in this session; Back walks them before going home.
let visited = [location.hash]
const atHome = () => /^#?\/?(dashboard)?\/?$/.test(location.hash)

function navigateBack() {
  if (atHome()) { exitApp(); return }
  if (visited.length > 1) history.back()
  else location.hash = '#/'
}

function back() {
  const active = document.activeElement
  const action = backAction({
    textFocused: isTextEntry(active),
    layerOpen: !!document.querySelector(LAYERS),
    atHome: atHome(),
  })
  if (action === 'blur') {
    // Escape first: it closes a suggestion list or the palette that owns
    // the field. Then leave the field so the on-screen keyboard closes.
    pressEscape(active)
    lastRect = active.getBoundingClientRect()
    active.blur()
    return
  }
  if (action === 'close-layer') {
    const dialog = [...document.querySelectorAll('dialog[open]')].pop()
    if (dialog) {
      const cancel = new Event('cancel', { cancelable: true })
      if (dialog.dispatchEvent(cancel)) dialog.close()
      return
    }
    // A layer that ignores Escape must not trap Back: if nothing closed by
    // the second frame, carry on as if no layer were open.
    const before = layerSignature()
    pressEscape(active && active !== document.body ? active : document.body)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (layerSignature() === before) navigateBack()
    }))
    return
  }
  if (action === 'history') navigateBack()
  else exitApp()
}

function page(dir) {
  const active = document.activeElement
  let box = active && active !== document.body ? active.parentElement : null
  while (box && !(box.scrollHeight > box.clientHeight + 4
    && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) {
    box = box.parentElement
  }
  box = box || document.querySelector('main')
  if (!box) return
  box.scrollBy({ top: dir * box.clientHeight * 0.85 })
  // Bring focus along to the first control now in view.
  requestAnimationFrame(() => {
    const view = box.getBoundingClientRect()
    const inView = candidates(box)
      .filter(({ rect }) => rect.top >= view.top && rect.bottom <= view.bottom)
    if (inView.length) land((dir > 0 ? inView[0] : inView[inView.length - 1]).el)
  })
}

function onKey(event) {
  if (event.defaultPrevented) return
  const action = actionForKey(event)
  if (!action) return
  const active = document.activeElement
  const text = isTextEntry(active)

  if (action === 'back') {
    event.preventDefault()
    back()
    return
  }
  if (action === 'left' || action === 'right') {
    if (text) return // the caret moves within the field
    if (active?.tagName === 'SELECT') {
      event.preventDefault()
      stepSelect(active, action === 'left' ? -1 : 1)
      return
    }
    if (active?.type === 'range') return
  }
  if (action === 'up' || action === 'down') {
    if (active?.tagName === 'TEXTAREA') return
  }
  if (['up', 'down', 'left', 'right'].includes(action)) {
    event.preventDefault()
    move(action)
    return
  }
  if (action === 'enter') {
    // Links, buttons and fields act on Enter themselves. Checkboxes and
    // radios only toggle on Space, so OK clicks them.
    if (active?.tagName === 'INPUT' && (active.type === 'checkbox' || active.type === 'radio')) {
      event.preventDefault()
      active.click()
    }
    return
  }
  if (action === 'pageUp' || action === 'pageDown') {
    event.preventDefault()
    page(action === 'pageDown' ? 1 : -1)
    return
  }
  if (action === 'red') {
    event.preventDefault()
    dispatchEvent(new CustomEvent('open-palette', { detail: {} }))
    return
  }
  if (action === 'blue') {
    event.preventDefault()
    location.hash = '#/'
  }
}

/** Links that would open a new tab go to the TV's browser instead. */
function onClick(event) {
  const link = event.target.closest?.('a[target="_blank"][href]')
  if (!link || event.defaultPrevented) return
  event.preventDefault()
  openExternal(link.href)
}

export function installRemote() {
  addEventListener('keydown', onKey)
  addEventListener('click', onClick, true)
  addEventListener('hashchange', () => {
    visited = nextHashStack(visited, location.hash)
    // The new page replaced what was under focus; continue from its top.
    lastRect = null
  })
}
