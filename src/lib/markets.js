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
      { symbol: '^MID', label: 'S&P MidCap 400' },
      { symbol: '^OEX', label: 'S&P 100' },
      { symbol: '^SP500EW', label: 'S&P 500 Equal Weight' },
      { symbol: '^NYA', label: 'NYSE Composite' },
      { symbol: '^XAX', label: 'NYSE American' },
      { symbol: '^DJT', label: 'Dow Transports' },
      { symbol: '^DJU', label: 'Dow Utilities' },
    ],
  },
  {
    name: 'US Futures',
    items: [
      { symbol: 'ES=F', label: 'S&P 500 Future' },
      { symbol: 'NQ=F', label: 'Nasdaq Future' },
      { symbol: 'YM=F', label: 'Dow Future' },
      { symbol: 'RTY=F', label: 'Russell Future' },
      { symbol: 'ZN=F', label: '10Y Note Future' },
      { symbol: 'ZB=F', label: '30Y Bond Future' },
      { symbol: 'ZF=F', label: '5Y Note Future' },
      { symbol: 'ZT=F', label: '2Y Note Future' },
      { symbol: 'EMD=F', label: 'MidCap Future' },
    ],
  },
  {
    name: 'Global ETFs',
    items: [
      { symbol: 'ACWI', label: 'Global equities' },
      { symbol: 'EFA', label: 'Developed ex-US' },
      { symbol: 'EEM', label: 'Emerging markets' },
      { symbol: 'VGK', label: 'Europe ETF' },
      { symbol: 'EWJ', label: 'Japan ETF' },
      { symbol: 'MCHI', label: 'China ETF' },
      { symbol: 'RSP', label: 'S&P 500 Equal Weight ETF' },
      { symbol: 'SPY', label: 'S&P 500 ETF' },
      { symbol: 'INDA', label: 'India ETF' },
      { symbol: 'EWZ', label: 'Brazil ETF' },
      { symbol: 'EWY', label: 'Korea ETF' },
      { symbol: 'EWT', label: 'Taiwan ETF' },
    ],
  },
  {
    name: 'Canada',
    items: [
      { symbol: '^GSPTSE', label: 'S&P/TSX Composite' },
      { symbol: 'XIU.TO', label: 'TSX 60 ETF' },
      { symbol: 'XEG.TO', label: 'TSX Energy' },
      { symbol: 'XFN.TO', label: 'TSX Financials' },
      { symbol: 'XGD.TO', label: 'TSX Gold' },
      { symbol: 'CADUSD=X', label: 'CAD/USD' },
    ],
  },
  {
    name: 'Europe',
    items: [
      { symbol: '^FTSE', label: 'FTSE 100' },
      { symbol: '^GDAXI', label: 'DAX' },
      { symbol: '^FCHI', label: 'CAC 40' },
      { symbol: '^STOXX50E', label: 'Euro Stoxx 50' },
      { symbol: '^IBEX', label: 'IBEX 35' },
      { symbol: 'FTSEMIB.MI', label: 'FTSE MIB' },
      { symbol: '^AEX', label: 'AEX' },
      { symbol: '^SSMI', label: 'Swiss Market' },
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
      { symbol: '^TWII', label: 'Taiwan Weighted' },
      { symbol: '^STI', label: 'Straits Times' },
      { symbol: '^BSESN', label: 'BSE Sensex' },
      { symbol: '^JKSE', label: 'Jakarta Composite' },
      { symbol: '^NZ50', label: 'NZX 50' },
    ],
  },
  {
    name: 'Credit',
    items: [
      { symbol: 'HYG', label: 'US high yield' },
      { symbol: 'LQD', label: 'US investment grade' },
      { symbol: 'EMB', label: 'Emerging sovereign debt' },
      { symbol: 'BND', label: 'US aggregate bonds' },
      { symbol: 'TLT', label: 'Long Treasuries' },
      { symbol: 'SHY', label: 'Short Treasuries' },
      { symbol: 'TIP', label: 'Inflation-linked bonds' },
      { symbol: 'JNK', label: 'High yield (JNK)' },
      { symbol: 'BKLN', label: 'Senior loans' },
      { symbol: 'MUB', label: 'Municipals' },
      { symbol: 'IEF', label: '7-10Y Treasuries' },
    ],
  },
  {
    // Curve rows are derived from the yields above them — `spread` names the
    // two symbols to subtract. Every symbol here was probe-checked against
    // the proxy; ^RVX returns nothing and is deliberately absent.
    name: 'Rates',
    items: [
      { symbol: '^IRX', label: '3M Bill' },
      { symbol: '^FVX', label: '5Y Yield' },
      { symbol: '^TNX', label: '10Y Yield' },
      { symbol: '^TYX', label: '30Y Yield' },
      { label: '10Y − 3M', spread: ['^TNX', '^IRX'], hint: 'curve' },
      { label: '30Y − 5Y', spread: ['^TYX', '^FVX'], hint: 'long end' },
      { label: '10Y − 5Y', spread: ['^TNX', '^FVX'], hint: 'belly' },
      { label: '30Y − 10Y', spread: ['^TYX', '^TNX'], hint: 'term premium' },
    ],
  },
  {
    name: 'Volatility',
    items: [
      { symbol: '^VIX', label: 'VIX' },
      { symbol: '^VIX9D', label: 'VIX 9D' },
      { symbol: '^VVIX', label: 'VVIX' },
      { symbol: '^VXN', label: 'Nasdaq VXN' },
      { symbol: '^MOVE', label: 'MOVE (bonds)' },
      { symbol: '^SKEW', label: 'SKEW' },
      { symbol: '^OVX', label: 'Oil OVX' },
      { symbol: '^GVZ', label: 'Gold GVZ' },
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
      { symbol: 'USDKRW=X', label: 'USD/KRW' },
      { symbol: 'USDINR=X', label: 'USD/INR' },
      { symbol: 'USDMXN=X', label: 'USD/MXN' },
      { symbol: 'NZDUSD=X', label: 'NZD/USD' },
    ],
  },
  {
    // The eleven GICS sectors as tradeable proxies — sector rotation is the
    // whole game for a concentrated book, and reading it off index levels
    // alone doesn't work.
    name: 'US Sectors',
    items: [
      { symbol: 'XLK', label: 'Technology' },
      { symbol: 'XLF', label: 'Financials' },
      { symbol: 'XLE', label: 'Energy' },
      { symbol: 'XLV', label: 'Health Care' },
      { symbol: 'XLI', label: 'Industrials' },
      { symbol: 'XLY', label: 'Cons. Discretionary' },
      { symbol: 'XLP', label: 'Cons. Staples' },
      { symbol: 'XLU', label: 'Utilities' },
      { symbol: 'XLB', label: 'Materials' },
      { symbol: 'XLRE', label: 'Real Estate' },
      { symbol: 'XLC', label: 'Communication Svcs' },
    ],
  },
  {
    name: 'Factors & Style',
    items: [
      { symbol: 'IWF', label: 'Large Growth' },
      { symbol: 'IWD', label: 'Large Value' },
      { symbol: 'MTUM', label: 'Momentum' },
      { symbol: 'QUAL', label: 'Quality' },
      { symbol: 'USMV', label: 'Min Volatility' },
      { symbol: 'SPHB', label: 'High Beta' },
      { symbol: 'IWM', label: 'Small Cap' },
      { symbol: 'SPLV', label: 'Low Volatility' },
    ],
  },
  {
    name: 'AI & Semis',
    items: [
      { symbol: 'SOXX', label: 'Semis (SOXX)' },
      { symbol: 'SMH', label: 'Semis (SMH)' },
      { symbol: 'QQQ', label: 'Nasdaq 100 ETF' },
      { symbol: 'IGV', label: 'Software' },
      { symbol: 'SKYY', label: 'Cloud' },
      { symbol: 'BOTZ', label: 'Robotics & AI' },
      { symbol: 'XLU', label: 'Utilities (AI power)' },
      { symbol: 'URA', label: 'Uranium' },
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

/** The highest-signal cross-asset prints, reused by the dashboard market deck. */
/** The landing page's one macro read, painted as a two-column grid of
 *  percentage moves. Rows are paired left/right in source order, so the list
 *  is ordered by what belongs beside what: US size ladder, then equity
 *  outside the US, then the two risk gauges, the curve, the dollar and its
 *  crosses, metals, energy, and crypto last.
 *
 *  On the Treasury rows: Yahoo publishes ^IRX (13-week bill), ^FVX (5Y),
 *  ^TNX (10Y) and ^TYX (30Y) — there is no 2-year series to add, so the
 *  front end here is the bill. ^FVX is left out because the belly moves with
 *  the 10Y closely enough that a second near-identical row buys nothing on a
 *  glance panel.
 *
 *  HYG is the only credit row and the only ETF: nothing else in the deck
 *  prices spread. A duration ETF such as TLT would add no information — its
 *  move is the inverse of the yields already on the panel.
 *
 *  Every symbol verified against the Worker quote path (2026-08-18); each
 *  returns a live price. Labels reuse the strings the market groups already
 *  use, which is what keeps the zh side complete.
 */
export const MARKET_DECK = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^NDX', label: 'Nasdaq 100' },
  { symbol: '^DJI', label: 'Dow Jones' },
  { symbol: '^RUT', label: 'Russell 2000' },
  { symbol: '^STOXX50E', label: 'Euro Stoxx 50' },
  { symbol: '^N225', label: 'Nikkei 225' },
  { symbol: '^VIX', label: 'VIX' },
  { symbol: 'HYG', label: 'US high yield' },
  { symbol: '^IRX', label: '3M Bill' },
  { symbol: '^TNX', label: '10Y Yield' },
  { symbol: '^TYX', label: '30Y Yield' },
  { symbol: 'DX-Y.NYB', label: 'DXY' },
  { symbol: 'EURUSD=X', label: 'EUR/USD' },
  { symbol: 'USDJPY=X', label: 'USD/JPY' },
  { symbol: 'GC=F', label: 'Gold' },
  { symbol: 'SI=F', label: 'Silver' },
  { symbol: 'HG=F', label: 'Copper' },
  { symbol: 'CL=F', label: 'WTI Crude Oil' },
  { symbol: 'NG=F', label: 'Natural Gas' },
  { symbol: 'BTC-USD', label: 'Bitcoin' },
]

/** Relative-value ratios turn the symbol wall into actual market structure. */
export const RELATIVE_SIGNALS = [
  { label: 'Equal weight / S&P', a: 'RSP', b: 'SPY' },
  { label: 'Semis / Nasdaq', a: 'SMH', b: 'QQQ' },
  { label: 'High yield / IG', a: 'HYG', b: 'LQD' },
  { label: 'Gold / Silver', a: 'GC=F', b: 'SI=F' },
  { label: 'Bitcoin / Gold', a: 'BTC-USD', b: 'GC=F' },
  { label: 'Growth / Value', a: 'IWF', b: 'IWD' },
  { label: 'Small / Large', a: 'IWM', b: 'SPY' },
  { label: 'Discretionary / Staples', a: 'XLY', b: 'XLP' },
  { label: 'Copper / Gold', a: 'HG=F', b: 'GC=F' },
  { label: 'Long bonds / Stocks', a: 'TLT', b: 'SPY' },
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
      { symbol: 'ALI=F', label: 'Aluminum', unit: '$/ton' },
    ],
  },
  {
    name: 'Grains',
    items: [
      { symbol: 'ZW=F', label: 'Wheat', unit: '¢/bu' },
      { symbol: 'ZC=F', label: 'Corn', unit: '¢/bu' },
      { symbol: 'ZS=F', label: 'Soybeans', unit: '¢/bu' },
      { symbol: 'ZO=F', label: 'Oats', unit: '¢/bu' },
      { symbol: 'ZR=F', label: 'Rough Rice', unit: '$/cwt' },
      { symbol: 'ZM=F', label: 'Soybean Meal', unit: '$/ton' },
      { symbol: 'ZL=F', label: 'Soybean Oil', unit: '¢/lb' },
    ],
  },
  {
    name: 'Softs',
    items: [
      { symbol: 'CC=F', label: 'Cocoa', unit: '$/ton' },
      { symbol: 'KC=F', label: 'Coffee', unit: '¢/lb' },
      { symbol: 'CT=F', label: 'Cotton', unit: '¢/lb' },
      { symbol: 'SB=F', label: 'Sugar #11', unit: '¢/lb' },
      { symbol: 'OJ=F', label: 'Orange Juice', unit: '¢/lb' },
      { symbol: 'LBR=F', label: 'Lumber', unit: '$/mbf' },
    ],
  },
  {
    name: 'Livestock',
    items: [
      { symbol: 'LE=F', label: 'Live Cattle', unit: '¢/lb' },
      { symbol: 'GF=F', label: 'Feeder Cattle', unit: '¢/lb' },
      { symbol: 'HE=F', label: 'Lean Hogs', unit: '¢/lb' },
    ],
  },
  {
    name: 'Crypto',
    items: [
      { symbol: 'BTC-USD', label: 'Bitcoin', unit: 'USD' },
      { symbol: 'ETH-USD', label: 'Ethereum', unit: 'USD' },
      { symbol: 'SOL-USD', label: 'Solana', unit: 'USD' },
      { symbol: 'BNB-USD', label: 'BNB', unit: 'USD' },
      { symbol: 'XRP-USD', label: 'XRP', unit: 'USD' },
      { symbol: 'ADA-USD', label: 'Cardano', unit: 'USD' },
    ],
  },
]

// 2026 dates: FOMC decisions, CPI/NFP releases, advance GDP, PCE.

/** The names whose reports move the tape whether you hold them or not — the
 *  megacaps plus the heavyweights of the NDX-100/S&P top-100. The earnings
 *  widget and page merge these with the watchlist (Jeff 2026-08-06). */
/** Names for the universe above. A symbol only carries a company name when
 *  the quote feed has fetched it, and the widget deliberately lists names you
 *  DON'T hold — so half the rows sat nameless (Jeff 2026-08-06). This is the
 *  fallback: static, no extra request, and company names don't move. */
export const EARNINGS_NAMES = {
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corporation',
  NVDA: 'NVIDIA Corporation',
  GOOG: 'Alphabet Inc.',
  AMZN: 'Amazon.com, Inc.',
  META: 'Meta Platforms, Inc.',
  TSLA: 'Tesla, Inc.',
  'BRK-B': 'Berkshire Hathaway Inc.',
  LLY: 'Eli Lilly and Company',
  JPM: 'JPMorgan Chase & Co.',
  V: 'Visa Inc.',
  UNH: 'UnitedHealth Group Incorporated',
  XOM: 'Exxon Mobil Corporation',
  MA: 'Mastercard Incorporated',
  COST: 'Costco Wholesale Corporation',
  HD: 'The Home Depot, Inc.',
  PG: 'The Procter & Gamble Company',
  JNJ: 'Johnson & Johnson',
  ABBV: 'AbbVie Inc.',
  WMT: 'Walmart Inc.',
  NFLX: 'Netflix, Inc.',
  CRM: 'Salesforce, Inc.',
  BAC: 'Bank of America Corporation',
  ORCL: 'Oracle Corporation',
  KO: 'The Coca-Cola Company',
  CVX: 'Chevron Corporation',
  AMD: 'Advanced Micro Devices, Inc.',
  MRK: 'Merck & Co., Inc.',
  PEP: 'PepsiCo, Inc.',
  ADBE: 'Adobe Inc.',
  TMO: 'Thermo Fisher Scientific Inc.',
  MU: 'Micron Technology, Inc.',
  GOOGL: 'Alphabet Inc.',
  AMAT: 'Applied Materials, Inc.',
  QCOM: 'QUALCOMM Incorporated',
  TXN: 'Texas Instruments Incorporated',
  INTC: 'Intel Corporation',
  INTU: 'Intuit Inc.',
  CAT: 'Caterpillar Inc.',
  GE: 'GE Aerospace',
  GS: 'The Goldman Sachs Group, Inc.',
  MS: 'Morgan Stanley',
  PLTR: 'Palantir Technologies Inc.',
  TSM: 'Taiwan Semiconductor Manufacturing Company Limited',
  ASML: 'ASML Holding N.V.',
  NOW: 'ServiceNow, Inc.',
  ISRG: 'Intuitive Surgical, Inc.',
  BKNG: 'Booking Holdings Inc.',
  AXP: 'American Express Company',
}

export const EARNINGS_UNIVERSE = Object.keys(EARNINGS_NAMES)

// 2026 US federal holidays (Independence Day observed Friday Jul 3). Data
// agencies follow this calendar, NOT the NYSE one in marketState.js — Good
// Friday closes the exchange but BLS/ISM still publish that morning.
const FED_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19',
  '2026-07-03', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26',
  '2026-12-25',
])

const iso = (d) => d.toISOString().slice(0, 10)

/** ISO date `n` days after an ISO date. */
export function shiftDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/** The `n`-th business day of a month, skipping weekends and federal
 *  holidays — ISM publishes on the 1st (manufacturing) and 3rd (services). */
export function nthBusinessDay(year, month, n, holidays = FED_HOLIDAYS_2026) {
  const d = new Date(Date.UTC(year, month - 1, 1))
  let count = 0
  for (;;) {
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6 && !holidays.has(iso(d))) count += 1
    if (count === n) return iso(d)
    d.setUTCDate(d.getUTCDate() + 1)
  }
}

/** The `n`-th given weekday of a month (0 = Sunday), e.g. the second Friday
 *  that carries UMich's preliminary sentiment read. */
export function nthWeekdayOfMonth(year, month, weekday, n) {
  const d = new Date(Date.UTC(year, month - 1, 1))
  const shift = (weekday - d.getUTCDay() + 7) % 7
  d.setUTCDate(1 + shift + (n - 1) * 7)
  return iso(d)
}

const MONTHS_2026 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const FOMC_2026 = ['2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
                   '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16']

const ECON_EVENT_INFO = {
  FOMC: {
    time: '14:00 ET', source: 'Federal Reserve', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    description: 'Federal Reserve policy decision and statement. A press conference usually follows at 14:30 ET.',
  },
  CPI: {
    time: '08:30 ET', source: 'Bureau of Labor Statistics', url: 'https://www.bls.gov/cpi/',
    description: 'Monthly consumer inflation report, including headline and core price changes.',
  },
  NFP: {
    time: '08:30 ET', source: 'Bureau of Labor Statistics', url: 'https://www.bls.gov/ces/',
    description: 'Monthly US employment report covering payroll growth, unemployment, wages, and revisions.',
  },
  GDP: {
    time: '08:30 ET', source: 'Bureau of Economic Analysis', url: 'https://www.bea.gov/data/gdp/gross-domestic-product',
    description: 'First official estimate of US economic growth for the quarter, with major demand components.',
  },
  PCE: {
    time: '08:30 ET', source: 'Bureau of Economic Analysis', url: 'https://www.bea.gov/data/personal-consumption-expenditures-price-index',
    description: 'The Federal Reserve’s preferred inflation gauge, released with personal income and spending.',
  },
  PPI: {
    time: '08:30 ET', source: 'Bureau of Labor Statistics', url: 'https://www.bls.gov/ppi/',
    description: 'Monthly change in prices received by domestic producers, including headline and core measures.',
  },
  RET: {
    time: '08:30 ET', source: 'US Census Bureau', url: 'https://www.census.gov/retail/index.html',
    description: 'Monthly snapshot of consumer spending at retailers, including the control-group measure used in GDP.',
  },
  OPEX: {
    time: 'All session', source: 'Exchange calendar', url: '',
    description: 'Quarterly expiration of index futures, index options, and single-stock options. Closing flows can amplify volume and volatility.',
  },
  FED: {
    time: 'Schedule varies', source: 'Federal Reserve Bank of Kansas City', url: 'https://www.kansascityfed.org/research/jackson-hole-economic-symposium/',
    description: 'Annual central-bank symposium at Jackson Hole, watched for policy signals from major speakers.',
  },
  ISM: {
    time: '10:00 ET', source: 'Institute for Supply Management', url: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/',
    description: 'Survey of US manufacturing activity, with new orders, employment, prices, and production components.',
  },
  ISMS: {
    time: '10:00 ET', source: 'Institute for Supply Management', url: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/',
    description: 'Survey of US services activity, with business activity, new orders, employment, and prices components.',
  },
  MINS: {
    time: '14:00 ET', source: 'Federal Reserve', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    description: 'Detailed record of the most recent FOMC discussion, including risks, policy views, and areas of disagreement.',
  },
  UMCH: {
    time: '10:00 ET', source: 'University of Michigan', url: 'https://data.sca.isr.umich.edu/',
    description: 'Preliminary consumer-sentiment reading with current conditions, expectations, and inflation expectations.',
  },
}

const FACT_KEYS = [
  ['actual', 'Actual'], ['estimate', 'Estimate'], ['consensus', 'Consensus'],
  ['previous', 'Previous'], ['revised', 'Revised'], ['period', 'Period'],
  ['symbol', 'Symbol'], ['location', 'Location'],
]

function factValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

function factLabel(key) {
  return String(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}

/** Normalize everything useful the calendar currently knows about an event.
 *  Unknown scalar metadata is intentionally retained so richer feed-backed
 *  events become visible without requiring another UI change. */
export function calendarEventDetails(event) {
  const known = ECON_EVENT_INFO[event.type] || {}
  const source = event.source || (event.user ? 'User catalyst' : known.source) || ''
  const facts = []
  const seen = new Set()
  const addFact = (key, label, value) => {
    const clean = factValue(value)
    if (!clean || seen.has(key)) return
    seen.add(key)
    facts.push({ label, value: clean })
  }

  for (const [key, label] of FACT_KEYS) addFact(key, label, event[key])
  if (event.user) addFact('category', 'Category', event.type)
  for (const bag of [event.numbers, event.metadata, event.meta]) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue
    for (const [key, value] of Object.entries(bag)) addFact(key, factLabel(key), value)
  }

  return {
    description: event.description || known.description || '',
    time: event.time || known.time || '',
    source,
    url: event.url || known.url || '',
    facts,
  }
}

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
  // second tier, still tape-movers — kept short on purpose (Jeff 2026-08-06:
  // "slightly more important events, not too many")
  ...['2026-01-15', '2026-02-12', '2026-03-12', '2026-04-15', '2026-05-13', '2026-06-11', '2026-07-15', '2026-08-13', '2026-09-14', '2026-10-14', '2026-11-13', '2026-12-11']
    .map((date) => ({ date, type: 'PPI', label: 'PPI Release' })),
  ...['2026-01-16', '2026-02-17', '2026-03-17', '2026-04-16', '2026-05-15', '2026-06-16', '2026-07-16', '2026-08-14', '2026-09-16', '2026-10-16', '2026-11-17', '2026-12-16']
    .map((date) => ({ date, type: 'RET', label: 'Retail Sales' })),
  ...['2026-03-20', '2026-06-19', '2026-09-18', '2026-12-18']
    .map((date) => ({ date, type: 'OPEX', label: 'Quad Witching' })),
  { date: '2026-08-27', type: 'FED', label: 'Jackson Hole Symposium' },
  // third tier, rule-derived rather than scraped (Jeff 2026-08-06: "expand it
  // just slightly"): ISM on the 1st/3rd business day, FOMC minutes three weeks
  // after the decision, UMich prelim on the second Friday. Planning-grade —
  // an agency can still shift a release a day.
  ...MONTHS_2026.map((m) => ({
    date: nthBusinessDay(2026, m, 1), type: 'ISM', label: 'ISM Manufacturing',
  })),
  ...MONTHS_2026.map((m) => ({
    date: nthBusinessDay(2026, m, 3), type: 'ISMS', label: 'ISM Services',
  })),
  ...FOMC_2026.map((date) => ({
    date: shiftDays(date, 21), type: 'MINS', label: 'FOMC Minutes',
  })),
  ...MONTHS_2026.map((m) => ({
    date: nthWeekdayOfMonth(2026, m, 5, 2), type: 'UMCH', label: 'UMich Sentiment',
  })),
].sort((a, b) => a.date.localeCompare(b.date))

/** Days from `today` (YYYY-MM-DD) to the event date; negative = past. */
export function daysUntil(eventDate, today) {
  const ms = new Date(`${eventDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Upcoming events within the horizon, soonest first. */
export function upcomingEvents(events, today, horizonDays = 60, pastDays = 0) {
  return events
    .map((e) => ({ ...e, days: daysUntil(e.date, today) }))
    .filter((e) => e.days >= -pastDays && e.days <= horizonDays)
    .sort((a, b) => a.days - b.days)
}

/** How a calendar row states its distance from today. Past events read "1da"
 *  rather than "-1d" — the CLI's form, and a minus sign in a column of plain
 *  day counts scans as a negative number, not as "ago". A print that landed
 *  yesterday is still worth seeing, which is why the windows allow it at all. */
export function eventDayLabel(days) {
  if (days === 0) return 'today'
  return days > 0 ? `${days}d` : `${-days}da`
}
