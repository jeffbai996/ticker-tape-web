// Executors behind the chat's visual tools. Each one reads the same adapters
// the app already uses, assembles a validated block (chatBlocks.js) and a
// compact summary for the model. The model never supplies the numbers that
// get drawn: it only asks for a view, and the summary it reads back is the
// data the user sees. I/O comes in through `services` so the shaping stays
// testable without a network.

import { fetchHistory } from './history.js'
import { barDate } from './performance.js'
import { BLOCK_LIMITS, indexedComparison, makeBlock, sampleIndices } from './chatBlocks.js'
import { findChatPortfolio, priceChatBook, waitForChatPortfolioSync } from './chatAppData.js'
import { fmtCcy, holdingCurrency } from './fx.js'
import { getLocale } from './i18n.js'
import { SYMBOL_ANY_CASE_RE } from './symbols.js'
import { zhName } from './zhNames.js'

export const COMPARE_RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y']
export const PORTFOLIO_VIEWS = ['contributors', 'allocation', 'currency']
export const MAX_COMPARE_SYMBOLS = 6
const PROVIDER = 'Yahoo Finance'

const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null)
const zh = (locale) => locale === 'zh'
const pick = (locale, en, cn) => (zh(locale) ? cn : en)
const blockId = (parts) => parts.join('-').replace(/[^A-Za-z0-9._^=:-]/g, '_').slice(0, 64)

function symbolList(symbols, max) {
  const list = Array.isArray(symbols) ? symbols : typeof symbols === 'string' ? symbols.split(/[,\s]+/) : []
  const out = list.filter((s) => typeof s === 'string' && SYMBOL_ANY_CASE_RE.test(s.trim())).map((s) => s.trim().toUpperCase())
  return [...new Set(out)].slice(0, max)
}

const rangeOf = (range, fallback) => (COMPARE_RANGES.includes(range) ? range : fallback)

function extremes(dates, values) {
  let high = null
  let low = null
  values.forEach((v, i) => {
    if (v == null) return
    if (!high || v > high.value) high = { date: dates[i], value: v }
    if (!low || v < low.value) low = { date: dates[i], value: v }
  })
  return { high, low }
}

/** Indexed price-return comparison, or the same figures as a compact table. */
export async function compareVisual(args = {}, services = {}) {
  const history = services.history || fetchHistory
  const locale = services.locale || getLocale()
  const now = services.now || Date.now()
  const symbols = symbolList(args.symbols, MAX_COMPARE_SYMBOLS)
  if (!symbols.length) return { summary: { error: 'symbols must list one to six valid tickers' } }
  const range = rangeOf(args.range, '1Y')
  const settled = await Promise.allSettled(symbols.map((s) => history(s, range)))
  const inputs = []
  const failed = []
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value?.bars?.length) inputs.push({ key: symbols[i], label: symbols[i], bars: result.value.bars })
    else failed.push(symbols[i])
  })
  if (!inputs.length) return { summary: { error: `no price history for ${symbols.join(', ')}` } }
  const aligned = indexedComparison(inputs, { dateOf: barDate })
  if (!aligned.baselineDate) return { summary: { error: 'the symbols share no trading session in this range', failed } }
  const endDate = aligned.dates.at(-1)
  const rows = aligned.series.map((s) => {
    const last = [...s.values].reverse().find((v) => v != null)
    const { high, low } = extremes(aligned.dates, s.values)
    return {
      symbol: s.key, return_pct: r2(last - 100), last_index: last, high, low,
      missing_sessions: aligned.missing[s.key] || 0,
    }
  })
  const notes = [pick(locale, 'Price return in each symbol’s own currency; dividends excluded.', '按各自计价货币计算的价格收益，不含股息。')]
  for (const row of rows) if (row.missing_sessions) notes.push(pick(locale, `${row.symbol}: ${row.missing_sessions} sessions without a print`, `${row.symbol}：${row.missing_sessions} 个交易日无行情`))
  if (failed.length) notes.push(pick(locale, `No history for ${failed.join(', ')}`, `无历史数据：${failed.join('、')}`))
  if (aligned.sampled) notes.push(pick(locale, `Sampled ${aligned.dates.length} of ${aligned.sessions} sessions`, `从 ${aligned.sessions} 个交易日中抽样 ${aligned.dates.length} 个`))
  const source = { tool: 'chart_compare', provider: PROVIDER, asOf: now, range, baselineDate: aligned.baselineDate }
  const names = symbols.join(pick(locale, ' vs ', ' / '))
  const block = args.view === 'table'
    ? makeBlock({
      v: 1, type: 'table', id: blockId(['compare', 'table', ...symbols]), title: pick(locale, `${names} · ${range} return`, `${names} · ${range} 收益`),
      subtitle: `${aligned.baselineDate} → ${endDate}`, unit: { kind: 'pct', digits: 1 }, source, notes,
      columns: [
        { key: 'symbol', label: pick(locale, 'Symbol', '代码') }, { key: 'ret', label: pick(locale, 'Return %', '收益 %'), align: 'right' },
        { key: 'high', label: pick(locale, 'High', '最高'), align: 'right' }, { key: 'low', label: pick(locale, 'Low', '最低'), align: 'right' },
      ],
      rows: rows.map((row) => [row.symbol, row.return_pct, row.high ? `${r2(row.high.value - 100)}% · ${row.high.date}` : null, row.low ? `${r2(row.low.value - 100)}% · ${row.low.date}` : null]),
    })
    : makeBlock({
      v: 1, type: 'line', id: blockId(['compare', ...symbols]), title: pick(locale, `${names} · indexed return`, `${names} · 指数化收益`),
      subtitle: `${range} · ${aligned.baselineDate} = 100`, unit: { kind: 'index', baseline: 100, digits: 1 }, source, notes,
      dates: aligned.dates, series: aligned.series,
    })
  return {
    summary: {
      chart: args.view === 'table' ? 'return comparison table shown to the user' : 'indexed price-return chart shown to the user',
      baseline_date: aligned.baselineDate, end_date: endDate, range, sessions: aligned.sessions, series: rows, failed,
      note: 'Indexed to 100 on the first shared session; price return in native currency, dividends excluded. Refer to the chart in prose; do not restate every point.',
    },
    block,
  }
}

const sumBy = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0)

function capItems(items, locale) {
  if (items.length <= BLOCK_LIMITS.items) return items
  const kept = items.slice(0, BLOCK_LIMITS.items - 1)
  const rest = items.slice(BLOCK_LIMITS.items - 1)
  const value = rest.every((i) => i.value == null) ? null : r2(rest.reduce((s, i) => s + (i.value || 0), 0))
  return [...kept, { key: 'OTHER', label: pick(locale, `Other (${rest.length})`, `其他（${rest.length}）`), value }]
}

/** One saved book's day contributors, allocation or currency weights. */
export async function portfolioVisual(args = {}, services = {}) {
  const locale = services.locale || getLocale()
  const now = services.now || Date.now()
  const view = PORTFOLIO_VIEWS.includes(args.view) ? args.view : 'contributors'
  await (services.waitSync || waitForChatPortfolioSync)()
  const found = (services.findBook || findChatPortfolio)(args.portfolio)
  if (found.error) return { summary: found }
  const book = found.book
  if (!book) return { summary: { error: 'no saved portfolios available' } }
  const valued = await (services.priceBook || priceChatBook)(book, services.fetchQuotes)
  const name = (symbol) => (zh(locale) && zhName(symbol)) || valued.quotes?.[symbol]?.name || symbol
  const identity = { id: book.id, name: book.name, currency: book.ccy }
  const source = { tool: 'chart_portfolio', provider: pick(locale, 'Saved portfolio valued with app quotes and FX', '按应用行情与汇率估值的已保存组合'), asOf: valued.as_of ? valued.as_of * 1000 : now, portfolioId: book.id }
  const notes = []
  if (valued.missing.length) notes.push(pick(locale, `Unpriced: ${valued.missing.join(', ')} (excluded from totals)`, `无报价：${valued.missing.join('、')}（未计入合计）`))
  if (valued.stale?.length) notes.push(pick(locale, `Stale quotes: ${valued.stale.join(', ')}`, `行情可能过期：${valued.stale.join('、')}`))
  if (valued.failed?.length) notes.push(pick(locale, `Quote fetch failed: ${valued.failed.join(', ')}`, `行情获取失败：${valued.failed.join('、')}`))
  const equities = valued.rows.filter((r) => r.kind === 'equity')
  if (view === 'contributors') {
    const priced = equities.filter((r) => Number.isFinite(r.dayPnlDisplay)).sort((a, b) => b.dayPnlDisplay - a.dayPnlDisplay)
    const unpriced = equities.filter((r) => !Number.isFinite(r.dayPnlDisplay))
    const items = capItems([
      ...priced.map((r) => ({ key: r.symbol, label: name(r.symbol), value: r2(r.dayPnlDisplay), pct: r2(r.dayPct) })),
      ...unpriced.map((r) => ({ key: r.symbol, label: name(r.symbol), value: null, note: pick(locale, r.valueDisplay == null ? 'no price' : 'no day change', r.valueDisplay == null ? '无报价' : '无当日涨跌') })),
    ], locale)
    const total = valued.total.dayPnl
    const subtitle = total == null ? pick(locale, 'No day change available', '暂无当日涨跌')
      : `${pick(locale, 'Day P&L', '当日盈亏')} ${total >= 0 ? '+' : '−'}${fmtCcy(Math.abs(total), book.ccy)}${valued.total.dayPct != null ? ` (${valued.total.dayPct >= 0 ? '+' : '−'}${r2(Math.abs(valued.total.dayPct))}%)` : ''}`
    const block = makeBlock({
      v: 1, type: 'bars', id: blockId(['contributors', book.id]), title: pick(locale, `${book.name} · today’s contributors`, `${book.name} · 今日涨跌贡献`),
      subtitle, unit: { kind: 'ccy', currency: book.ccy, digits: 0 }, source, notes, signed: true, items,
    })
    return {
      summary: {
        chart: 'day P&L contribution bars shown to the user', portfolio: identity, view, currency: book.ccy,
        day_pnl: r2(total), day_pct: r2(valued.total.dayPct), price_as_of: valued.as_of,
        top_positive: priced.filter((r) => r.dayPnlDisplay > 0).slice(0, 3).map((r) => ({ symbol: r.symbol, day_pnl: r2(r.dayPnlDisplay), day_pct: r2(r.dayPct) })),
        top_negative: priced.filter((r) => r.dayPnlDisplay < 0).slice(-3).reverse().map((r) => ({ symbol: r.symbol, day_pnl: r2(r.dayPnlDisplay), day_pct: r2(r.dayPct) })),
        unpriced: valued.missing, stale: valued.stale, holding_count: equities.length,
        note: 'Day P&L in the book currency using the app’s session semantics. Refer to the chart in prose.',
      },
      block,
    }
  }
  const priced = valued.rows.filter((r) => r.valueDisplay != null)
  const total = sumBy(priced, 'valueDisplay')
  if (view === 'allocation') {
    const sorted = [...priced].sort((a, b) => b.valueDisplay - a.valueDisplay)
    const items = capItems([
      ...sorted.map((r) => ({ key: r.symbol, label: r.kind === 'cash' ? pick(locale, `${r.ccy} cash`, `${r.ccy} 现金`) : name(r.symbol), value: r2(r.weightPct), ...(r.kind === 'cash' ? { note: pick(locale, 'cash', '现金') } : {}) })),
      ...valued.rows.filter((r) => r.valueDisplay == null).map((r) => ({ key: r.symbol, label: r.kind === 'cash' ? `${r.ccy} cash` : name(r.symbol), value: null, note: pick(locale, 'unpriced', '无报价') })),
    ], locale)
    const share = (n) => r2(sumBy(sorted.slice(0, n), 'weightPct'))
    const block = makeBlock({
      v: 1, type: 'bars', id: blockId(['allocation', book.id]), title: pick(locale, `${book.name} · allocation`, `${book.name} · 持仓分布`),
      subtitle: `${pick(locale, 'Priced value', '已估值市值')} ${fmtCcy(total, book.ccy)}${valued.missing.length ? pick(locale, ' · unpriced excluded', ' · 不含无报价持仓') : ''}`,
      unit: { kind: 'pct', digits: 1 }, source, notes, signed: false, items,
    })
    return {
      summary: {
        chart: 'allocation weight bars shown to the user', portfolio: identity, view, currency: book.ccy, priced_value: r2(total), complete: !valued.missing.length,
        positions: sorted.length, top1_pct: share(1), top3_pct: share(3), top5_pct: share(5),
        weights: sorted.slice(0, 10).map((r) => ({ symbol: r.symbol, weight_pct: r2(r.weightPct), kind: r.kind })), unpriced: valued.missing,
        note: 'Weights of priced value in the book currency, cash included. Refer to the chart in prose.',
      },
      block,
    }
  }
  const byCcy = new Map()
  for (const r of priced) byCcy.set(r.ccy, (byCcy.get(r.ccy) || 0) + r.valueDisplay)
  const rows = [...byCcy.entries()].sort((a, b) => b[1] - a[1]).map(([ccy, value]) => ({ ccy, weight_pct: total > 0 ? r2((value / total) * 100) : null, value: r2(value) }))
  const block = makeBlock({
    v: 1, type: 'bars', id: blockId(['currency', book.id]), title: pick(locale, `${book.name} · currency exposure`, `${book.name} · 货币敞口`),
    subtitle: `${pick(locale, 'Priced value', '已估值市值')} ${fmtCcy(total, book.ccy)}`, unit: { kind: 'pct', digits: 1 }, source, notes, signed: false,
    items: rows.map((r) => ({ key: r.ccy, label: r.ccy, value: r.weight_pct })),
  })
  return {
    summary: { chart: 'currency exposure bars shown to the user', portfolio: identity, view, currency: book.ccy, priced_value: r2(total), currencies: rows, unpriced: valued.missing, note: 'Share of priced value by the currency each holding trades in. Refer to the chart in prose.' },
    block,
  }
}

/** One symbol’s closing prices over a range with its period high and low. */
export async function priceVisual(args = {}, services = {}) {
  const history = services.history || fetchHistory
  const locale = services.locale || getLocale()
  const now = services.now || Date.now()
  const [symbol] = symbolList([args.symbol], 1)
  if (!symbol) return { summary: { error: 'symbol required' } }
  const range = rangeOf(args.range, '6M')
  let out
  try { out = await history(symbol, range) } catch (err) { return { summary: { error: `no price history for ${symbol}: ${err?.message || err}` } } }
  const bars = (out?.bars || []).filter((b) => Number.isFinite(b?.close) && b.close > 0 && barDate(b))
  if (bars.length < 2) return { summary: { error: `no price history for ${symbol}` } }
  const indices = sampleIndices(bars.length, BLOCK_LIMITS.points)
  const dates = indices.map((i) => barDate(bars[i]))
  const values = indices.map((i) => r2(bars[i].close))
  const { high, low } = extremes(bars.map(barDate), bars.map((b) => b.close))
  const first = bars[0]
  const last = bars.at(-1)
  const currency = out.quote?.currency || holdingCurrency(symbol)
  const label = (zh(locale) && zhName(symbol)) || out.quote?.name || symbol
  const notes = [pick(locale, 'Daily closes; dividends and splits as reported by the source.', '按日收盘价；分红与拆股以数据源为准。')]
  if (indices.length < bars.length) notes.push(pick(locale, `Sampled ${indices.length} of ${bars.length} sessions`, `从 ${bars.length} 个交易日中抽样 ${indices.length} 个`))
  const block = makeBlock({
    v: 1, type: 'line', id: blockId(['price', symbol, range]), title: pick(locale, `${label} · close`, `${label} · 收盘价`),
    subtitle: `${range} · ${barDate(first)} → ${barDate(last)} · ${currency}`, unit: { kind: 'price', currency, digits: 2 },
    source: { tool: 'chart_price', provider: PROVIDER, asOf: now, range }, notes,
    dates, series: [{ key: symbol, label: symbol, values }],
  })
  return {
    summary: {
      chart: 'closing price chart shown to the user', symbol, range, currency, sessions: bars.length,
      first: { date: barDate(first), close: r2(first.close) }, last: { date: barDate(last), close: r2(last.close) },
      return_pct: r2((last.close / first.close - 1) * 100),
      high: high && { date: high.date, close: r2(high.value) }, low: low && { date: low.date, close: r2(low.value) },
      note: 'Refer to the chart in prose; quote the dated high, low and latest close rather than listing every bar.',
    },
    block,
  }
}
