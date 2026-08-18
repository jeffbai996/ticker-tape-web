/** Idle CPU and timer hygiene (2026-08-18 perf pass).
 *
 *  The measured problem: a tab sitting on any route still paid for a 1 Hz
 *  rolodex repaint, a scrolling belt, a 2s wire poll and a per-second event
 *  countdown — all of it running just as hard with the tab buried. The rules
 *  below are the ones the pass installed. Where the behaviour is pure it is
 *  tested directly; where it lives inside a component effect the source is
 *  asserted, because mounting the whole shell to prove a timer was cleared
 *  costs more than it catches.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REDUCED_MOTION, tapePlayState } from '../../src/lib/tape.js'

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

// Every file this lane owns that schedules repeating work.
const TIMED_SOURCES = [
  'src/components/Tape.jsx',
  'src/components/StatusBar.jsx',
  'src/components/BottomNav.jsx',
  'src/pages/markets.jsx',
  'src/pages/wire.jsx',
  'src/pages/screen.jsx',
  'src/pages/screenBoard.jsx',
]

describe('tapePlayState', () => {
  it('runs only when the tab is visible and motion is welcome', () => {
    expect(tapePlayState({ hidden: false, reducedMotion: false })).toBe('running')
    expect(tapePlayState()).toBe('running')
  })

  it('parks the belt for a hidden tab', () => {
    expect(tapePlayState({ hidden: true, reducedMotion: false })).toBe('paused')
  })

  it('parks the belt for a reader who asked for reduced motion, visible or not', () => {
    expect(tapePlayState({ hidden: false, reducedMotion: true })).toBe('paused')
    expect(tapePlayState({ hidden: true, reducedMotion: true })).toBe('paused')
  })

  it('names the media query the belt honours', () => {
    expect(REDUCED_MOTION).toBe('(prefers-reduced-motion: reduce)')
  })
})

describe('nothing repeats on a bare interval', () => {
  it.each(TIMED_SOURCES)('%s schedules repeats through startVisibleClock', (path) => {
    // setInterval never stops on its own and keeps firing at a buried tab;
    // startVisibleClock is the one way to repeat in these files.
    expect(src(path)).not.toContain('setInterval(')
  })
})

describe('the tape belt', () => {
  const tape = src('src/components/Tape.jsx')

  it('drives the CSS animation from the play state rather than a JS loop', () => {
    expect(tape).toContain('animationPlayState: play')
    expect(tape).toContain('usePointerHighlight(wrap, play === \'running\')')
  })

  it('tracks both the tab and the reduced-motion setting, and unsubscribes from both', () => {
    expect(tape).toContain("document.addEventListener('visibilitychange', sync)")
    expect(tape).toContain("document.removeEventListener('visibilitychange', sync)")
    expect(tape).toContain("mq?.addEventListener?.('change', sync)")
    expect(tape).toContain("mq?.removeEventListener?.('change', sync)")
    expect(tape).toContain('globalThis.matchMedia?.(REDUCED_MOTION)')
  })

  it('drops the per-frame hit test while the belt is parked', () => {
    expect(tape).toContain('if (!moving) { hit(); return }')
    expect(tape).toContain('cancelAnimationFrame(raf)')
  })

  it('polls wire headlines only while visible', () => {
    expect(tape).toContain('startVisibleClock(60_000, pull)')
  })
})

describe('the shell clock', () => {
  const bar = src('src/components/StatusBar.jsx')

  it('paints the rolodex on a visible-only 1 Hz clock', () => {
    expect(bar).toContain('startVisibleClock(1000, paint)')
    expect(bar).toContain('startVisibleClock(30_000, () => setNow(new Date()))')
  })

  it('cancels in-flight digit rolls when it unmounts', () => {
    expect(bar).toContain('stopRollingTime(desktopClock.current)')
    expect(bar).toContain('stopRollingTime(mobileClock.current)')
  })

  it('still unsubscribes from the browser online/offline events', () => {
    expect(bar).toContain("addEventListener('online', up)")
    expect(bar).toContain("removeEventListener('online', up)")
    expect(bar).toContain("removeEventListener('offline', down)")
  })
})

describe('markets', () => {
  const markets = src('src/pages/markets.jsx')

  it('drops the staggered sector-history queue on unmount', () => {
    // eleven setTimeouts fired blind; a `dead` flag made them harmless but
    // they still ran, one every 150ms, against a page nobody was on
    expect(markets).toContain('const queued = SECTORS.map(')
    expect(markets).toContain('queued.forEach(clearTimeout)')
  })

  it('runs the event countdown only while it can be read', () => {
    expect(markets).toContain('useEffect(() => startVisibleClock(1000, () => setNow(Date.now())), [])')
  })
})

describe('wire', () => {
  const wire = src('src/pages/wire.jsx')

  it('puts every repeating job — demo, rail, revisions, mirror — behind visibility', () => {
    expect(wire).toContain('startVisibleClock(15000, () => {')      // demo events
    expect(wire).toContain('}, { catchUp: false })')                // …minted, not refreshed
    expect(wire).toContain('startVisibleClock(30_000, pollRail)')
    expect(wire).toContain('startVisibleClock(2000, pollRevisions)')
    expect(wire).toContain('startVisibleClock(MIRROR_POLL_MS,')
    expect(wire).toContain('startVisibleClock(30_000, () => setNow(Date.now() / 1000))')
  })

  it('stops all of them when the connection effect tears down', () => {
    for (const stop of ['railStop?.()', 'demoStop?.()', 'mirrorStop?.()', 'revisionStop?.()']) {
      expect(wire).toContain(stop)
    }
  })

  it('tracks the 8s row-glow timers so a burst cannot outlive the page', () => {
    expect(wire).toContain('const hotTimers = useRef(new Set())')
    expect(wire).toContain('hotTimers.current.forEach(clearTimeout)')
    expect(wire).toContain('hotTimers.current.add(timer)')
    expect(wire).toContain('hotTimers.current.delete(timer)')
  })
})

describe('effects clean up after themselves', () => {
  it.each(TIMED_SOURCES)('%s removes every listener it adds', (path) => {
    const text = src(path)
    // EventSource listeners die with the socket (`es.close()`), so they are
    // exempt; everything on document/window/an element must come back off.
    const added = [...text.matchAll(/(?<!es\.)addEventListener\(\s*'([a-z]+)'/g)]
      .map((m) => m[1])
    const removed = new Set([...text.matchAll(/removeEventListener\(\s*'([a-z]+)'/g)]
      .map((m) => m[1]))
    for (const type of new Set(added)) expect(removed).toContain(type)
  })
})
