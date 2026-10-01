import { accountSummary, positionRows } from './demo.js'

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const number = (value) => finite(value) ? value : null
const unavailable = (warning) => /base currency(?: is)? unavailable/i.test(warning || '')
export function knownCurrency(value) {
  return typeof value === 'string' && value.length === 3 && /^[A-Z]{3}$/.test(value)
    && !['XXX', 'UNK', 'NAN'].includes(value) ? value : null
}
const summaryCurrency = (summary) => summary?.currency_unavailable || unavailable(summary?.margin_warning)
  ? null : knownCurrency(summary?.currency)
const moneyFields = (margin, currency) => currency && margin
  && (!Object.hasOwn(margin, 'currency') || knownCurrency(margin.currency) === currency)
  ? Object.fromEntries(Object.entries(margin).filter(([key, value]) => key === 'currency' ? value === currency : finite(value)))
  : null

/** Adapt explicit broker units; native position units never establish account units. */
export function brokerBook(out) {
  const source = Array.isArray(out.positions) ? out.positions : []
  const summaries = Array.isArray(out.account_summaries) ? out.account_summaries.map((summary) => {
    const currency = out.currency_unavailable || unavailable(out.margin_warning) ? null : summaryCurrency(summary)
    return { ...summary, currency, margin: moneyFields(summary.margin, currency) }
  }) : []
  let currency = summaryCurrency(out)
  if (out.mixed_currency || summaries.some((summary) => !summary.currency || summary.currency !== currency) || (out.account === 'all' && Object.hasOwn(out, 'account_summaries')
    && source.some((position) => !summaries.some((summary) => summary.account === position.account
      && summary.currency === currency && currency)))) currency = null
  const margin = moneyFields(out.margin, currency)
  const marginComplete = !!currency && out.margin_complete === true
    && ['equity', 'maintenance', 'above_maintenance'].every((key) => finite(margin?.[key]))
  return {
    broker: true, currency, margin, marginComplete,
    marginWarning: out.margin_warning || (!currency ? 'Base currency unavailable. Account monetary totals are unavailable.'
      : !marginComplete ? 'Margin incomplete. Missing amounts are unavailable.' : null),
    account: out.account || '', accountLabel: out.account_label || '', accountSummaries: summaries,
    positions: source.map((position) => {
      const owner = summaries.find((summary) => summary.account === position.account)
      const ownerCurrency = out.account === 'all' ? owner?.currency : currency
      const baseCurrency = Object.hasOwn(position, 'base_currency')
        ? knownCurrency(position.base_currency) : ownerCurrency
      const baseAvailable = !!currency && baseCurrency === currency && ownerCurrency === currency
        && !unavailable(position.currency_warning)
      return {
        broker: true, symbol: position.symbol, shares: position.shares, avgCost: number(position.avg_cost),
        livePrice: number(position.market_price), liveValue: number(position.market_value),
        liveBase: baseAvailable ? number(position.market_value_base) : null,
        liveUnreal: number(position.unrealized_pnl), currency: knownCurrency(position.currency),
        baseCurrency, baseAvailable,
        weightAvailable: baseAvailable && (!Object.hasOwn(position, 'weight_pct') || finite(position.weight_pct)),
        account: position.account || out.account || '',
        accountLabel: position.account_label || out.account_label || '',
        currencyWarning: position.currency_warning || null,
      }
    }),
  }
}

/** Broker balances come from received margin fields, never synthetic cash or maintenance. */
export function portfolioSummary(positions, priceMap, book, broker) {
  if (!broker) return accountSummary(positions, priceMap)
  const rows = positionRows(positions, priceMap)
  const currency = knownCurrency(book?.currency)
  const sum = (key) => currency && rows.every((row) => finite(row[key]))
    ? rows.reduce((total, row) => total + row[key], 0) : null
  const margin = currency ? book?.margin : null
  const nlv = number(margin?.nlv ?? margin?.equity)
  const gross = sum('mktValue')
  return { accountId: book?.account || '', cash: null, gross, nlv,
    leverage: gross != null && nlv ? gross / nlv : null,
    maintenance: number(margin?.maintenance), excessLiq: number(margin?.above_maintenance),
    cushionPct: number(margin?.cushion_pct), dayPnl: sum('dayPnl'), unrealPnl: sum('unrealPnl') }
}

export function brokerMoney(value, currency, digits = 0) {
  return finite(value) && knownCurrency(currency)
    ? `${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}` : '—'
}
