import { holdingCurrency } from './fx.js'

/** Keep one selected book intact; quantities across separate books never mix. */
export function manualBookSnapshot(portfolios, selectedId = '') {
  const book=portfolios.find(p=>p.id===selectedId) || portfolios[0]
  if(!book) return null
  return {ok:true,manual:true,id:book.id,name:book.name,currency:book.ccy,
    positions:(book.holdings || []).map(h=>({symbol:h.symbol,shares:h.shares,
      avg_cost:h.cost,currency:holdingCurrency(h.symbol)}))}
}

export function manualPortfolioContext(book) {
  if(!book) return ''
  return ['SAVED PORTFOLIO (user-entered holdings, not broker-synced):',
    `Selected portfolio: ${JSON.stringify(book.name)}; display currency: ${book.currency}.`,
    'Use this selected portfolio for holding questions. Do not infer margin, cash, weights or a live broker balance.',
    ...book.positions.map(p=>`  ${p.symbol}: ${p.shares} shares${p.avg_cost!=null ? `; cost per share ${p.avg_cost} ${p.currency}` : ''}`),
  ].join('\n')
}
