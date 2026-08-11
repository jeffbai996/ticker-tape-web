import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const src = fs.readFileSync('src/pages/wire.jsx', 'utf8')

// A permanently CLOSED EventSource used to leave the page red until a reload.
// These guard both halves of the fix: it comes back on its own, and the reader
// can force it sooner.
describe('wire SSE recovery', () => {
  it('re-runs the whole connect effect when the reconnect counter bumps', () => {
    expect(src).toContain('}, [endpoint, reconnect])')
    expect(src).toContain('const [reconnect, setReconnect] = useState(0)')
  })

  it('re-arms on a capped backoff from both the stream and the backfill', () => {
    expect(src).toContain('Math.min(30_000, 3_000 * 2 ** attemptsRef.current)')
    expect(src).toContain("es.onerror = () => { setState('error'); reArm() }")
    // the initial fetch failing is the same dead end, not a one-shot error
    expect(src).toMatch(/setError\(String\(err\.message \|\| err\)\)\s*\n\s*reArm\(\)/)
  })

  it('clears the pending re-arm on teardown so a stale timer cannot fire', () => {
    expect(src).toContain('if (reArmTimer) clearTimeout(reArmTimer)')
  })

  it('resets the backoff once the stream actually opens', () => {
    expect(src).toContain("es.onopen = () => { attemptsRef.current = 0; setState('live') }")
  })

  it('offers a visible retry that jumps the backoff, only while down', () => {
    expect(src).toContain('data-wire-retry')
    expect(src).toContain("{state === 'error' && (")
    expect(src).toMatch(/const retryNow = \(\) => \{\s*\n\s*attemptsRef\.current = 0/)
    // the affordance stays in the brow's language: bordered pill, down tone
    expect(src).toContain('px-2 py-0.5 rounded-md border border-down/50')
  })
})

describe('wire query filter', () => {
  it('hands the active locale to the filter so zh rows are searchable', () => {
    expect(src).toContain('matchesWireQuery(ev, query, getLocale())')
  })
})
