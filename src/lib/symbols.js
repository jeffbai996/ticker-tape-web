// Generic showcase universe — deliberately hardcoded, never env/secret-driven
// (HANDOFF_SPEC §5): a secret carrying a real watchlist into a public build is
// a leak surface. Nothing here may reference a real portfolio.

export const WATCHLIST = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA',
  'AMD', 'INTC', 'TSM', 'PLTR', 'CRM', 'ORCL', 'NFLX', 'UBER', 'DIS',
  'JPM', 'V', 'BAC', 'GS', 'BRK-B', 'COIN',
  'LLY', 'UNH', 'JNJ', 'PG', 'KO', 'MCD', 'WMT',
  'XOM', 'CAT', 'BA',
  'SPY', 'QQQ', 'IWM', 'GLD', 'TLT',
]

export const BUCKETS = [
  { name: 'Mega Tech', symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'] },
  { name: 'Semis & AI', symbols: ['NVDA', 'AMD', 'INTC', 'TSM', 'PLTR'] },
  { name: 'Software & Media', symbols: ['CRM', 'ORCL', 'NFLX', 'UBER', 'DIS'] },
  { name: 'Financials', symbols: ['JPM', 'V', 'BAC', 'GS', 'BRK-B', 'COIN'] },
  { name: 'Health & Staples', symbols: ['LLY', 'UNH', 'JNJ', 'PG', 'KO', 'MCD', 'WMT'] },
  { name: 'Old Economy', symbols: ['XOM', 'CAT', 'BA'] },
  { name: 'ETFs & Macro', symbols: ['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'] },
]

// Status-bar index strip + tape marquee
export const INDICES = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ' },
  { symbol: '^DJI', label: 'DOW' },
  { symbol: '^RUT', label: 'RUT' },
  { symbol: '^SOX', label: 'SOX' },
  { symbol: '^VIX', label: 'VIX' },
  { symbol: '^TNX', label: 'US10Y' },
  { symbol: 'GC=F', label: 'GOLD' },
  { symbol: 'CL=F', label: 'WTI' },
  { symbol: 'BTC-USD', label: 'BTC' },
]

export const LABELS = Object.fromEntries(INDICES.map((i) => [i.symbol, i.label]))
