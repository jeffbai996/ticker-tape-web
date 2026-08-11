import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const src = fs.readFileSync('src/pages/portfolio.jsx', 'utf8')
const pill = fs.readFileSync('src/components/StatusPill.jsx', 'utf8')

// The watcher view talks to a fragwire that is still growing fields under it.
// These are contract assertions: what the page reads, what it writes, and what
// it refuses to do when the server is older than the design.

describe('thesis watcher surface', () => {
  it('renders verdicts through the shared status pill, not an ad hoc class map', () => {
    expect(src).toContain("import { StatusPill } from '../components/StatusPill.jsx'")
    expect(src).toContain('<StatusPill tone={state.tone}>')
    expect(src).not.toContain('INSUFFICIENT_DATA:')
    expect(pill).toContain('fired:')
    expect(pill).toContain('warn:')
  })

  it('consumes the extended snapshot fields', () => {
    for (const field of ['snap.freshness', 'snap.catalysts', 'snap.rotation',
      'snap.candidates', 'breaker.evidence', 'breaker.manual_history', 'breaker.alerted_at']) {
      expect(src, field).toContain(field)
    }
  })

  it('groups by severity and tiles the counts', () => {
    expect(src).toContain('groupBySeverity(breakers)')
    expect(src).toContain("<AccountStat label={thesisTerm('FIRED')}")
    expect(src).toContain("<AccountStat label={thesisTerm('NO DATA')}")
    expect(src).toContain("<AccountStat label={thesisTerm('AWAITING REVIEW')}")
  })

  it('expands a row into an evidence drawer with escape to close', () => {
    expect(src).toContain("useEscape(() => setOpenKey(''), !!openKey)")
    expect(src).toContain('<BreakerDrawer breaker={breaker}')
    expect(src).toContain('evidenceRows(breaker.evidence)')
  })

  it('posts writes to the thesis endpoints and hides them on 404', () => {
    expect(src).toContain("postThesis('/api/thesis/manual'")
    expect(src).toContain('/api/thesis/candidates/')
    expect(src).toContain('resp.status === 404')
    expect(src).toContain('err.unsupported = true')
    expect(src).toContain('onUnsupported={() => setCanWrite(false)}')
    expect(src).toContain('{canWrite && candidate.actionable && (')
  })

  it('makes a manual reading deliberate: expand, note, commit', () => {
    expect(src).toContain('record manual reading')
    expect(src).toContain('disabled={busy || !note.trim()}')
    expect(src).toContain("tl('commit reading')")
  })

  it('reverts an optimistic candidate action when the write fails', () => {
    const send = src.slice(src.indexOf('const send = async (action, text)'))
    expect(send.indexOf('onSettled(candidate.key, action)'))
      .toBeLessThan(send.indexOf('onSettled(candidate.key, null)'))
  })

  it('routes watcher enum terms through the thesis term map, not tl', () => {
    expect(src).toContain("import { getLocale, tl, thesisTerm, t as tt } from '../lib/i18n.js'")
    expect(src).toContain('thesisTerm(state.label)')
    expect(src).toContain('thesisTerm(group.severity)')
    expect(src).not.toContain("tl('CLEAR')")
  })
})
