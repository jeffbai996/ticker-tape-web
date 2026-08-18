import { useEffect, useRef } from 'preact/hooks'
import { useEscape } from '../hooks.js'
import {
  createScrollLock, focusables, isBackdropDismiss, prefersReducedMotion,
  shouldCloseOnKey, tabTarget,
} from '../lib/dialog.js'

// One modal/drawer contract for the whole app (design audit P1). Anything that
// covers the page — the command palette sheet, the chat drawers, the research
// slide-over — renders through here so it gets the same answers to the same
// four questions: what am I (role/label), where does focus start and return to,
// how do I close, and can the page behind me still move.
//
// It is deliberately style-free: every class comes from the caller, so the
// Operator look of each surface is unchanged by the migration.

// Reference-counted: two overlays open at once must not fight over body
// overflow, and the last one out restores what was there before the first.
const bodyScrollLock = createScrollLock(
  () => (typeof document === 'undefined' ? null : document.body),
)

/**
 * @param {object} props
 * @param {() => void} props.onClose        the single dismissal path
 * @param {string} [props.label]            accessible name (aria-label)
 * @param {string} [props.labelledBy]       id of a visible title, instead of label
 * @param {{current: any}} [props.initialFocus]  where focus lands on open
 * @param {string} [props.backdropClass]    classes for the scrim element
 * @param {string} [props.class]            classes for the dialog panel
 * @param {string} [props.motionClass]      transition classes, dropped under reduced motion
 * @param {boolean} [props.backdrop]        false = a bare panel with no scrim
 * @param {boolean} [props.closeOnBackdrop] backdrop click dismisses (default true)
 * @param {boolean} [props.closeOnEscape]   Escape dismisses (default true)
 * @param {boolean} [props.lockScroll]      contain page scroll while open
 * @param {boolean} [props.trapFocus]       cycle Tab inside the panel (default true)
 */
export function Overlay({
  onClose,
  label,
  labelledBy,
  initialFocus,
  backdropClass = 'fixed inset-0 z-50 bg-black/55 grid place-items-center p-4',
  class: panelClass = '',
  motionClass = '',
  backdrop = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  lockScroll = backdrop,
  trapFocus = true,
  children,
  ...rest
}) {
  const panelRef = useRef(null)

  // Focus entry, and — the part every hand-rolled overlay forgot — focus
  // RETURN. Without it, closing a drawer dumps the keyboard user back at the
  // top of the document instead of on the button they opened it with.
  useEffect(() => {
    const opener = typeof document === 'undefined' ? null : document.activeElement
    const panel = panelRef.current
    const first = initialFocus?.current || focusables(panel)[0] || panel
    try { first?.focus?.({ preventScroll: true }) } catch { /* pre-focus DOM */ }
    return () => {
      if (opener?.isConnected && typeof opener.focus === 'function') {
        try { opener.focus({ preventScroll: true }) } catch { /* opener went away */ }
      }
    }
  }, [])

  useEffect(() => {
    if (!lockScroll) return undefined
    bodyScrollLock.acquire()
    return () => bodyScrollLock.release()
  }, [lockScroll])

  // Escape rides the existing window-level hook rather than a second listener:
  // a dialog whose Escape lives on one input is unreachable the moment the
  // user clicks anything else inside it.
  useEscape((e) => {
    if (shouldCloseOnKey(e, { escape: closeOnEscape })) onClose?.()
  }, closeOnEscape)

  const onKeyDown = (e) => {
    if (!trapFocus || e.key !== 'Tab' || e.defaultPrevented) return
    const next = tabTarget(focusables(panelRef.current), document.activeElement, e.shiftKey)
    if (!next) return
    e.preventDefault()
    next.focus?.({ preventScroll: true })
  }

  const reduced = prefersReducedMotion(
    typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia.bind(globalThis) : null,
  )

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      data-reduced-motion={reduced ? 'true' : undefined}
      class={`${panelClass}${!reduced && motionClass ? ` ${motionClass}` : ''}`}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {children}
    </div>
  )

  if (!backdrop) return panel

  return (
    <div
      class={backdropClass}
      onClick={(e) => { if (isBackdropDismiss(e, { backdrop: closeOnBackdrop })) onClose?.() }}
    >
      {panel}
    </div>
  )
}
