import { describe, it, expect, beforeEach } from 'vitest'
import { loadArchive, saveReport, removeReport, onArchiveChange } from '../../src/lib/archive.js'

beforeEach(() => localStorage.clear())

describe('report archive', () => {
  it('saves newest-first with kind/symbol normalization and notifies', () => {
    let seen = null
    const off = onArchiveChange((l) => { seen = l })
    const a = saveReport({ kind: 'memo', symbol: 'nvda', title: 'NVDA memo', text: 'bull case…' })
    const b = saveReport({ kind: 'briefing', title: 'Briefing 2026-07-04', text: 'macro…' })
    off()

    expect(a.symbol).toBe('NVDA')
    expect(b.symbol).toBeNull()
    expect(b.id).toBe(2)
    const list = loadArchive()
    expect(list.map((r) => r.id)).toEqual([2, 1])
    expect(seen).toHaveLength(2)
  })

  it('rejects empty text and unknown kinds fall back to briefing', () => {
    expect(saveReport({ kind: 'memo', title: 'x', text: '   ' })).toBeNull()
    expect(loadArchive()).toHaveLength(0)
    expect(saveReport({ kind: 'weird', title: 'x', text: 'y' }).kind).toBe('briefing')
  })

  it('caps at 50, dropping the oldest', () => {
    for (let i = 0; i < 55; i++) saveReport({ kind: 'memo', title: `m${i}`, text: 't' })
    const list = loadArchive()
    expect(list).toHaveLength(50)
    expect(list[0].title).toBe('m54')
    expect(list[49].title).toBe('m5')
  })

  it('removes by id and round-trips through storage', () => {
    const a = saveReport({ kind: 'memo', title: 'x', text: 'body' })
    expect(removeReport(a.id)).toBe(true)
    expect(removeReport(a.id)).toBe(false)
    expect(loadArchive()).toHaveLength(0)
  })
})
