// Trackpad zoom arrives as Ctrl+wheel. Forward a stronger delta through the
// chart's own handler so its limits and pointer anchor remain authoritative.
// Ordinary wheel events and touchscreen gestures stay on their native paths.
export function attachTrackpadPinch(host) {
  const forwarded = new WeakSet()
  const { WheelEvent } = host.ownerDocument.defaultView
  const onWheel = (event) => {
    if (forwarded.has(event) || !event.ctrlKey || !event.cancelable
        || !Number.isFinite(event.deltaY) || event.deltaY === 0) return
    const boosted = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, composed: event.composed,
      deltaX: event.deltaX, deltaY: event.deltaY * 3,
      deltaZ: event.deltaZ, deltaMode: event.deltaMode,
      clientX: event.clientX, clientY: event.clientY,
      screenX: event.screenX, screenY: event.screenY,
      ctrlKey: event.ctrlKey, altKey: event.altKey,
      shiftKey: event.shiftKey, metaKey: event.metaKey,
      view: event.view,
    })
    forwarded.add(boosted)
    event.preventDefault()
    event.stopImmediatePropagation()
    event.target.dispatchEvent(boosted)
  }
  host.addEventListener('wheel', onWheel, { capture: true, passive: false })
  return () => host.removeEventListener('wheel', onWheel, true)
}
