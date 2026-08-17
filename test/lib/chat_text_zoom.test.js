import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(`${process.cwd()}/src/pages/chat.jsx`, 'utf8')

describe('chat transcript text size', () => {
  it('scales type, not the whole box', () => {
    // CSS `zoom` is a LAYOUT scale: it grew the bubbles, their padding and the
    // gaps between them along with the words, so pressing + mostly made the
    // speech bubbles bigger (Jeff 2026-08-16: "it seems to microscopically
    // change the font size and resizes the speech bubbles more than
    // anything"). A font-size on the scroller moves only type.
    expect(source).not.toContain('{ zoom: chatZoom }')
    expect(source).toContain('fontSize: `${(13.5 * chatZoom).toFixed(2)}px`')
  })

  it('sizes transcript bubbles in em so they follow the scroller', () => {
    // px children ignore a parent font-size entirely — that is the other half
    // of why the old control did so little.
    expect(source).not.toContain('text-[13.5px] leading-relaxed')
    expect(source.match(/text-\[1em\]/g) || []).toHaveLength(4)
  })

  it('leaves the composer at a fixed size', () => {
    // Deliberately excluded from the control (Jeff 2026-08-10), and it lives
    // outside the scroller — an em there would resolve against a different
    // parent and drift on its own.
    expect(source).toContain('resize-none outline-none text-[13.5px]')
  })

  it('has a range wide enough to be worth pressing', () => {
    // 0.8–1.4 gave +40%/−20% in 10% steps, which is what "microscopically"
    // was describing.
    expect(source).toContain('Math.min(2, Math.max(0.7,')
    expect(source).toContain('saved >= 0.7 && saved <= 2')
  })

  it('labels the buttons - and + rather than A- and A+', () => {
    expect(source).not.toContain('>A−</button>')
    expect(source).not.toContain('>A+</button>')
    expect(source).toContain('>−</button>')
    expect(source).toContain('>+</button>')
  })

  it('holds the reading position across the reflow', () => {
    // Changing the font size reflows every bubble, so the transcript slides out
    // from under the reader unless the position is captured before and restored
    // after (Jeff 2026-08-17: "should keep the chat in place, not move it
    // around"). Same capture/restore contract as operator's scaleKeepingView.
    expect(source).toContain('captureAnchor(scrollRef.current)')
    expect(source).toContain('restoreAnchor(scrollRef.current, anchor)')
    expect(source).toContain('}, [chatZoom])')
  })

  it('restores before the browser paints', () => {
    // useEffect fires after paint, so the correction would land one frame late
    // and read as a flicker rather than as the chat holding still.
    expect(source).toContain('useLayoutEffect')
  })

  it('takes scroll anchoring off the browser while the transcript reflows', () => {
    // Chrome picks its own anchor node and adjusts scrollTop during a reflow,
    // which races the explicit restore. operator turns it off on its log for
    // the same reason.
    expect(source).toContain("overflowAnchor: 'none'")
  })
})
