import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ChartSuite needs a real canvas to mount, so these are source-level guards on
// the invariants that are easy to break during a refactor and expensive to
// notice on an iPad.
const src = readFileSync(resolve(process.cwd(), 'src/components/ChartSuite.jsx'), 'utf8')

describe('ChartSuite drawing wiring', () => {
  it('anchors drawings to the main price series, never the compare frame', () => {
    expect(src).toContain('seriesRef.current = comparing ? null : priceSeries')
  })

  it('sits out every annotation effect while comparing', () => {
    for (const deps of ['[drawings, sel, epoch, comparing]',
                        '[epoch, mode, pending, drawings, symbol, comparing]']) {
      expect(src).toContain(deps)
    }
    expect(src).toContain('if (!series || comparing) return')
  })

  it('cancels an armed mode when compare mode turns on', () => {
    expect(src).toMatch(/if \(comparing\) \{ setMode\(null\)/)
  })

  it('reloads drawings and clears gestures on a symbol change', () => {
    expect(src).toMatch(/setDrawings\(loadDrawings\(symbol\)\)[\s\S]{0,120}\}, \[symbol\]\)/)
  })

  it('lets Escape cancel a half-drawn trendline', () => {
    expect(src).toContain("if (e.key !== 'Escape') return")
  })

  it('uses the library price line for horizontals and a primitive for trends', () => {
    expect(src).toContain('series.createPriceLine({')
    expect(src).toContain('series.attachPrimitive(prim)')
    expect(src).toContain('series.removePriceLine(line)')
    expect(src).toContain('series.detachPrimitive(prim)')
  })

  it('keeps a fingertip-sized tap tolerance', () => {
    expect(src).toMatch(/const TAP_TOL = 1[2-9]/)
  })

  it('routes the drawing toolbar labels through tl', () => {
    for (const k of ['LINE', 'TREND', 'DELETE', 'CLEAR']) {
      expect(src).toContain(`tl('${k}')`)
    }
  })

  it('keeps the drawing chips on the existing chip() helper', () => {
    // Same font size and border language as every other toolbar control.
    expect(src).toContain("chip(mode === 'hline', tl('LINE')")
    expect(src).toContain("chip(mode === 'trend'")
    expect(src).not.toMatch(/text-\[1[2-9]px\]/)
  })
})
