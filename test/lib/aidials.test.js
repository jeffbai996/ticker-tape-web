import { describe, it, expect, beforeEach } from 'vitest'
import {
  LENGTHS, TONES, DEFAULT_DIALS, loadDials, saveDials, applyDials,
} from '../../src/lib/aidials.js'

describe('dial persistence', () => {
  beforeEach(() => localStorage.clear())

  it('starts on the defaults', () => {
    expect(loadDials()).toEqual(DEFAULT_DIALS)
  })

  it('round-trips a saved setting', () => {
    saveDials({ length: 'deep', tone: 'skeptic', disconfirm: true })
    expect(loadDials()).toEqual({ length: 'deep', tone: 'skeptic', disconfirm: true })
  })

  it('falls back to defaults on an unknown or corrupt value', () => {
    saveDials({ length: 'epic', tone: 'pirate', disconfirm: 'yes' })
    expect(loadDials()).toEqual({ ...DEFAULT_DIALS, disconfirm: true })
    localStorage.setItem('ai_dials_v1', '{{{')
    expect(loadDials()).toEqual(DEFAULT_DIALS)
  })
})

describe('applyDials', () => {
  it('keeps the caller\'s system prompt as the subject', () => {
    const out = applyDials('You are the briefing writer.', DEFAULT_DIALS)
    expect(out.startsWith('You are the briefing writer.')).toBe(true)
  })

  it('carries the chosen length and tone rules', () => {
    const out = applyDials('sys', { length: 'brief', tone: 'blunt', disconfirm: false })
    expect(out).toContain(LENGTHS.find((l) => l.key === 'brief').rule)
    expect(out).toContain(TONES.find((t) => t.key === 'blunt').rule)
    expect(out).not.toContain(LENGTHS.find((l) => l.key === 'deep').rule)
  })

  it('adds the disconfirming-evidence section only when asked', () => {
    expect(applyDials('sys', { ...DEFAULT_DIALS, disconfirm: true })).toContain('DISCONFIRMING EVIDENCE')
    expect(applyDials('sys', DEFAULT_DIALS)).not.toContain('DISCONFIRMING EVIDENCE')
  })

  it('survives a missing system prompt and junk dials', () => {
    const out = applyDials(undefined, null)
    expect(out).toContain('OUTPUT DIALS')
    expect(out).toContain(LENGTHS.find((l) => l.key === DEFAULT_DIALS.length).rule)
  })
})
