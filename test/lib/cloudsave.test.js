import { describe, it, expect } from 'vitest'
import { mergeDocs, touch, markDeleted, seedLocalSyncMeta } from '../../src/lib/cloudsave.js'

const snap = (main, lists, touched = {}, deleted = {}) =>
  ({ main, lists, touched, deleted })

describe('mergeDocs', () => {
  it('adopts remote lists this device has never seen', () => {
    const local = snap(['NVDA'], [], { main: 10 })
    const remote = snap(['NVDA'], [{ id: 'macro', name: 'Macro', symbols: ['GLD'] }],
      { main: 5, macro: 20 })
    const { doc, changedLocal } = mergeDocs(local, remote)
    expect(doc.lists.map((l) => l.id)).toEqual(['macro'])
    expect(changedLocal).toBe(true)
  })

  it('the newer edit of the same list wins whole', () => {
    const local = snap([], [{ id: 'semis', name: 'Semis', symbols: ['NVDA', 'MU'] }],
      { semis: 30 })
    const remote = snap([], [{ id: 'semis', name: 'Semis', symbols: ['NVDA'] }],
      { semis: 20 })
    expect(mergeDocs(local, remote).doc.lists[0].symbols).toEqual(['NVDA', 'MU'])
    const flipped = mergeDocs(
      snap([], [{ id: 'semis', name: 'Semis', symbols: ['NVDA'] }], { semis: 20 }),
      snap([], [{ id: 'semis', name: 'Semis', symbols: ['NVDA', 'MU'] }], { semis: 30 }),
    )
    expect(flipped.doc.lists[0].symbols).toEqual(['NVDA', 'MU'])
  })

  it('main watchlist follows the newer touch', () => {
    const local = snap(['NVDA'], [], { main: 10 })
    const remote = snap(['NVDA', 'GLD'], [], { main: 50 })
    expect(mergeDocs(local, remote).doc.main).toEqual(['NVDA', 'GLD'])
  })

  it('a deletion does not resurrect from the other device', () => {
    const meta = markDeleted({ rev: 1, touched: { old: 10 }, deleted: {} }, 'old', 40)
    const local = snap([], [], meta.touched, meta.deleted)
    const remote = snap([], [{ id: 'old', name: 'Old', symbols: ['TSLA'] }], { old: 10 })
    const { doc } = mergeDocs(local, remote)
    expect(doc.lists).toEqual([])
    expect(doc.deleted.old).toBe(40)
  })

  it('an edit NEWER than the deletion restores the list', () => {
    const local = snap([], [], {}, { shared: 10 })
    const remote = snap([], [{ id: 'shared', name: 'Shared', symbols: ['MU'] }],
      { shared: 99 })
    expect(mergeDocs(local, remote).doc.lists.map((l) => l.id)).toEqual(['shared'])
  })

  it('reports no local change when local already matches the outcome', () => {
    const local = snap(['NVDA'], [{ id: 'a', name: 'A', symbols: [] }], { main: 9, a: 9 })
    const remote = snap(['NVDA'], [{ id: 'a', name: 'A', symbols: [] }], { main: 3, a: 3 })
    expect(mergeDocs(local, remote).changedLocal).toBe(false)
  })

  it('no remote yet → local is the document', () => {
    const local = snap(['NVDA'], [], { main: 1 })
    const { doc, changedLocal } = mergeDocs(local, null)
    expect(doc).toBe(local)
    expect(changedLocal).toBe(false)
  })

  it('touch stamps survive the merge in both directions', () => {
    const local = snap([], [{ id: 'a', name: 'A', symbols: [] }], { a: 30 })
    const remote = snap([], [{ id: 'b', name: 'B', symbols: [] }], { b: 40 })
    const { doc } = mergeDocs(local, remote)
    expect(doc.touched).toEqual({ a: 30, b: 40 })
  })
})

describe('meta helpers', () => {
  it('touch is immutable and per-part', () => {
    const meta = { rev: 2, touched: { main: 1 }, deleted: {} }
    const next = touch(meta, 'semis', 99)
    expect(next.touched).toEqual({ main: 1, semis: 99 })
    expect(meta.touched).toEqual({ main: 1 })
  })

  it('markDeleted clears the touch and records the tombstone', () => {
    const meta = { rev: 2, touched: { gone: 5 }, deleted: {} }
    const next = markDeleted(meta, 'gone', 77)
    expect(next.touched).toEqual({})
    expect(next.deleted).toEqual({ gone: 77 })
  })

  it('seeds every local part when a new sync space is created', () => {
    const seeded = seedLocalSyncMeta(
      ['AAPL'],
      [{ id: 'semis', name: 'Semis', symbols: ['NVDA'] }],
      99,
    )
    expect(seeded).toEqual({ rev: 0, touched: { main: 99, semis: 99 }, deleted: {} })
  })
})
