import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fmtPrice, fmtChange, fmtPct, changeColor, changeBg,
  rsiColor, rsiLabel, fmtCap, fmtNum, fmtCompact, fmtVol,
  sparklineSVG, timeAgo, esc,
} from '../../src/lib/format.js'

// ── fmtPrice ─────────────────────────────────────────
describe('fmtPrice', () => {
  it('formats a normal price to 2 decimals', () => {
    expect(fmtPrice(125.3)).toBe('125.30')
    expect(fmtPrice(1000)).toBe('1000.00')
  })
  it('accepts custom decimal count', () => {
    expect(fmtPrice(1.2345, 4)).toBe('1.2345')
  })
  it('returns em-dash for null/undefined/NaN', () => {
    expect(fmtPrice(null)).toBe('—')
    expect(fmtPrice(undefined)).toBe('—')
    expect(fmtPrice(NaN)).toBe('—')
  })
  it('handles zero', () => {
    expect(fmtPrice(0)).toBe('0.00')
  })
  it('handles negative prices', () => {
    expect(fmtPrice(-5.5)).toBe('-5.50')
  })
})

// ── fmtChange ────────────────────────────────────────
describe('fmtChange', () => {
  it('shows + prefix for positive values', () => {
    expect(fmtChange(2.5)).toBe('+2.50')
  })
  it('shows no + prefix for negative values', () => {
    expect(fmtChange(-1.23)).toBe('-1.23')
  })
  it('shows no prefix for zero', () => {
    expect(fmtChange(0)).toBe('0.00')
  })
  it('returns em-dash for null/NaN', () => {
    expect(fmtChange(null)).toBe('—')
    expect(fmtChange(NaN)).toBe('—')
  })
})

// ── fmtPct ───────────────────────────────────────────
describe('fmtPct', () => {
  it('shows + prefix and % suffix for positive values', () => {
    expect(fmtPct(1.99)).toBe('+1.99%')
  })
  it('shows - prefix and % suffix for negative values', () => {
    expect(fmtPct(-2.45)).toBe('-2.45%')
  })
  it('handles zero', () => {
    expect(fmtPct(0)).toBe('0.00%')
  })
  it('returns em-dash for null/NaN', () => {
    expect(fmtPct(null)).toBe('—')
    expect(fmtPct(NaN)).toBe('—')
  })
})

// ── changeColor ──────────────────────────────────────
describe('changeColor', () => {
  it('returns positive class for positive numbers', () => {
    expect(changeColor(1)).toBe('text-positive')
    expect(changeColor(0.01)).toBe('text-positive')
  })
  it('returns negative class for negative numbers', () => {
    expect(changeColor(-1)).toBe('text-negative')
  })
  it('returns neutral class for zero', () => {
    expect(changeColor(0)).toBe('text-zinc-400')
  })
  it('returns neutral class for null/NaN', () => {
    expect(changeColor(null)).toBe('text-zinc-400')
    expect(changeColor(NaN)).toBe('text-zinc-400')
  })
})

// ── changeBg ─────────────────────────────────────────
describe('changeBg', () => {
  it('returns green bg for positive', () => {
    expect(changeBg(5)).toContain('green')
  })
  it('returns red bg for negative', () => {
    expect(changeBg(-5)).toContain('red')
  })
  it('returns neutral bg for zero/null', () => {
    expect(changeBg(0)).toBe('bg-zinc-800')
    expect(changeBg(null)).toBe('bg-zinc-800')
  })
})

// ── rsiColor ─────────────────────────────────────────
describe('rsiColor', () => {
  it('returns negative class for overbought (>=70)', () => {
    expect(rsiColor(70)).toBe('text-negative')
    expect(rsiColor(85)).toBe('text-negative')
  })
  it('returns positive class for oversold (<=30)', () => {
    expect(rsiColor(30)).toBe('text-positive')
    expect(rsiColor(20)).toBe('text-positive')
  })
  it('returns neutral class for middle range', () => {
    expect(rsiColor(50)).toBe('text-zinc-300')
    expect(rsiColor(31)).toBe('text-zinc-300')
    expect(rsiColor(69)).toBe('text-zinc-300')
  })
  it('returns neutral class for null', () => {
    expect(rsiColor(null)).toBe('text-zinc-400')
  })
})

// ── rsiLabel ─────────────────────────────────────────
describe('rsiLabel', () => {
  it('labels overbought for rsi >= 70', () => {
    expect(rsiLabel(70)).toBe('Overbought')
    expect(rsiLabel(75)).toBe('Overbought')
  })
  it('labels oversold for rsi <= 30', () => {
    expect(rsiLabel(30)).toBe('Oversold')
    expect(rsiLabel(25)).toBe('Oversold')
  })
  it('returns empty string for neutral range', () => {
    expect(rsiLabel(50)).toBe('')
  })
  it('returns empty string for null', () => {
    expect(rsiLabel(null)).toBe('')
  })
})

// ── fmtCap ───────────────────────────────────────────
describe('fmtCap', () => {
  it('formats trillions', () => {
    expect(fmtCap(3.4e12)).toBe('$3.40T')
  })
  it('formats billions', () => {
    expect(fmtCap(500e9)).toBe('$500.00B')
    expect(fmtCap(1.23e9)).toBe('$1.23B')
  })
  it('formats millions', () => {
    expect(fmtCap(250e6)).toBe('$250.0M')
  })
  it('formats small values as localized integer', () => {
    const result = fmtCap(999)
    expect(result).toMatch(/^\$/)
  })
  it('returns em-dash for null/NaN', () => {
    expect(fmtCap(null)).toBe('—')
    expect(fmtCap(NaN)).toBe('—')
  })
})

// ── fmtCompact ───────────────────────────────────────
describe('fmtCompact', () => {
  it('formats trillions', () => {
    expect(fmtCompact(2.5e12)).toBe('2.5T')
  })
  it('formats billions', () => {
    expect(fmtCompact(1.5e9)).toBe('1.5B')
  })
  it('formats millions', () => {
    expect(fmtCompact(3.2e6)).toBe('3.2M')
  })
  it('formats thousands', () => {
    expect(fmtCompact(1500)).toBe('1.5K')
  })
  it('formats small numbers as integers', () => {
    expect(fmtCompact(99)).toBe('99')
  })
  it('handles negative values', () => {
    expect(fmtCompact(-1.5e9)).toBe('-1.5B')
  })
  it('returns em-dash for null/NaN', () => {
    expect(fmtCompact(null)).toBe('—')
    expect(fmtCompact(NaN)).toBe('—')
  })
})

// ── fmtVol ───────────────────────────────────────────
describe('fmtVol', () => {
  it('delegates to fmtCompact', () => {
    expect(fmtVol(1e6)).toBe('1.0M')
    expect(fmtVol(null)).toBe('—')
  })
})

// ── sparklineSVG ─────────────────────────────────────
describe('sparklineSVG', () => {
  it('returns empty string for null or short arrays', () => {
    expect(sparklineSVG(null)).toBe('')
    expect(sparklineSVG([])).toBe('')
    expect(sparklineSVG([100])).toBe('')
  })
  it('returns SVG string for valid array', () => {
    const svg = sparklineSVG([100, 105, 102, 108])
    expect(svg).toContain('<svg')
    expect(svg).toContain('polyline')
  })
  it('uses green for upward trend', () => {
    const svg = sparklineSVG([100, 110])
    expect(svg).toContain('#22c55e')
  })
  it('uses red for downward trend', () => {
    const svg = sparklineSVG([110, 100])
    expect(svg).toContain('#ef4444')
  })
  it('respects custom color override', () => {
    const svg = sparklineSVG([100, 110], { color: '#ffc800' })
    expect(svg).toContain('#ffc800')
  })
  it('handles flat price series (no division by zero)', () => {
    const svg = sparklineSVG([100, 100, 100])
    expect(svg).toContain('<svg')
  })
  it('filters out null values', () => {
    const svg = sparklineSVG([100, null, 110, null, 105])
    expect(svg).toContain('<svg')
  })
})

// ── timeAgo ──────────────────────────────────────────
describe('timeAgo', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns empty string for falsy input', () => {
    expect(timeAgo(null)).toBe('')
    expect(timeAgo('')).toBe('')
  })
  it('returns "just now" for < 1 minute ago', () => {
    const now = new Date('2025-01-01T12:00:00Z')
    vi.setSystemTime(now)
    expect(timeAgo(new Date('2025-01-01T11:59:30Z').toISOString())).toBe('just now')
  })
  it('returns "Xm ago" for minutes', () => {
    const now = new Date('2025-01-01T12:00:00Z')
    vi.setSystemTime(now)
    expect(timeAgo(new Date('2025-01-01T11:55:00Z').toISOString())).toBe('5m ago')
  })
  it('returns "Xh ago" for hours', () => {
    const now = new Date('2025-01-01T12:00:00Z')
    vi.setSystemTime(now)
    expect(timeAgo(new Date('2025-01-01T10:00:00Z').toISOString())).toBe('2h ago')
  })
  it('returns "Xd ago" for days', () => {
    const now = new Date('2025-01-03T12:00:00Z')
    vi.setSystemTime(now)
    expect(timeAgo(new Date('2025-01-01T12:00:00Z').toISOString())).toBe('2d ago')
  })
})

// ── esc ──────────────────────────────────────────────
describe('esc', () => {
  it('returns empty string for falsy input', () => {
    expect(esc('')).toBe('')
    expect(esc(null)).toBe('')
  })
  it('escapes HTML special characters', () => {
    expect(esc('<script>alert("xss")</script>')).not.toContain('<script>')
    expect(esc('5 > 3')).toBe('5 &gt; 3')
    expect(esc('a & b')).toBe('a &amp; b')
  })
  it('leaves normal strings unchanged', () => {
    expect(esc('NVDA')).toBe('NVDA')
  })
})
