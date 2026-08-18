import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { columnWidths, applyQuoteColumns, scheduleQuoteColumns } from '../../src/lib/quoteColumns.js'

describe('board-wide quote columns', () => {
  it('takes the widest print per column and ignores empty or unknown cells', () => {
    const w = columnWidths([
      { col: 'price', width: 47 }, { col: 'price', width: 55 }, { col: 'price', width: 0 },
      { col: 'change', width: 112 }, { col: 'change', width: 120 },
      { col: 'ext', width: NaN }, { col: 'ext', width: 98 },
      { col: 'bogus', width: 999 },
    ])
    expect(w).toEqual({ price: 55, change: 120, ext: 98 })
  })

  it('writes ceil px vars on the root and clears columns with no cells', () => {
    const style = { vars: {}, setProperty(k, v) { this.vars[k] = v }, removeProperty(k) { delete this.vars[k] } }
    applyQuoteColumns({ style }, { price: 54.4, change: 120 })
    expect(style.vars).toEqual({ '--col-price': '55px', '--col-change': '120px' })
    applyQuoteColumns({ style }, {})
    expect(style.vars).toEqual({})
  })

  it('rows read the vars as min-widths and mark the cells that feed them', () => {
    // the ghost ext slot mirrors the column but must not dictate it (its
    // shape would pin every board to a 4-digit ext print)
    const src = readFileSync(resolve(process.cwd(), 'src/pages/dashboard.jsx'), 'utf8')
    expect(src).toContain('min-w-(--col-price)')
    expect(src).toContain('@min-[545px]:min-w-(--col-change)')
    expect((src.match(/@min-\[545px\]:min-w-\(--col-ext\)/g) || []).length).toBe(2)
    expect((src.match(/data-col="price"/g) || []).length).toBe(1)
    expect((src.match(/data-col="change"/g) || []).length).toBe(1)
    expect((src.match(/data-col="ext"/g) || []).length).toBe(1)
    expect(src).not.toContain('w-[4.4rem]')
    expect(src).toContain('scheduleQuoteColumns(')
  })

  it('coalesces to one pending frame per root instead of cancelling on re-render', async () => {
    const calls = []
    const orig = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (fn) => { calls.push(fn); return calls.length }
    const style = { vars: {}, setProperty(k, v) { this.vars[k] = v }, removeProperty(k) { delete this.vars[k] } }
    const root = { style, querySelectorAll: () => [{ dataset: { col: 'price' }, offsetWidth: 50 }] }
    const pending1 = scheduleQuoteColumns(root)
    const pending2 = scheduleQuoteColumns(root)
    expect(calls).toHaveLength(1)                 // second call rides the first frame
    expect(pending1()).toBe(true) && expect(pending2()).toBe(true)
    calls[0]()
    expect(style.vars['--col-price']).toBe('50px')
    expect(pending1()).toBe(false)
    globalThis.requestAnimationFrame = orig
  })

  it('lands via the timer when rAF is throttled or never fires', async () => {
    const orig = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = () => 1          // a frame that never comes
    const style = { vars: {}, setProperty(k, v) { this.vars[k] = v }, removeProperty(k) { delete this.vars[k] } }
    const root = { style, querySelectorAll: () => [{ dataset: { col: 'ext' }, offsetWidth: 98 }] }
    scheduleQuoteColumns(root)
    await new Promise((r) => setTimeout(r, 120))
    expect(style.vars['--col-ext']).toBe('98px')
    globalThis.requestAnimationFrame = orig
  })
})

describe('a hidden tab measures nothing', () => {
  // rAF is dead on a buried tab, so the timer fallback won every time and ran
  // a forced layout per render for a screen nobody could see (idle probe,
  // 2026-08-18). The first visible render measures again.
  it('skips the measure entirely while the document is hidden', () => {
    const calls = []
    const orig = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (fn) => { calls.push(fn); return calls.length }
    const style = { vars: {}, setProperty(k, v) { this.vars[k] = v }, removeProperty(k) { delete this.vars[k] } }
    const root = { style, querySelectorAll: () => { throw new Error('must not measure') } }
    const pending = scheduleQuoteColumns(root, { doc: { hidden: true } })
    expect(calls).toHaveLength(0)
    expect(pending()).toBe(false)
    expect(style.vars).toEqual({})
    // visible again → normal path
    scheduleQuoteColumns({ style, querySelectorAll: () => [{ dataset: { col: 'price' }, offsetWidth: 51 }] },
      { doc: { hidden: false } })
    expect(calls).toHaveLength(1)
    calls[0]()
    expect(style.vars['--col-price']).toBe('51px')
    globalThis.requestAnimationFrame = orig
  })
})
