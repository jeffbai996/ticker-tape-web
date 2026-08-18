// The modal/drawer contract, minus the DOM plumbing.
//
// Every overlay in the app used to answer "how do I close?", "where does focus
// go?" and "can Tab walk out of me?" on its own, which is how a chat drawer
// ends up as a clickable <div> with no dialog semantics. These are the pure
// decisions behind that contract; src/components/Overlay.jsx wires them to
// Preact and the document. Keep this file free of DOM globals so the rules stay
// testable on their own.

/** Everything the platform considers tabbable, before we filter it. */
export const FOCUSABLE_SELECTOR = [
  'a[href]', 'area[href]', 'button', 'input', 'select', 'textarea',
  'iframe', 'object', 'embed', 'audio[controls]', 'video[controls]',
  'summary', '[contenteditable]', '[tabindex]',
].join(',')

/** A control the user can actually reach with Tab right now. */
function tabbable(el) {
  if (el.disabled) return false
  if (el.type === 'hidden') return false
  if (el.hasAttribute('hidden')) return false
  if (el.closest('[aria-hidden="true"],[inert]')) return false
  const tabindex = el.getAttribute('tabindex')
  if (tabindex != null && Number(tabindex) < 0) return false
  return true
}

/**
 * Tabbable descendants of `root`, in DOM order.
 * Deliberately does not consult layout (offsetParent/getClientRects): jsdom
 * reports every element as unlaid-out, so a layout test would classify a real
 * dialog as empty and silently disable the trap.
 */
export function focusables(root) {
  if (!root?.querySelectorAll) return []
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(tabbable)
}

/**
 * Where Tab should land, given the dialog's focusable list and what has focus.
 * Returns `null` when the native tab order already keeps focus inside — only
 * the wrap-around edges (and focus that escaped the dialog) need intervention.
 */
export function tabTarget(list, active, shiftKey = false) {
  if (!list?.length) return null
  const last = list.length - 1
  const i = list.indexOf(active)
  if (i === -1) return shiftKey ? list[last] : list[0]
  if (!shiftKey && i === last) return list[0]
  if (shiftKey && i === 0) return list[last]
  return null
}

/** Should this keydown dismiss the dialog? */
export function shouldCloseOnKey(event, { escape = true } = {}) {
  if (!escape || !event) return false
  if (event.key !== 'Escape') return false
  // an IME uses Escape to cancel its composition — that keystroke belongs to
  // the input, not to the dialog around it
  if (event.isComposing) return false
  return !event.defaultPrevented
}

/** Should this click on the backdrop dismiss the dialog? */
export function isBackdropDismiss(event, { backdrop = true } = {}) {
  if (!backdrop || !event) return false
  // only a click that landed on the backdrop itself — never one that bubbled
  // up out of the panel
  if (event.target !== event.currentTarget) return false
  return !event.button
}

/** Does the user want transitions suppressed? */
export function prefersReducedMotion(matchMedia) {
  try {
    return !!matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  } catch {
    return false
  }
}

/**
 * Reference-counted scroll containment. Two overlays open at once must not
 * fight over the page's overflow, and the second one to close must restore
 * whatever the value was before the first one opened — not "auto".
 */
export function createScrollLock(getTarget) {
  let depth = 0
  let previous = ''
  return {
    acquire() {
      const el = getTarget?.()
      if (!el) return
      if (depth === 0) {
        previous = el.style.overflow
        el.style.overflow = 'hidden'
      }
      depth += 1
    },
    release() {
      const el = getTarget?.()
      if (!el || depth === 0) return
      depth -= 1
      if (depth === 0) el.style.overflow = previous
    },
    depth: () => depth,
  }
}
