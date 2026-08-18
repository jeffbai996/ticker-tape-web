/** One `visibilitychange` listener, many subscribers.
 *
 *  Every flashing number on the board wants to know when the tab comes back
 *  (to rebaseline instead of flashing a stale delta at a reader who was
 *  looking elsewhere). Registering that per cell cost ~1220 live listeners on
 *  a 37-row dashboard — measured, not guessed. The event is global and
 *  identical for all of them, so the document gets exactly one listener and
 *  the cells get a subscription.
 *
 *  The hub is created here rather than at each call site so the listener can
 *  be dropped entirely when the last subscriber leaves — a headless render or
 *  a torn-down page holds nothing.
 */

export function createVisibilityHub(doc = globalThis.document) {
  const subscribers = new Set()
  let attached = null

  const fire = () => {
    const hidden = !!doc?.hidden
    for (const fn of [...subscribers]) {
      // one bad cell must not stop the rest of the board rebaselining
      try { fn(hidden) } catch { /* a subscriber's problem, not the hub's */ }
    }
  }

  return {
    /** @returns {() => void} unsubscribe; idempotent */
    subscribe(fn) {
      if (typeof fn !== 'function' || !doc?.addEventListener) return () => {}
      subscribers.add(fn)
      if (!attached) {
        attached = fire
        doc.addEventListener('visibilitychange', attached)
      }
      return () => {
        if (!subscribers.delete(fn)) return
        if (subscribers.size === 0 && attached) {
          doc.removeEventListener('visibilitychange', attached)
          attached = null
        }
      }
    },
    /** Test/diagnostic hook — how many cells are listening through the hub. */
    size() { return subscribers.size },
  }
}

const hub = createVisibilityHub()

/** App-wide subscription: `fn(hidden)` on every visibility flip. */
export function onVisibilityChange(fn) {
  return hub.subscribe(fn)
}

export function visibilitySubscriberCount() {
  return hub.size()
}
