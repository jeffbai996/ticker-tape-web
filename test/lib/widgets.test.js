import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getWidgets, addWidget, removeWidget, moveWidget, resetWidgets, onWidgetsChange, DEFAULT_WIDGETS,
} from '../../src/lib/widgets.js'

beforeEach(() => localStorage.clear())

describe('dashboard widgets store', () => {
  it('resets the layout once with distinct default ids', () => {
    addWidget('risk')
    const listener = vi.fn()
    const unsubscribe = onWidgetsChange(listener)
    resetWidgets()
    unsubscribe()
    expect(getWidgets()).toEqual(DEFAULT_WIDGETS)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps ids distinct when adding multiple widgets within one millisecond', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      const a = addWidget('risk')
      const b = addWidget('movers')
      expect(a.id).not.toBe(b.id)
      removeWidget(a.id)
      expect(getWidgets().some((w) => w.id === b.id)).toBe(true)
    } finally { clock.mockRestore() }
  })
  it('returns defaults on first load', () => {
    expect(getWidgets().map((w) => w.type)).toEqual(DEFAULT_WIDGETS.map((w) => w.type))
  })

  it('puts the market deck on the dashboard and migrates existing layouts once', () => {
    expect(DEFAULT_WIDGETS.map((w) => w.type)).toContain('markets')
    localStorage.setItem('dash_widgets_v1', JSON.stringify([{ id: 9, type: 'pulse' }]))
    expect(getWidgets().map((w) => w.type)).toEqual(['pulse', 'markets'])
    removeWidget(getWidgets().find((w) => w.type === 'markets').id)
    expect(getWidgets().map((w) => w.type)).toEqual(['pulse'])
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
