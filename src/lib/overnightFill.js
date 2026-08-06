// Overnight best-of-both: Yahoo's websocket streams ON prints, but only when
// a name happens to trade — thin books go silent for minutes. The wire's
// /api/quotes (IBKR's OVERNIGHT venue via the sidecar) always has the book,
// so it fills whatever the stream hasn't touched lately. The stream stays
// the primary pipe: a fresh tick always outranks a polled snapshot.

const STREAM_FRESH_S = 60          // a tick this recent wins outright
const ROW_STALE_S = 120            // a snapshot older than this proves nothing

export function applyOvernightFill(quote, row, nowSec = Date.now() / 1000) {
  if (!quote || !row) return quote
  if (row.source !== 'ibkr_overnight' || row.price == null) return quote
  if (nowSec - (row.timestamp || 0) > ROW_STALE_S) return quote
  if ((quote.extMarketTime || 0) > nowSec - STREAM_FRESH_S) return quote
  return {
    ...quote,
    extLabel: 'ON',
    extPrice: row.price,
    extPct: row.change_pct ?? quote.extPct ?? null,
    extChange: row.change ?? quote.extChange ?? null,
    extMarketTime: row.timestamp || nowSec,
  }
}
