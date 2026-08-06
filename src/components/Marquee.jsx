import { useEffect, useRef } from 'preact/hooks'

/** Text that slides its own overflow into view on hover instead of dying in a
 *  hard clip — the BaiCloud music/games "overflow-title" pattern, ported here
 *  for company names (Jeff 2026-08-04: "use the same scrolling pattern we use
 *  on other baicloud services"). The box stays put; only the inner span moves,
 *  so nothing around it reflows. Same 52px/s travel and .38s snap-back.
 */
export function Marquee({ text, class: cls = '', title }) {
  const box = useRef(null)
  const inner = useRef(null)

  // The edge fade is a CLIPPING cue, so it must only appear when the text is
  // actually clipped — a name that fits was still getting its tail faded
  // (Jeff 2026-08-06: "why do these still have the fade if they clearly
  // fit"). Measured here, re-checked on resize, and CSS keys off the class.
  useEffect(() => {
    const b = box.current
    const i = inner.current
    if (!b || !i) return
    const check = () => b.classList.toggle('is-clipped', i.scrollWidth > b.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(b)
    ro.observe(i)
    return () => ro.disconnect()
  }, [text])

  const start = () => {
    const b = box.current
    const i = inner.current
    if (!b || !i) return
    const distance = Math.max(0, i.scrollWidth - b.clientWidth + 4)
    if (!distance) return              // it fits — nothing to reveal
    b.style.setProperty('--mq-dist', `${distance}px`)
    b.style.setProperty('--mq-dur', `${Math.max(1.5, distance / 52)}s`)
    b.classList.add('is-scrolling')
  }
  const stop = () => box.current?.classList.remove('is-scrolling')

  return (
    <span
      ref={box}
      class={`mq ${cls}`}
      title={title ?? text}
      onMouseEnter={start}
      onMouseLeave={stop}
    >
      <span ref={inner} class="mq-inner">{text}</span>
    </span>
  )
}
