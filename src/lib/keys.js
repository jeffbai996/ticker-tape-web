// Shared keyboard-shortcut predicates. Global hotkeys must never steal a
// keystroke from something the user is actually typing into.

/** True when the element is a text-entry target (input/textarea/select/CE). */
export function isTypingTarget(el) {
  if (!el) return false
  return el.isContentEditable === true
    || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '')
}

/** Matches a media query and re-reports on change. Returns an unsubscribe. */
export function watchMedia(query, fn) {
  const mq = globalThis.matchMedia?.(query)
  if (!mq) {
    fn(true) // no matchMedia (jsdom/older browsers) — assume desktop
    return () => {}
  }
  fn(mq.matches)
  const onChange = (e) => fn(e.matches)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
