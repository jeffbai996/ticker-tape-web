import { describe, expect, it, beforeEach } from 'vitest'
import {
  toMs, verdictState, thesisHealth, groupBySeverity, severityRank, ageLabel,
  watcherFreshness, evidenceRows, catalystRows, rotationLedger, candidateRows,
  thesisSignals, thesisAnalysisPrompt, VERDICTS,
} from '../../src/lib/thesis.js'
import { setLocale, thesisTerm, tl } from '../../src/lib/i18n.js'

beforeEach(() => setLocale('en'))

describe('toMs', () => {
  it('reads epoch seconds, epoch millis and ISO stamps', () => {
    expect(toMs(1_700_000_000)).toBe(1_700_000_000_000)
    expect(toMs(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(toMs('2026-08-10T00:00:00Z')).toBe(Date.parse('2026-08-10T00:00:00Z'))
  })

  it('treats a bare SQLite stamp as UTC', () => {
    expect(toMs('2026-08-10 04:30:00')).toBe(Date.parse('2026-08-10T04:30:00Z'))
  })

  it('returns null for junk', () => {
    expect(toMs(null)).toBeNull()
    expect(toMs('')).toBeNull()
    expect(toMs('not a date')).toBeNull()
  })
})

describe('verdictState', () => {
  it('keeps fired and clear distinct and loud', () => {
    expect(verdictState({ verdict: 'FIRED' })).toMatchObject({ code: 'FIRED', tone: 'fired' })
    expect(verdictState({ verdict: 'CLEAR' })).toMatchObject({ code: 'CLEAR', tone: 'clear' })
  })

  it('splits insufficient data by whether a detector should have seen it', () => {
    // automated but blind — a warning in itself
    expect(verdictState({ verdict: 'INSUFFICIENT_DATA', auto: true }))
      .toMatchObject({ code: 'NO_DATA', label: 'NO DATA', tone: 'warn' })
    // manual with nothing recorded — merely unreviewed
    expect(verdictState({ verdict: 'INSUFFICIENT_DATA', auto: false }))
      .toMatchObject({ code: 'AWAITING', label: 'AWAITING REVIEW', tone: 'muted' })
  })

  it('errs toward the warning when the server omits auto', () => {
    expect(verdictState({ verdict: 'NO_DATA' }).code).toBe('NO_DATA')
    expect(verdictState({}).code).toBe('NO_DATA')
  })

  it('accepts the legacy AWAITING verdict', () => {
    expect(verdictState({ verdict: 'AWAITING', auto: true }).code).toBe('AWAITING')
  })
})

describe('thesisHealth', () => {
  const rows = [
    { id: 'a', verdict: 'FIRED', auto: true },
    { id: 'b', verdict: 'CLEAR', auto: true },
    { id: 'c', verdict: 'INSUFFICIENT_DATA', auto: true },
    { id: 'd', verdict: 'INSUFFICIENT_DATA', auto: false },
  ]

  it('counts each state separately and breaches on any fire', () => {
    expect(thesisHealth(rows)).toEqual({
      state: 'BREACHED', total: 4, fired: 1, clear: 1, awaiting: 1, noData: 1, review: 2,
    })
  })

  it('is GOOD with nothing fired', () => {
    expect(thesisHealth(rows.slice(1)).state).toBe('GOOD')
    expect(thesisHealth(null)).toMatchObject({ state: 'GOOD', total: 0 })
  })
})

describe('groupBySeverity', () => {
  const rows = [
    { id: 'trim-clear', severity: 'trim', verdict: 'CLEAR' },
    { id: 'ru-clear', severity: 'reunderwrite', verdict: 'CLEAR' },
    { id: 'ru-fired', severity: 'reunderwrite', verdict: 'FIRED' },
    { id: 'odd', severity: '', verdict: 'CLEAR' },
  ]

  it('puts re-underwrite above trim and unknown severities last', () => {
    expect(groupBySeverity(rows).map((g) => g.severity)).toEqual(['reunderwrite', 'trim', 'other'])
    expect(severityRank('reunderwrite')).toBeLessThan(severityRank('trim'))
    expect(severityRank('nonsense')).toBeGreaterThan(severityRank('trim'))
  })

  it('sorts fired to the top of each group and counts them', () => {
    const [first] = groupBySeverity(rows)
    expect(first.rows.map((r) => r.id)).toEqual(['ru-fired', 'ru-clear'])
    expect(first.fired).toBe(1)
  })
})

describe('watcherFreshness', () => {
  const now = Date.parse('2026-08-10T12:00:00Z')

  it('prefers the finished run and stays green inside a day', () => {
    const out = watcherFreshness({
      last_run: { kind: 'daily', started_at: '2026-08-10T03:00:00Z', finished_at: '2026-08-10T03:05:00Z', evaluated: 9, fired: 0 },
      db_mtime: '2026-08-01T00:00:00Z',
    }, now)
    expect(out).toMatchObject({ source: 'run', tone: 'clear', kind: 'daily', evaluated: 9, age: '9h' })
  })

  it('warns past 26h and goes red past 50h', () => {
    expect(watcherFreshness({ last_run: { finished_at: '2026-08-09T06:00:00Z' } }, now).tone).toBe('warn')
    expect(watcherFreshness({ last_run: { finished_at: '2026-08-08T06:00:00Z' } }, now).tone).toBe('fired')
  })

  it('falls back to the db mtime and reports null when nothing is known', () => {
    expect(watcherFreshness({ db_mtime: '2026-08-10T10:00:00Z' }, now))
      .toMatchObject({ source: 'db', age: '2h' })
    expect(watcherFreshness(null, now)).toBeNull()
    expect(watcherFreshness({}, now)).toBeNull()
  })
})

describe('ageLabel', () => {
  const now = Date.parse('2026-08-10T12:00:00Z')
  it('steps minutes → hours → days', () => {
    expect(ageLabel(now - 5 * 60_000, now)).toBe('5m')
    expect(ageLabel(now - 3 * 3_600_000, now)).toBe('3h')
    expect(ageLabel(now - 5 * 86_400_000, now)).toBe('5d')
    expect(ageLabel(null, now)).toBe('')
  })
})

describe('evidenceRows', () => {
  it('renders a blob as readable key/value rows', () => {
    expect(evidenceRows({ gross_margin: 0.34, source_url: 'https://x', is_stale: false, missing: null }))
      .toEqual([
        { key: 'gross_margin', label: 'gross margin', value: '0.34' },
        { key: 'source_url', label: 'source url', value: 'https://x' },
        { key: 'is_stale', label: 'is stale', value: 'no' },
        { key: 'missing', label: 'missing', value: '—' },
      ])
  })

  it('serializes nested values and ignores non-objects', () => {
    expect(evidenceRows({ series: [1, 2], nested: { a: 1 } })).toEqual([
      { key: 'series', label: 'series', value: '1, 2' },
      { key: 'nested', label: 'nested', value: '{"a":1}' },
    ])
    expect(evidenceRows(null)).toEqual([])
    expect(evidenceRows([1, 2])).toEqual([])
  })
})

describe('catalystRows', () => {
  it('keeps future dates only, soonest first, with days-until', () => {
    const rows = catalystRows([
      { date: '2026-08-20', label: 'AVGO earnings' },
      { date: '2026-08-01', label: 'gone' },
      { date: '2026-08-10', label: 'today' },
      { date: 'junk', label: 'bad' },
    ], '2026-08-10')
    expect(rows.map((r) => [r.label, r.days])).toEqual([['today', 0], ['AVGO earnings', 10]])
  })
})

describe('rotationLedger', () => {
  it('normalizes the timestamp field and keeps newest first', () => {
    const rows = rotationLedger([
      { estimate: '2028-06', note: 'later', set_at: '2026-05-01T00:00:00Z' },
      { estimate: '2027-09', note: 'earlier', created_at: '2026-08-01T00:00:00Z' },
      { note: 'no estimate' },
    ])
    expect(rows.map((r) => r.estimate)).toEqual(['2027-09', '2028-06'])
    expect(rows[0].ms).toBe(Date.parse('2026-08-01T00:00:00Z'))
  })
})

describe('candidateRows', () => {
  it('marks id-less rows unactionable and drops decided ones', () => {
    const rows = candidateRows([
      { id: 4, status: 'new', summary: 'a' },
      { summary: 'legacy row' },
      { id: 7, status: 'dismissed', summary: 'gone' },
    ])
    expect(rows.map((r) => [r.key, r.actionable])).toEqual([['4', true], ['i1', false]])
  })
})

describe('thesis signals + prompt', () => {
  it('keeps T2+ headlines newest first', () => {
    const events = [
      { id: 1, headline: 'old', meta: { thesis: 3 }, ts_event: 10 },
      { id: 2, headline: 'new', meta: { thesis: 2 }, ts_event: 20 },
      { id: 3, headline: 'noise', meta: { thesis: 1 }, ts_event: 30 },
    ]
    expect(thesisSignals(events).map((e) => e.id)).toEqual([2, 1])
  })

  it('names every condition and forbids a trade call', () => {
    const prompt = thesisAnalysisPrompt([{ id: 'gm', verdict: 'CLEAR', description: 'margins hold' }], [])
    expect(prompt).toContain('gm [CLEAR]: margins hold')
    expect(prompt).toContain('Do not make a trade recommendation')
  })
})

describe('zh chrome for watcher terms', () => {
  it('translates every verdict, severity and category term', () => {
    setLocale('zh')
    for (const term of ['FIRED', 'CLEAR', 'NO DATA', 'AWAITING REVIEW',
      'reunderwrite', 'trim', 'other', 'per name', 'structural', 'macro', 'capex']) {
      expect(thesisTerm(term), term).not.toBe(term)
    }
  })

  it('covers every verdict label the page can render', () => {
    setLocale('zh')
    for (const verdict of Object.values(VERDICTS)) {
      expect(thesisTerm(verdict.label), verdict.label).not.toBe(verdict.label)
    }
  })

  it('keeps a cleared breaker from reading as the chart CLEAR button', () => {
    setLocale('zh')
    expect(thesisTerm('CLEAR')).toBe('未触发')
    expect(thesisTerm('CLEAR')).not.toBe(tl('CLEAR'))
  })

  it('passes terms through untouched in en', () => {
    expect(thesisTerm('reunderwrite')).toBe('reunderwrite')
  })
})
