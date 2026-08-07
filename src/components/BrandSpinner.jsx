// The brand mark, spun up as a working indicator: the logo's ring of dots
// without the trend line, with a bright wave travelling around it
// (Jeff 2026-08-07: "base it off the ticker-tape logo, so like the circle of
// dots, maybe animate it somehow. dont need the trend line in the middle").
//
// The geometry mirrors public/ticker-tape-mark.svg — 24-unit radius on a 64
// viewBox, 2.4-unit dots — so the spinner and the wordmark read as one family.
// Motion is CSS so `prefers-reduced-motion` can freeze it into a plain ring.

const DOTS = 16
const R = 24
const CENTER = 32

export function BrandSpinner({ size = 20, spinning = true, class: cls = '' }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}
      class={`brand-spinner ${spinning ? 'is-spinning' : ''} ${cls}`}
      role="presentation" aria-hidden="true">
      {Array.from({ length: DOTS }, (_, i) => {
        // start at 12 o'clock and run clockwise, so the wave reads as motion
        const angle = (i / DOTS) * Math.PI * 2 - Math.PI / 2
        return (
          <circle key={i} r="2.4"
            cx={(CENTER + R * Math.cos(angle)).toFixed(2)}
            cy={(CENTER + R * Math.sin(angle)).toFixed(2)}
            style={{ animationDelay: `${((i / DOTS) * 1.1).toFixed(3)}s` }} />
        )
      })}
    </svg>
  )
}
