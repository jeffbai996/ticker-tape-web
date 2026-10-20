import { holdingCurrency } from './fx.js'

/** Keep one selected book intact; quantities across separate books never mix. */
export function manualBookSnapshot(portfolios, selectedId = '') {
  const book=portfolios.find(p=>p.id===selectedId) || portfolios[0]
  return book ? bookSnapshot(book) : null
}

/** Every book that holds something, each kept whole, for surfaces that show them side by side. */
export function manualBookSnapshots(portfolios, selectedId = '') {
  const selected=(portfolios.find(p=>p.id===selectedId) || portfolios[0])?.id
  return portfolios.filter(p=>p.holdings?.length).map(p=>({...bookSnapshot(p),selected:p.id===selected}))
}

function bookSnapshot(book) {
  return {ok:true,manual:true,id:book.id,name:book.name,currency:book.ccy,cash:book.cash||[],
    available:{trades:book.txns?.length||0,cash_activity:book.cashTxns?.length||0,history:book.snapshots?.length||0},
    positions:(book.holdings || []).map(h=>({symbol:h.symbol,shares:h.shares,
      avg_cost:h.cost,currency:holdingCurrency(h.symbol)}))}
}

export function manualPortfolioContext(book) {
  if(!book) return ''
  return ['SAVED PORTFOLIO (user-entered holdings, not broker-synced):',
    `Selected portfolio: ${JSON.stringify(book.name)}; display currency: ${book.currency}.`,
    'This is the selected view, not an access boundary. Named portfolio or owner preferences take priority over the selected view. Read other books using get_portfolio. Calculate values and weights using reported quotes and FX; do not invent missing prices or broker balances.',
    `Saved cash balances: ${JSON.stringify(book.cash||[])}. Additional records available through get_portfolio: ${JSON.stringify(book.available||{})}.`,
    ...book.positions.map(p=>`  ${p.symbol}: ${p.shares} shares${p.avg_cost!=null ? `; cost per share ${p.avg_cost} ${p.currency}` : ''}`),
  ].join('\n')
}

/** Index every visible book while keeping holdings separate and context compact. */
export function manualPortfolioCatalog(portfolios,selectedId='') {
  const selected=portfolios.find(p=>p.id===selectedId)||portfolios[0]
  return {selected_id:selected?.id||null,portfolios:portfolios.map(p=>({id:p.id,name:p.name,currency:p.ccy,
    selected:p.id===selected?.id,holding_count:p.holdings?.length||0,cash:p.cash||[],
    trade_count:p.txns?.length||0,local_history_count:p.snapshots?.length||0}))}
}
