// The book actions (new / currency / rename / delete) belong on the section
// heading row, but the heading is rendered by the portfolio shell and the
// actions by the hand-built-books page underneath it (Jeff 2026-08-22:
// "place the new portfolio and base currency controls above in the 持仓
// heading area"). A one-slot store hands the vnode up without compat's
// portals: the page sets it, the header subscribes.

let current = null
const listeners = new Set()

export function setHeaderActions(vnode) {
  current = vnode
  for (const fn of [...listeners]) fn(vnode)
}

export function onHeaderActions(fn) {
  listeners.add(fn)
  fn(current)
  return () => listeners.delete(fn)
}
