import { describe, it, expect, beforeEach } from 'vitest'
import {
  getWidgets, addWidget, removeWidget, moveWidget, DEFAULT_WIDGETS,
} from '../../src/lib/widgets.js'

beforeEach(() => localStorage.clear())

describe('dashboard widgets store', () => {
  it('returns defaults on first load', () => {
    expect(getWidgets().map((w) => w.type)).toEqual(DEFAULT_WIDGETS.map((w) => w.type))
  })

  it('adds a widget and persists it', () => {
    const w = addWidget('movers')
    expect(w.type).toBe('movers')
    expect(getWidgets().some((x) => x.id === w.id)).toBe(true)
  })

  it('chart widgets require a valid symbol', () => {
    expect(addWidget('chart', '')).toBeNull()
    expect(addWidget('chart', 'not a symbol!!')).toBeNull()
    const w = addWidget('chart', 'nvda')
    expect(w.symbol).toBe('NVDA')
  })

  it('rejects unknown types', () => {
    expect(addWidget('kitchen-sink')).toBeNull()
  })

  it('removes by id', () => {
    const w = addWidget('movers')
    removeWidget(w.id)
    expect(getWidgets().some((x) => x.id === w.id)).toBe(false)
  })

  it('moves a widget up and clamps at the edges', () => {
    const ids = () => getWidgets().map((w) => w.id)
    const [first] = ids()
    moveWidget(first, -1) // already at top — no-op
    expect(ids()[0]).toBe(first)
    const last = ids()[ids().length - 1]
    moveWidget(last, -1)
    expect(ids()[ids().length - 2]).toBe(last)
  })
})
