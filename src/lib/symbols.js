// Generic showcase universe — deliberately hardcoded, never env/secret-driven
// A secret carrying a real watchlist into a public build is
// a leak surface. Nothing here may reference a real portfolio.

// Ticker validation, defined once. The charset is wider than [A-Z] because
// Yahoo tickers carry dots (BF.B), hyphens (BRK-B), carets (^GSPC) and equals
// (GC=F); 12 chars clears the longest of them with room to spare.
//
// Two casings, because the stores and the entry points sit on opposite sides
// of the upcase. Anything that has already normalised its input (the
// localStorage stores, the hash router, which lowercases the whole hash before
// matching) tests the strict form, so a gate can never pass a string the store
// would then persist in the wrong case. The raw-input validators (chat tool
// args, the widget form) test before upcasing and need the loose form.
// No /g flag anywhere — a shared stateful regex would carry lastIndex between
// unrelated callers.
export const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/
export const SYMBOL_ANY_CASE_RE = /^[A-Za-z0-9.^=-]{1,12}$/

export const WATCHLIST = [
  'AAPL', 'MSFT', 'NVDA', 'GOOG', 'AMZN', 'META', 'TSLA',
  'AMD', 'INTC', 'TSM', 'PLTR', 'CRM', 'ORCL', 'NFLX', 'UBER', 'DIS',
  'JPM', 'V', 'BAC', 'GS', 'BRK-B', 'COIN',
  'LLY', 'UNH', 'JNJ', 'PG', 'KO', 'MCD', 'WMT',
  'XOM', 'CAT', 'BA',
  'SPY', 'QQQ', 'IWM', 'GLD', 'TLT',
]

// Broad standard-universe rosters (think index constituents, not a
// watchlist): membership decides which dashboard bucket a watched symbol
// files under, so wide coverage keeps new adds out of the General catch-all.
// Only symbols actually on the watchlist ever render.
export const BUCKETS = [
  { name: 'Megacaps', symbols: ['AAPL', 'MSFT', 'GOOG', 'GOOGL', 'AMZN', 'META', 'TSLA'] },
  { name: 'Semis', symbols: [
    'NVDA', 'AMD', 'INTC', 'TSM', 'AVGO', 'QCOM', 'MU', 'AMAT', 'LRCX',
    'ASML', 'KLAC', 'MRVL', 'ARM', 'TXN', 'ADI', 'NXPI', 'ON', 'MCHP', 'SMCI', 'SNDK',
    'SKHY', '000660.KS',
  ] },
  { name: 'Software & AI', symbols: [
    'PLTR', 'CRM', 'ORCL', 'ADBE', 'NOW', 'SNOW', 'MDB', 'DDOG', 'NET',
    'MSTR', 'SHOP', 'INTU', 'IBM',
  ] },
  { name: 'Consumer & Media', symbols: [
    'NFLX', 'DIS', 'UBER', 'SBUX', 'NKE', 'ABNB', 'BKNG', 'CMG', 'HD', 'LOW',
  ] },
  { name: 'Financials', symbols: [
    'JPM', 'V', 'MA', 'BAC', 'GS', 'MS', 'WFC', 'C', 'SCHW', 'BLK', 'AXP',
    'BRK-B', 'COIN', 'HOOD',
  ] },
  { name: 'Health', symbols: [
    'LLY', 'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'TMO', 'AMGN', 'NVO', 'ISRG',
  ] },
  { name: 'Staples', symbols: ['PG', 'KO', 'PEP', 'MCD', 'WMT', 'COST', 'TGT', 'CL', 'ADM'] },
  { name: 'Energy & Industrials', symbols: [
    'XOM', 'CVX', 'COP', 'SLB', 'CAT', 'BA', 'GE', 'DE', 'HON', 'LMT', 'RTX', 'UNP',
  ] },
  { name: 'ETFs & Macro', symbols: [
    'SPY', 'QQQ', 'IWM', 'DIA', 'SMH', 'SOXX', 'XLK', 'XLF', 'XLE',
    'GLD', 'GLDM', 'SLV', 'TLT', 'IEF', 'SGOV', 'BTC-USD', 'ETH-USD',
  ] },
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
  { symbol: 'SI=F', label: 'SILVER' },
  { symbol: 'HG=F', label: 'COPPER' },
  { symbol: 'CL=F', label: 'WTI' },
  { symbol: 'BZ=F', label: 'BRENT' },
  { symbol: 'NG=F', label: 'GAS' },
  { symbol: '^HSI', label: 'HSI' },
  { symbol: '^N225', label: 'N225' },
  { symbol: '^KS11', label: 'KOSPI' },
  { symbol: '000001.SS', label: 'SSE' },
  { symbol: 'BTC-USD', label: 'BTC' },
]

export const LABELS = Object.fromEntries(INDICES.map((i) => [i.symbol, i.label]))
