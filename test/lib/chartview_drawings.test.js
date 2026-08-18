import { describe, it, expect } from 'vitest'
import {
  boundedTimeScale, projectSegment, trendlinePrimitive,
} from '../src/lib/chartview.js'

// Minimal stand-ins for the two lightweight-charts APIs the projection uses.
const fakeSeries = (map) => ({
  priceToCoordinate: (p) => (p in map ? map[p] : null),
})
const fakeScale = (map) => ({
  timeToCoordinate: (t) => (t in map ? map[t] : null),
})

describe('boundedTimeScale', () => {
  it('pins both edges so zoom cannot invent empty bars', () => {
    const o = boundedTimeScale()
    expect(o.fixLeftEdge).toBe(true)
    expect(o.fixRightEdge).toBe(true)
  })
  it('passes through the intraday time-axis flag', () => {
    expect(boundedTimeScale(true).timeVisible).toBe(true)
    expect(boundedTimeScale(false).timeVisible).toBe(false)
  })
})

describe('projectSegment', () => {
  const series = fakeSeries({ 10: 300, 20: 100 })
  const scale = fakeScale({ 100: 5, 200: 400 })
  const pts = [{ time: 100, price: 10 }, { time: 200, price: 20 }]

  it('maps both endpoints to pixel space', () => {
    expect(projectSegment(pts, series, scale)).toEqual({ x1: 5, y1: 300, x2: 400, y2: 100 })
  })

  it('returns null when a time is outside the loaded window', () => {
    expect(projectSegment([{ time: 999, price: 10 }, pts[1]], series, scale)).toBeNull()
    expect(projectSegment([pts[0], { time: 999, price: 20 }], series, scale)).toBeNull()
  })

  it('returns null when a price falls off the scale', () => {
    expect(projectSegment([{ time: 100, price: 77 }, pts[1]], series, scale)).toBeNull()
  })

  it('returns null on missing inputs instead of throwing', () => {
    expect(projectSegment(null, series, scale)).toBeNull()
    expect(projectSegment(pts, null, scale)).toBeNull()
    expect(projectSegment(pts, series, null)).toBeNull()
    expect(projectSegment([pts[0]], series, scale)).toBeNull()
  })

  it('survives a series that throws while detached', () => {
    const angry = { priceToCoordinate: () => { throw new Error('disposed') } }
    expect(projectSegment(pts, angry, scale)).toBeNull()
  })
})

describe('trendlinePrimitive', () => {
  const pts = [{ time: 100, price: 10 }, { time: 200, price: 20 }]
  const attach = (prim) => prim.attached({
    series: fakeSeries({ 10: 300, 20: 100 }),
    chart: { timeScale: () => fakeScale({ 100: 5, 200: 400 }) },
    requestUpdate: () => {},
  })

  it('draws nothing before it is attached', () => {
    const prim = trendlinePrimitive({ points: pts })
    expect(prim.paneViews()[0].renderer()).toBeNull()
  })

  it('exposes geometry once attached, for hit-testing', () => {
    const prim = trendlinePrimitive({ points: pts })
    attach(prim)
    expect(prim.geometry()).toEqual({ x1: 5, y1: 300, x2: 400, y2: 100 })
  })

  it('hands back a renderer with a draw method when projectable', () => {
    const prim = trendlinePrimitive({ points: pts })
    attach(prim)
    const r = prim.paneViews()[0].renderer()
    expect(typeof r.draw).toBe('function')
  })

  it('renders nothing when the drawing sits outside the loaded window', () => {
    const prim = trendlinePrimitive({ points: [{ time: 5, price: 10 }, { time: 9, price: 20 }] })
    attach(prim)
    expect(prim.geometry()).toBeNull()
    expect(prim.paneViews()[0].renderer()).toBeNull()
  })

  it('paints on top of the series', () => {
    const prim = trendlinePrimitive({ points: pts })
    expect(prim.paneViews()[0].zOrder()).toBe('top')
  })

  it('draws through the media coordinate space with the given colour', () => {
    const prim = trendlinePrimitive({ points: pts, color: '#abcdef' })
    attach(prim)
    const calls = []
    const ctx = {
      set strokeStyle(v) { calls.push(['stroke', v]) },
      set lineWidth(v) { calls.push(['width', v]) },
      set fillStyle(v) { calls.push(['fill', v]) },
      beginPath: () => calls.push(['begin']),
      moveTo: (x, y) => calls.push(['move', x, y]),
      lineTo: (x, y) => calls.push(['line', x, y]),
      stroke: () => calls.push(['stroke!']),
      arc: () => calls.push(['arc']),
      fill: () => calls.push(['fill!']),
      save: () => {}, restore: () => {},
    }
    prim.paneViews()[0].renderer().draw({
      useMediaCoordinateSpace: (fn) => fn({ context: ctx }),
    })
    expect(calls).toContainEqual(['stroke', '#abcdef'])
    expect(calls).toContainEqual(['move', 5, 300])
    expect(calls).toContainEqual(['line', 400, 100])
    expect(calls).toContainEqual(['stroke!'])
  })

  it('marks the endpoints only while selected', () => {
    const prim = trendlinePrimitive({ points: pts })
    attach(prim)
    const run = () => {
      let arcs = 0
      const ctx = {
        set strokeStyle(v) {}, set lineWidth(v) {}, set fillStyle(v) {},
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        arc() { arcs++ }, fill() {}, save() {}, restore() {},
      }
      prim.paneViews()[0].renderer().draw({
        useMediaCoordinateSpace: (fn) => fn({ context: ctx }) })
      return arcs
    }
    expect(run()).toBe(0)
    prim.setSelected(true)
    expect(run()).toBe(2)
  })

  it('detaching stops it projecting', () => {
    const prim = trendlinePrimitive({ points: pts })
    attach(prim)
    prim.detached()
    expect(prim.geometry()).toBeNull()
  })
})
