// Static registries for the Markets section: symbol groups (mirrors the TUI's
// market/sectors/commodities screens) and the 2026 US economic calendar.

export const MARKET_GROUPS = [
  {
    name: 'US Equity',
    items: [
      { symbol: '^GSPC', label: 'S&P 500' },
      { symbol: '^IXIC', label: 'Nasdaq Comp' },
      { symbol: '^DJI', label: 'Dow Jones' },
      { symbol: '^RUT', label: 'Russell 2000' },
      { symbol: '^NDX', label: 'Nasdaq 100' },
      { symbol: '^SOX', label: 'Semis (SOX)' },
    ],
  },
  {
    name: 'US Futures',
    items: [
      { symbol: 'ES=F', label: 'S&P 500 Fut' },
      { symbol: 'NQ=F', label: 'Nasdaq Fut' },
      { symbol: 'YM=F', label: 'Dow Fut' },
      { symbol: 'RTY=F', label: 'Russell Fut' },
      { symbol: 'ZN=F', label: '10Y Note Fut' },
      { symbol: 'ZB=F', label: '30Y Bond Fut' },
    ],
  },
  {
    name: 'Europe',
    items: [
      { symbol: '^FTSE', label: 'FTSE 100' },
      { symbol: '^GDAXI', label: 'DAX' },
      { symbol: '^FCHI', label: 'CAC 40' },
      { symbol: '^STOXX50E', label: 'Euro Stoxx 50' },
    ],
  },
  {
    name: 'Asia-Pacific',
    items: [
      { symbol: '^N225', label: 'Nikkei 225' },
      { symbol: '^HSI', label: 'Hang Seng' },
      { symbol: '000001.SS', label: 'Shanghai Comp' },
      { symbol: '^KS11', label: 'KOSPI' },
      { symbol: '^AXJO', label: 'ASX 200' },
    ],
  },
  {
    name: 'Rates & Vol',
    items: [
      { symbol: '^VIX', label: 'VIX' },
      { symbol: '^TNX', label: '10Y Yield' },
      { symbol: '^FVX', label: '5Y Yield' },
      { symbol: '^TYX', label: '30Y Yield' },
    ],
  },
  {
    name: 'FX',
    items: [
      { symbol: 'DX-Y.NYB', label: 'DXY' },
      { symbol: 'EURUSD=X', label: 'EUR/USD' },
      { symbol: 'GBPUSD=X', label: 'GBP/USD' },
      { symbol: 'USDJPY=X', label: 'USD/JPY' },
      { symbol: 'USDCNH=X', label: 'USD/CNH' },
      { symbol: 'USDCAD=X', label: 'USD/CAD' },
      { symbol: 'AUDUSD=X', label: 'AUD/USD' },
      { symbol: 'USDCHF=X', label: 'USD/CHF' },
    ],
  },
  {
    name: 'Crypto',
    items: [
      { symbol: 'BTC-USD', label: 'Bitcoin' },
      { symbol: 'ETH-USD', label: 'Ethereum' },
      { symbol: 'SOL-USD', label: 'Solana' },
      { symbol: 'XRP-USD', label: 'XRP' },
      { symbol: 'DOGE-USD', label: 'Dogecoin' },
    ],
  },
]

export const SECTORS = [
  { symbol: 'XLK', label: 'Technology' },
  { symbol: 'SMH', label: 'Semiconductors' },
  { symbol: 'XLF', label: 'Financials' },
  { symbol: 'XLE', label: 'Energy' },
  { symbol: 'XLV', label: 'Healthcare' },
  { symbol: 'XLI', label: 'Industrials' },
  { symbol: 'XLY', label: 'Cons. Discretionary' },
  { symbol: 'XLP', label: 'Cons. Staples' },
  { symbol: 'XLU', label: 'Utilities' },
  { symbol: 'XLRE', label: 'Real Estate' },
  { symbol: 'XLB', label: 'Materials' },
  { symbol: 'XLC', label: 'Comm. Services' },
]

export const COMMODITY_GROUPS = [
  {
    name: 'Energy',
    items: [
      { symbol: 'CL=F', label: 'WTI Crude Oil', unit: '$/bbl' },
      { symbol: 'BZ=F', label: 'Brent Crude', unit: '$/bbl' },
      { symbol: 'NG=F', label: 'Natural Gas', unit: '$/MMBtu' },
      { symbol: 'HO=F', label: 'Heating Oil', unit: '$/gal' },
      { symbol: 'RB=F', label: 'RBOB Gasoline', unit: '$/gal' },
    ],
  },
  {
    name: 'Metals',
    items: [
      { symbol: 'GC=F', label: 'Gold', unit: '$/oz' },
      { symbol: 'SI=F', label: 'Silver', unit: '$/oz' },
      { symbol: 'HG=F', label: 'Copper', unit: '$/lb' },
      { symbol: 'PL=F', label: 'Platinum', unit: '$/oz' },
      { symbol: 'PA=F', label: 'Palladium', unit: '$/oz' },
    ],
  },
  {
    name: 'Grains',
    items: [
      { symbol: 'ZW=F', label: 'Wheat', unit: '¢/bu' },
      { symbol: 'ZC=F', label: 'Corn', unit: '¢/bu' },
      { symbol: 'ZS=F', label: 'Soybeans', unit: '¢/bu' },
    ],
  },
  {
    name: 'Softs',
    items: [
      { symbol: 'CC=F', label: 'Cocoa', unit: '$/ton' },
      { symbol: 'KC=F', label: 'Coffee', unit: '¢/lb' },
      { symbol: 'CT=F', label: 'Cotton', unit: '¢/lb' },
      { symbol: 'SB=F', label: 'Sugar #11', unit: '¢/lb' },
    ],
  },
  {
    name: 'Crypto',
    items: [
      { symbol: 'BTC-USD', label: 'Bitcoin', unit: 'USD' },
      { symbol: 'ETH-USD', label: 'Ethereum', unit: 'USD' },
    ],
  },
]

// 2026 dates: FOMC decisions, CPI/NFP releases, advance GDP, PCE.
export const ECON_EVENTS = [
  ...['2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17', '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16']
    .map((date) => ({ date, type: 'FOMC', label: 'FOMC Rate Decision' })),
  ...['2026-01-14', '2026-02-11', '2026-03-11', '2026-04-14', '2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-13', '2026-11-12', '2026-12-10']
    .map((date) => ({ date, type: 'CPI', label: 'CPI Release' })),
  ...['2026-01-09', '2026-02-06', '2026-03-06', '2026-04-03', '2026-05-08', '2026-06-05', '2026-07-02', '2026-08-07', '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04']
    .map((date) => ({ date, type: 'NFP', label: 'Nonfarm Payrolls' })),
  ...['2026-01-29', '2026-04-29', '2026-07-30', '2026-10-29']
    .map((date) => ({ date, type: 'GDP', label: 'GDP (Advance)' })),
  ...['2026-01-30', '2026-02-27', '2026-03-27', '2026-04-30', '2026-05-29', '2026-06-26', '2026-07-31', '2026-08-28', '2026-09-25', '2026-10-30', '2026-11-25', '2026-12-23']
    .map((date) => ({ date, type: 'PCE', label: 'Core PCE' })),
].sort((a, b) => a.date.localeCompare(b.date))

/** Days from `today` (YYYY-MM-DD) to the event date; negative = past. */
export function daysUntil(eventDate, today) {
  const ms = new Date(`${eventDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Upcoming events within the horizon, soonest first. */
export function upcomingEvents(events, today, horizonDays = 60) {
  return events
    .map((e) => ({ ...e, days: daysUntil(e.date, today) }))
    .filter((e) => e.days >= 0 && e.days <= horizonDays)
}
