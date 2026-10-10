// The markets rail: one row per asset class a wall display should answer at a
// glance. Labels are short enough for a 600px column at 10-foot type sizes.
export const RAIL = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'Nasdaq' },
  { symbol: '^DJI', label: 'Dow' },
  { symbol: '^RUT', label: 'Russell 2000' },
  { symbol: '^VIX', label: 'VIX' },
  { symbol: '^TNX', label: 'US 10Y yield' },
  { symbol: 'DX-Y.NYB', label: 'Dollar index' },
  { symbol: 'GC=F', label: 'Gold' },
  { symbol: 'CL=F', label: 'Crude oil' },
  { symbol: 'BTC-USD', label: 'Bitcoin' },
]

export const RAIL_SYMBOLS = RAIL.map((r) => r.symbol)
export const RAIL_LABEL = Object.fromEntries(RAIL.map((r) => [r.symbol, r.label]))
