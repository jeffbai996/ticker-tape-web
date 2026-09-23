// Public Pages is a showcase, not a continuation of the family origin that
// used to live there. Keep its editable examples in their own browser keys so
// legacy portfolios and lists can never appear in the public interface.
export const IS_PUBLIC_DEMO = import.meta.env.VITE_PUBLIC_DEMO === '1'

export function demoStorageKey(key, publicDemo = IS_PUBLIC_DEMO) {
  return publicDemo ? `public_demo_${key}` : key
}

export const PUBLIC_DEMO_WATCHLISTS = [
  { id: 'large-caps', name: 'Large caps', symbols: ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'META'] },
  { id: 'semiconductors', name: 'Semiconductors', symbols: ['NVDA', 'AMD', 'TSM', 'MU', 'ASML'] },
  { id: 'markets-etfs', name: 'Markets & ETFs', symbols: ['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'] },
]

export const PUBLIC_DEMO_PORTFOLIOS = [
  {
    id: 'p1', name: 'Sample portfolio', ccy: 'USD',
    holdings: [
      { symbol: 'SPY', shares: 8, cost: 650 },
      { symbol: 'AAPL', shares: 10, cost: 220 },
      { symbol: 'JPM', shares: 6, cost: 280 },
      { symbol: 'GLD', shares: 5, cost: 350 },
    ],
    cash: [{ ccy: 'USD', amount: 1200 }],
  },
]
