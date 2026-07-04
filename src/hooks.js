import { useEffect, useState } from 'preact/hooks'
import { track, subscribe, getCached } from './lib/feed.js'
import {
  loadAlerts, onAlertsChange, markTriggered, conditionText,
  evaluatePriceAlerts, evaluateTechnicalAlerts,
} from './lib/alerts.js'
import { fetchHistory } from './lib/history.js'
import { sma, rsi } from './lib/indicators.js'
import { getLocale, onLocaleChange } from './lib/i18n.js'
import { getWatchlist, onWatchlistChange } from './lib/watchlist.js'

/** Current locale; re-renders the caller when it changes. */
export function useLocale() {
  const [locale, set] = useState(getLocale)
  useEffect(() => onLocaleChange(set), [])
  return locale
}

/** User watchlist; re-renders the caller on add/remove. */
export function useWatchlist() {
  const [list, set] = useState(getWatchlist)
  useEffect(() => onWatchlistChange((l) => set([...l])), [])
  return list
}

/** Live quotes for a symbol list; re-renders as each symbol's data lands. */
export function useQuotes(symbols) {
  const [, bump] = useState(0)

  useEffect(() => {
    track(symbols)
    const wanted = new Set(symbols)
    return subscribe((symbol) => {
      if (wanted.has(symbol)) bump((n) => n + 1)
    })
  }, [symbols.join(',')])

  const out = {}
  for (const s of symbols) out[s] = getCached(s)
  return out
}

function notifyBrowser(hits) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    for (const h of hits) {
      new Notification('ticker-tape alert', {
        body: `${conditionText(h)} — now ${Number(h.current).toFixed(2)}`,
      })
    }
  } catch { /* notifications are best-effort */ }
}

/** Build {SYM: {rsi, current, smas, volRatio}} for symbols with technical alerts. */
async function buildTechMap(alerts) {
  const bySym = {}
  for (const a of alerts) {
    if (a.type === 'price' || a.triggered) continue
    ;(bySym[a.symbol] ||= []).push(a)
  }
  const techMap = {}
  await Promise.all(
    Object.entries(bySym).map(async ([symbol, list]) => {
      try {
        const { bars } = await fetchHistory(symbol, '6M')
        const closes = bars.map((b) => b.close)
        const vols = bars.map((b) => b.volume || 0)
        const smas = {}
        for (const a of list) {
          if (a.type === 'sma_cross') smas[a.value] = sma(closes, a.value)
        }
        // today's volume vs the average of the prior 20 sessions
        const prior = vols.slice(-21, -1)
        const avgVol = prior.length ? prior.reduce((x, y) => x + y, 0) / prior.length : 0
        techMap[symbol] = {
          rsi: rsi(closes),
          current: closes[closes.length - 1] ?? null,
          smas,
          volRatio: avgVol > 0 ? vols[vols.length - 1] / avgVol : null,
        }
      } catch { /* symbol stays absent — its alerts just don't evaluate */ }
    }),
  )
  return techMap
}

const TECH_CHECK_MS = 10 * 60_000

/**
 * App-level alert engine: price alerts ride the live feed, technical alerts
 * poll on a timer. Fired alerts are one-shot (markTriggered) and surface as
 * toasts + browser notifications.
 */
export function useAlertEngine() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    let alerts = loadAlerts()

    const trackAlertSymbols = () => {
      const syms = [...new Set(alerts.filter((a) => !a.triggered).map((a) => a.symbol))]
      if (syms.length) track(syms)
    }
    trackAlertSymbols()

    const fire = (hits) => {
      if (!hits.length) return
      for (const h of hits) markTriggered(h.id, h.current)
      setToasts((ts) => [...ts, ...hits])
      notifyBrowser(hits)
    }

    const checkTech = () => buildTechMap(alerts).then((tm) => fire(evaluateTechnicalAlerts(alerts, tm)))

    // Re-check shortly after any mutation so a freshly-added technical alert
    // doesn't wait for the next 10-minute tick. Debounced: markTriggered also
    // emits a change, and a burst of adds should cost one fetch round.
    let recheck = null
    const unsubChange = onAlertsChange(() => {
      alerts = loadAlerts()
      trackAlertSymbols()
      clearTimeout(recheck)
      recheck = setTimeout(checkTech, 2000)
    })

    const unsubFeed = subscribe((symbol) => {
      const price = getCached(symbol)?.quote?.price
      if (price == null) return
      fire(evaluatePriceAlerts(alerts.filter((a) => a.symbol === symbol), { [symbol]: price }))
    })

    checkTech()
    const iv = setInterval(checkTech, TECH_CHECK_MS)

    return () => {
      unsubChange()
      unsubFeed()
      clearInterval(iv)
      clearTimeout(recheck)
    }
  }, [])

  const dismiss = (id) => setToasts((ts) => ts.filter((t) => t.id !== id))
  return { toasts, dismiss }
}
