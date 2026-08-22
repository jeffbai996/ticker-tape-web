/** Broker trade exports → trades. Pure: text in, {rows, errors} out.
 *
 *  No two brokers agree on a header, so columns are found by synonym
 *  (English and Chinese), and a few venue habits are normalised: 富途 writes
 *  "HK.00700" / "SH.600036" / "US.AAPL", IBKR Flex writes a negative
 *  Quantity for a sell, 华泰/同花顺 write 买入/卖出. Anything the reader
 *  can't place becomes an error row with its line number — never a guess. */

import { normalizeVenueCode } from './venueCodes.js'

const SYNONYMS = {
  sym: ['symbol', 'ticker', 'code', 'stock code', '代码', '股票代码', '证券代码', '股票', '代號', '證券代碼'],
  side: ['side', 'action', 'buy/sell', 'buysell', 'type', 'direction', '方向', '买卖', '買賣', '操作', '买卖方向', '业务名称', '交易类型', '委托方向'],
  qty: ['quantity', 'qty', 'shares', 'filled qty', 'filled quantity', '数量', '成交数量', '股数', '成交量', '數量', '成交數量'],
  px: ['price', 'trade price', 'tradeprice', 'avg price', 'fill price', 'filled price', '价格', '成交价', '成交价格', '成交均价', '價格', '成交價'],
  d: ['date', 'trade date', 'tradedate', 'time', 'datetime', 'filled time', '日期', '成交日期', '成交时间', '交易日期', '时间', '成交時間'],
  fee: ['commission', 'fee', 'fees', 'ibcommission', 'total fee', 'total fees', '手续费', '佣金', '费用', '手續費', '總費用'],
  ccy: ['currency', 'ccy', 'currencyprimary', '币种', '货币', '幣種'],
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s_"']+/g, ' ')

export function detectDelimiter(line) {
  const counts = [',', '\t', ';'].map((d) => [d, (line.match(new RegExp(d === '\t' ? '\t' : `\\${d}`, 'g')) || []).length])
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

/** RFC-ish split: quoted fields may hold the delimiter. */
export function splitRow(line, delim) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (ch === delim && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

export function mapHeaders(headers) {
  const map = {}
  headers.forEach((h, i) => {
    const n = norm(h)
    for (const [field, names] of Object.entries(SYNONYMS)) {
      if (map[field] == null && names.includes(n)) map[field] = i
    }
  })
  return map
}

export function normalizeSide(raw, qty) {
  const s = norm(raw)
  if (/^(buy|bot|bought|b|买入|买|買入|買|证券买入|融资买入|开仓|open)$/.test(s)) return 'buy'
  if (/^(sell|sld|sold|s|卖出|卖|賣出|賣|证券卖出|融券卖出|平仓|close)$/.test(s)) return 'sell'
  if (!s && qty != null) return qty < 0 ? 'sell' : 'buy'
  if (/buy|买|買/.test(s)) return 'buy'
  if (/sell|卖|賣/.test(s)) return 'sell'
  return null
}

/** "HK.00700" → 0700.HK, "SH.600036" → 600036.SS, "US.AAPL" → AAPL, "00700" → 0700.HK */
export function normalizeTradeSymbol(raw) {
  let s = String(raw || '').trim().toUpperCase()
  const m = /^(HK|SH|SZ|US)\.(.+)$/.exec(s)
  if (m) {
    const [, venue, code] = m
    if (venue === 'US') return code
    if (venue === 'HK') return normalizeVenueCode(code.replace(/\D/g, ''))
    const digits = code.replace(/\D/g, '')
    return digits.length === 6 ? `${digits}.${venue === 'SH' ? 'SS' : 'SZ'}` : s
  }
  return normalizeVenueCode(s)
}

export function normalizeDate(raw) {
  const s = String(raw || '').trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)               // US m/d/yyyy
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[,\s]/g, '').replace(/^\((.*)\)$/, '-$1'))
  return Number.isFinite(n) ? n : null
}

/** @returns {{rows: Array<{d, sym, side, qty, px, fee, ccy}>, errors: Array<{line, reason}>, headers: string[], mapped: object}} */
export function parseTradesCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], errors: [{ line: 0, reason: 'no rows' }], headers: [], mapped: {} }
  const delim = detectDelimiter(lines[0])
  const headers = splitRow(lines[0], delim)
  const map = mapHeaders(headers)
  const missing = ['sym', 'qty', 'px', 'd'].filter((k) => map[k] == null)
  if (missing.length) return { rows: [], errors: [{ line: 1, reason: `missing column: ${missing.join(', ')}` }], headers, mapped: map }
  const rows = []
  const errors = []
  lines.slice(1).forEach((line, i) => {
    const cells = splitRow(line, delim)
    const at = (k) => (map[k] == null ? '' : cells[map[k]] ?? '')
    const qtyRaw = num(at('qty'))
    const side = normalizeSide(at('side'), qtyRaw)
    const sym = normalizeTradeSymbol(at('sym'))
    const d = normalizeDate(at('d'))
    const px = num(at('px'))
    const fee = Math.abs(num(at('fee')) ?? 0)
    const ccy = String(at('ccy') || '').toUpperCase() || undefined
    const qty = qtyRaw == null ? null : Math.abs(qtyRaw)
    const reason = !sym ? 'symbol' : !side ? 'side' : !(qty > 0) ? 'quantity' : px == null || px < 0 ? 'price' : !d ? 'date' : null
    if (reason) { errors.push({ line: i + 2, reason }); return }
    rows.push({ d, sym, side, qty, px, fee, ...(ccy ? { ccy } : {}) })
  })
  return { rows, errors, headers, mapped: map }
}
