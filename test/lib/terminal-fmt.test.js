import { describe, it, expect } from 'vitest'
import {
  fmtThesis, fmtMarket, fmtTechnicals, fmtLookup,
  fmtNews, fmtEarnings, fmtCalendar, fmtCommodities,
  fmtAlerts, fmtJournal, fmtWatchlist,
} from '../../src/lib/terminal-fmt.js'

// ── Helpers ───────────────────────────────────────────
// Extract all text from a lines array (handles both legacy {text} and rich [{text}...])
function allText(lines) {
  return lines.map(l =>
    Array.isArray(l) ? l.map(s => s.text).join('') : l.text
  ).join('\n')
}

// Check that every line is either a {text,color} object or an array of such segments
function isValidLines(lines) {
  return lines.every(l => {
    if (Array.isArray(l)) return l.every(s => 'text' in s && 'color' in s)
    return 'text' in l && 'color' in l
  })
}

// ── Fixtures ──────────────────────────────────────────
const QUOTES = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 125.3, change: 2.45, pct: 1.99, ext_price: null },
  { symbol: 'AAPL', name: 'Apple Inc.', price: 195.0, change: -1.2, pct: -0.61, ext_price: null },
]

const TECHNICALS = {
  NVDA: {
    current: 125.3, sma_20: 120.0, sma_50: 115.0, sma_200: 100.0,
    rsi: 58.3, macd: 2.1, macd_signal: 1.8, macd_histogram: 0.3,
    macd_crossover: 'Bullish',
    bb_upper: 130.0, bb_lower: 110.0,
    atr: 4.5, atr_pct: 3.6, vol_ratio: 1.2,
    high_52w: 140.0, low_52w: 85.0, off_high: -10.5, off_low: 47.4,
    rs_vs_bench: 5.2,
    trend_signals: ['Golden Cross'],
  },
}

const EARNINGS = [
  { symbol: 'NVDA', date: '2025-02-26', days_until: 10 },
]

const SPARKLINES = {
  NVDA: [100, 105, 103, 110, 115, 112, 120, 125],
}

const LOOKUP_DATA = {
  longName: 'NVIDIA Corporation',
  sector: 'Technology',
  industry: 'Semiconductors',
  currentPrice: 125.3,
  regularMarketChange: 2.45,
  regularMarketChangePercent: 1.99,
  marketCap: 3.1e12,
  trailingPE: 35.5,
  forwardPE: 28.2,
  priceToSalesTrailing12Months: 20.1,
  priceToBook: 25.3,
  trailingPegRatio: 1.2,
  enterpriseToEbitda: 50.1,
  enterpriseToRevenue: 20.3,
  totalRevenue: 6e10,
  grossMargins: 0.73,
  operatingMargins: 0.54,
  profitMargins: 0.48,
  returnOnEquity: 1.23,
  revenueGrowth: 0.94,
  earningsGrowth: 1.20,
  totalCash: 2.5e10,
  totalDebt: 1.1e10,
  debtToEquity: 43.2,
  currentRatio: 4.2,
  quickRatio: 3.8,
  sharesOutstanding: 2.4e10,
  floatShares: 2.3e10,
  shortPercentOfFloat: 0.012,
  heldPercentInsiders: 0.042,
  heldPercentInstitutions: 0.65,
  recommendationKey: 'strong_buy',
  numberOfAnalystOpinions: 40,
  targetMeanPrice: 160.0,
  targetHighPrice: 200.0,
  targetLowPrice: 120.0,
}

// ── fmtThesis ────────────────────────────────────────
describe('fmtThesis', () => {
  it('returns valid lines array', () => {
    const lines = fmtThesis(QUOTES, TECHNICALS, EARNINGS, SPARKLINES)
    expect(Array.isArray(lines)).toBe(true)
    expect(isValidLines(lines)).toBe(true)
  })
  it('includes each symbol in output', () => {
    const lines = fmtThesis(QUOTES, TECHNICALS, EARNINGS, SPARKLINES)
    const text = allText(lines)
    expect(text).toContain('NVDA')
    expect(text).toContain('AAPL')
  })
  it('includes price and pct in output', () => {
    const lines = fmtThesis(QUOTES, TECHNICALS, EARNINGS, SPARKLINES)
    const text = allText(lines)
    expect(text).toContain('125.30')
    expect(text).toContain('+1.99%')
  })
  it('includes RSI when technicals present', () => {
    const lines = fmtThesis(QUOTES, TECHNICALS, EARNINGS, SPARKLINES)
    const text = allText(lines)
    expect(text).toContain('RSI')
    expect(text).toContain('58')
  })
  it('includes sparkline unicode characters when sparklines present', () => {
    const lines = fmtThesis(QUOTES, TECHNICALS, EARNINGS, SPARKLINES)
    const text = allText(lines)
    const sparkChars = '▁▂▃▄▅▆▇█'
    expect([...text].some(c => sparkChars.includes(c))).toBe(true)
  })
  it('includes earnings countdown when earnings present', () => {
    const lines = fmtThesis(QUOTES, TECHNICALS, EARNINGS, SPARKLINES)
    const text = allText(lines)
    expect(text).toContain('EPS')
    expect(text).toContain('10d')
  })
  it('returns fallback line for empty quotes', () => {
    const lines = fmtThesis([], {}, [], {})
    expect(lines.length).toBeGreaterThan(0)
    const text = allText(lines)
    expect(text).toContain('No quote data')
  })
  it('handles null inputs gracefully', () => {
    const lines = fmtThesis(null, null, null, null)
    expect(Array.isArray(lines)).toBe(true)
    expect(isValidLines(lines)).toBe(true)
  })
  it('includes extended hours when ext_price present', () => {
    const quotesWithExt = [
      { ...QUOTES[0], ext_price: 126.5, ext_pct: 0.96, ext_label: 'AH' },
    ]
    const lines = fmtThesis(quotesWithExt, {}, [], {})
    const text = allText(lines)
    expect(text).toContain('AH')
    expect(text).toContain('126.50')
  })
  it('shows summary stats in header line', () => {
    const lines = fmtThesis(QUOTES, TECHNICALS, EARNINGS, SPARKLINES)
    const text = allText(lines)
    expect(text).toContain('2 symbols')
    expect(text).toContain('▲')
    expect(text).toContain('▼')
  })
})

// ── fmtMarket ────────────────────────────────────────
describe('fmtMarket', () => {
  const MARKET = {
    'US Equity': [
      { symbol: 'SPY', name: 'S&P 500', price: 550.0, pct: 0.5 },
      { symbol: 'QQQ', name: 'Nasdaq', price: 480.0, pct: -0.3 },
    ],
    'Crypto': [
      { symbol: 'BTC', name: 'Bitcoin', price: 85000.0, pct: 1.2 },
    ],
  }

  it('returns valid lines array', () => {
    const lines = fmtMarket(MARKET)
    expect(isValidLines(lines)).toBe(true)
  })
  it('includes category names', () => {
    const text = allText(fmtMarket(MARKET))
    expect(text).toContain('US Equity')
    expect(text).toContain('Crypto')
  })
  it('includes prices and pcts', () => {
    const text = allText(fmtMarket(MARKET))
    expect(text).toContain('550.00')
    expect(text).toContain('+0.50%')
  })
  it('returns fallback for null', () => {
    const lines = fmtMarket(null)
    expect(allText(lines)).toContain('No market data')
  })
})

// ── fmtTechnicals ────────────────────────────────────
describe('fmtTechnicals', () => {
  const ta = TECHNICALS.NVDA

  it('returns valid lines array', () => {
    const lines = fmtTechnicals(ta, 'NVDA')
    expect(isValidLines(lines)).toBe(true)
  })
  it('includes symbol in title', () => {
    const text = allText(fmtTechnicals(ta, 'NVDA'))
    expect(text).toContain('NVDA')
  })
  it('includes SMA values', () => {
    const text = allText(fmtTechnicals(ta, 'NVDA'))
    expect(text).toContain('SMA 20')
    expect(text).toContain('120.00')
  })
  it('includes RSI with label', () => {
    const text = allText(fmtTechnicals(ta, 'NVDA'))
    expect(text).toContain('RSI')
    expect(text).toContain('58')
    expect(text).toContain('Neutral')
  })
  it('includes RSI Overbought label for rsi >= 70', () => {
    const text = allText(fmtTechnicals({ ...ta, rsi: 72 }, 'NVDA'))
    expect(text).toContain('Overbought')
  })
  it('includes RSI Oversold label for rsi <= 30', () => {
    const text = allText(fmtTechnicals({ ...ta, rsi: 28 }, 'NVDA'))
    expect(text).toContain('Oversold')
  })
  it('includes MACD values', () => {
    const text = allText(fmtTechnicals(ta, 'NVDA'))
    expect(text).toContain('MACD')
    expect(text).toContain('2.100')
  })
  it('includes 52w range', () => {
    const text = allText(fmtTechnicals(ta, 'NVDA'))
    expect(text).toContain('52w High')
    expect(text).toContain('140.00')
  })
  it('includes RS vs benchmark', () => {
    const text = allText(fmtTechnicals(ta, 'NVDA'))
    expect(text).toContain('RS vs QQQ')
    expect(text).toContain('+5.20%')
  })
  it('includes trend signals', () => {
    const text = allText(fmtTechnicals(ta, 'NVDA'))
    expect(text).toContain('Golden Cross')
  })
  it('skips missing fields gracefully', () => {
    // Only RSI, no MACD, no BB, no RS
    const sparse = { current: 100, rsi: 45 }
    const lines = fmtTechnicals(sparse, 'TEST')
    expect(isValidLines(lines)).toBe(true)
    const text = allText(lines)
    expect(text).toContain('TEST')
    expect(text).not.toContain('MACD') // skipped
  })
  it('returns fallback for null ta', () => {
    const lines = fmtTechnicals(null, 'TEST')
    expect(allText(lines)).toContain('No technicals')
  })
})

// ── fmtLookup ────────────────────────────────────────
describe('fmtLookup', () => {
  it('returns valid lines array', () => {
    const lines = fmtLookup(LOOKUP_DATA, 'NVDA', 'NVIDIA')
    expect(isValidLines(lines)).toBe(true)
  })
  it('includes symbol and company name', () => {
    const text = allText(fmtLookup(LOOKUP_DATA, 'NVDA', 'NVIDIA'))
    expect(text).toContain('NVDA')
    expect(text).toContain('NVIDIA Corporation')
  })
  it('includes valuation multiples', () => {
    const text = allText(fmtLookup(LOOKUP_DATA, 'NVDA', 'NVIDIA'))
    expect(text).toContain('P/E (TTM)')
    expect(text).toContain('35.50')
    expect(text).toContain('EV/EBITDA')
  })
  it('includes financial metrics', () => {
    const text = allText(fmtLookup(LOOKUP_DATA, 'NVDA', 'NVIDIA'))
    expect(text).toContain('Gross Margin')
    expect(text).toContain('73.0%')
  })
  it('includes analyst rating', () => {
    const text = allText(fmtLookup(LOOKUP_DATA, 'NVDA', 'NVIDIA'))
    expect(text).toContain('STRONG BUY')
    expect(text).toContain('160.00')
  })
  it('includes post-market price when present', () => {
    const data = { ...LOOKUP_DATA, postMarketPrice: 127.0, postMarketChangePercent: 1.35 }
    const text = allText(fmtLookup(data, 'NVDA', ''))
    expect(text).toContain('After Hours')
    expect(text).toContain('127.00')
  })
  it('skips post-market section when absent', () => {
    const text = allText(fmtLookup(LOOKUP_DATA, 'NVDA', ''))
    expect(text).not.toContain('After Hours')
  })
  it('returns fallback for null data', () => {
    const lines = fmtLookup(null, 'TEST', '')
    expect(allText(lines)).toContain('No data for TEST')
  })
  it('skips null/undefined financial fields without crashing', () => {
    const sparse = { longName: 'Test Corp', sector: 'Tech', industry: 'Software' }
    const lines = fmtLookup(sparse, 'TEST', '')
    expect(isValidLines(lines)).toBe(true)
  })
})

// ── fmtNews ──────────────────────────────────────────
describe('fmtNews', () => {
  const NEWS_ARRAY = [
    { title: 'NVDA Beats Earnings', publisher: 'Reuters', age: '2h ago' },
    { title: 'AI boom continues', publisher: 'Bloomberg', age: '4h ago' },
  ]
  const NEWS_MAP = { NVDA: NEWS_ARRAY }

  it('handles flat array format', () => {
    const text = allText(fmtNews(NEWS_ARRAY))
    expect(text).toContain('NVDA Beats Earnings')
  })
  it('handles symbol-keyed map format', () => {
    const text = allText(fmtNews(NEWS_MAP, 'NVDA'))
    expect(text).toContain('NVDA Beats Earnings')
  })
  it('returns all news when no symbol and map passed', () => {
    const text = allText(fmtNews(NEWS_MAP))
    expect(text).toContain('NVDA Beats Earnings')
  })
  it('returns fallback for null', () => {
    const text = allText(fmtNews(null, 'NVDA'))
    expect(text).toContain('No news')
  })
  it('returns fallback for symbol not in map', () => {
    const text = allText(fmtNews(NEWS_MAP, 'AAPL'))
    expect(text).toContain('No news')
  })
  it('limits to 15 items', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `Story ${i}`, publisher: '', age: '' }))
    const lines = fmtNews(many)
    const text = allText(lines)
    // Story 0-14 should appear, Story 15-19 should not
    expect(text).toContain('Story 14')
    expect(text).not.toContain('Story 15')
  })
})

// ── fmtEarnings ──────────────────────────────────────
describe('fmtEarnings', () => {
  it('shows earnings entries', () => {
    const lines = fmtEarnings([
      { symbol: 'NVDA', date: '2025-02-26', days_until: 10 },
      { symbol: 'AAPL', date: '2025-03-05', days_until: 17 },
    ])
    const text = allText(lines)
    expect(text).toContain('NVDA')
    expect(text).toContain('10d')
  })
  it('returns fallback for empty array', () => {
    const text = allText(fmtEarnings([]))
    expect(text).toContain('No earnings data')
  })
  it('returns fallback for null', () => {
    const text = allText(fmtEarnings(null))
    expect(text).toContain('No earnings data')
  })
})

// ── fmtCommodities ───────────────────────────────────
describe('fmtCommodities', () => {
  const COMMODITIES = {
    'Energy': [
      { symbol: 'CL', name: 'Crude Oil', price: 72.5, pct: -0.8, unit: 'USD/bbl' },
    ],
    'Metals': [
      { symbol: 'GC', name: 'Gold', price: 3200.0, pct: 0.3, unit: 'USD/oz' },
    ],
  }

  it('returns valid lines', () => {
    expect(isValidLines(fmtCommodities(COMMODITIES))).toBe(true)
  })
  it('includes category names', () => {
    const text = allText(fmtCommodities(COMMODITIES))
    expect(text).toContain('Energy')
    expect(text).toContain('Metals')
  })
  it('formats low-price commodities to 4 decimals', () => {
    const data = { 'Rates': [{ name: 'USD/JPY', price: 1.234, pct: 0.1 }] }
    const text = allText(fmtCommodities(data))
    expect(text).toContain('1.2340')
  })
  it('returns fallback for null', () => {
    const text = allText(fmtCommodities(null))
    expect(text).toContain('No commodity data')
  })
})

// ── fmtAlerts ────────────────────────────────────────
describe('fmtAlerts', () => {
  it('shows active alerts', () => {
    const text = allText(fmtAlerts([
      { id: 1, symbol: 'NVDA', operator: '>', value: 150 },
      { id: 2, symbol: 'AAPL', operator: '<', value: 180 },
    ]))
    expect(text).toContain('NVDA')
    expect(text).toContain('>')
    expect(text).toContain('150.00')
    expect(text).toContain('AAPL')
  })
  it('shows empty state message', () => {
    const text = allText(fmtAlerts([]))
    expect(text).toContain('No active alerts')
    expect(text).toContain('Usage')
  })
})

// ── fmtJournal ───────────────────────────────────────
describe('fmtJournal', () => {
  it('shows journal entries', () => {
    const entries = [
      { id: 1, ts: new Date().toISOString(), text: 'Bought 100 shares of NVDA at support.', symbols: ['NVDA'] },
    ]
    const text = allText(fmtJournal(entries))
    expect(text).toContain('NVDA')
    expect(text).toContain('Bought 100 shares')
  })
  it('limits display to last 20 entries', () => {
    // 25 entries but only 20 shown (slice(-20))
    const entries = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1, ts: new Date().toISOString(), text: `Entry ${i + 1}`, symbols: [],
    }))
    const text = allText(fmtJournal(entries))
    expect(text).toContain('Entry 25') // last entry
    expect(text).not.toContain('Entry 5') // 6th from start, before slice(-20)
  })
  it('shows empty state', () => {
    const text = allText(fmtJournal([]))
    expect(text).toContain('No journal entries')
  })
})

// ── fmtWatchlist ─────────────────────────────────────
describe('fmtWatchlist', () => {
  it('shows symbols', () => {
    const text = allText(fmtWatchlist(['NVDA', 'AAPL', 'GOOG']))
    expect(text).toContain('NVDA')
    expect(text).toContain('AAPL')
  })
  it('shows empty state when no symbols', () => {
    const text = allText(fmtWatchlist([]))
    expect(text).toContain('Using default watchlist')
  })
  it('shows empty state for null', () => {
    const text = allText(fmtWatchlist(null))
    expect(text).toContain('Using default watchlist')
  })
})
