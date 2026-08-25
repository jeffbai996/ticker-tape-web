import { useEffect, useRef, useState } from 'preact/hooks'
import { follow, focus, track, subscribe, getCached } from './lib/feed.js'
import {
  loadAlerts, onAlertsChange, markTriggered, conditionText,
  evaluatePriceAlerts, evaluateTechnicalAlerts,
} from './lib/alerts.js'
import { fetchHistory } from './lib/history.js'
import { sma, rsi } from './lib/indicators.js'
import { getLocale, onLocaleChange } from './lib/i18n.js'
import { loadMissingZhName, loadZhTable, onZhTable } from './lib/zhNames.js'
import { getWatchlist, onWatchlistChange } from './lib/watchlist.js'
import { loadWatchlists, onWatchlistsChange } from './lib/watchlists.js'
import { onTapeListsChange, tapeListIds, tapeSymbols } from './lib/tapeLists.js'
import { createQuoteRenderGate } from './lib/quoteRenderGate.js'
import { createInViewTracker } from './lib/inview.js'
import { FOCUS_MAX } from './lib/feedSymbols.js'
import { queueAlertDelivery, retryPendingAlertDeliveries } from './lib/alertDelivery.js'

/** Current locale; re-renders the caller when it changes. */
export function useLocale() {
  const [locale, set] = useState(getLocale)
  useEffect(() => onLocaleChange(set), [])
  return locale
}

/**
 * Escape closes whatever is on top. Bound at the window so it fires no matter
 * where focus sits — a dialog whose Escape lives on one input is unreachable
 * the moment the user clicks anything else inside it.
 */
export function useEscape(fn, active = true) {
  // the handler rides a ref so an inline arrow doesn't rebind the listener
  // on every render of the component that owns the dialog
  const handler = useRef(fn)
  handler.current = fn
  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => { if (e.key === 'Escape') handler.current?.(e) }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [active])
}

/** User watchlist; re-renders the caller on add/remove. */
export function useWatchlist() {
  const [list, set] = useState(getWatchlist)
  useEffect(() => onWatchlistChange((l) => set([...l])), [])
  return list
}

/** Additional user-created dashboard watchlists. */
export function useNamedWatchlists() {
  const [lists, set] = useState(loadWatchlists)
  useEffect(() => onWatchlistsChange((items) => set([...items])), [])
  return lists
}

/** What scrolls on the tape: the main watchlist plus any named list the
 *  reader switched on for it. */
export function useTapeSymbols() {
  const main = useWatchlist()
  const lists = useNamedWatchlists()
  const [ids, setIds] = useState(tapeListIds)
  useEffect(() => onTapeListsChange((next) => setIds([...next])), [])
  return tapeSymbols(main, lists, ids)
}

/** Live quotes for a symbol list; re-renders as each symbol's data lands. */
export function useQuotes(symbols) {
  const [, bump] = useState(0)

  useEffect(() => {
    const unfollow = follow(symbols)
    const wanted = new Set(symbols)
    const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis)
      || ((fn) => setTimeout(fn, 16))
    const cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis)
      || clearTimeout
    const gate = createQuoteRenderGate({
      isHidden: () => document.hidden,
      scheduleFrame: requestFrame,
      cancelFrame,
      scheduleTimer: setTimeout,
      cancelTimer: clearTimeout,
      maxWaitMs: 250,
      render: () => bump((n) => n + 1),
    })
    const unsub = subscribe((symbol) => {
      if (wanted.has(symbol)) gate.onFeedUpdate()
    })
    const onVisibility = () => gate.onVisibilityChange()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      unfollow()
      unsub()
      document.removeEventListener('visibilitychange', onVisibility)
      gate.dispose()
    }
  }, [symbols.join(',')])

  const out = {}
  for (const s of symbols) out[s] = getCached(s)
  return out
}

/**
 * Opt-in: declare which of the symbols this surface follows are actually on
 * screen — the rows inside the viewport, or the open research symbol. The feed
 * puts them in the first quote request, pumps their charts first, sweeps them
 * faster, and refetches one the moment it scrolls in stale. Purely a priority
 * hint: useQuotes/follow still decides what is tracked at all.
 *
 *   const rows = useVisibleRows(...)   // whatever the surface already knows
 *   useFocusedSymbols(rows)
 */
export function useFocusedSymbols(symbols) {
  const key = (symbols || []).filter(Boolean).join(',')
  useEffect(() => {
    if (!key) return undefined
    return focus(key.split(','))
  }, [key])
}

// One array instance for "nothing on screen" so a board that never sees a
// crossing doesn't get a new dependency value on every render.
const NO_SYMBOLS = []

/**
 * The other half of useFocusedSymbols: which of a board's rows are actually
 * inside the viewport. Rows are found by `data-row-symbol` under `boardRef`,
 * watched with one IntersectionObserver for the whole board (never one per
 * row), and reported in DOM order.
 *
 *   const onScreen = useInViewSymbols(boardRef, `${viewMode}:${rows.join(',')}`)
 *   useFocusedSymbols(onScreen)
 *
 * `rowsKey` is the identity of what is rendered — membership, order, view mode,
 * folded groups. The observer re-binds when it changes and only then: a quote
 * print re-renders the board without touching the observer.
 *
 * Returns state, so it re-renders the caller — but only when the visible SET
 * changes, never per intersection callback and never per scroll frame.
 */
export function useInViewSymbols(boardRef, rowsKey, selector = '[data-row-symbol]') {
  const [symbols, setSymbols] = useState(NO_SYMBOLS)

  useEffect(() => {
    const board = boardRef?.current
    // No observer (jsdom, a browser older than 2019): declare nothing. Focus
    // is the claim that the user is LOOKING at these rows; with nothing to see
    // through there is no evidence for it, and claiming the whole board would
    // buy a permanent extra sweep leg on a guess. Silence leaves the board
    // exactly as it behaved before focus existed.
    if (!board || typeof IntersectionObserver === 'undefined') return undefined

    const scheduleFrame = globalThis.requestAnimationFrame?.bind(globalThis)
      || ((fn) => setTimeout(fn, 16))
    const cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis)
      || clearTimeout
    const tracker = createInViewTracker({
      schedule: scheduleFrame,
      cancel: cancelFrame,
      emit: setSymbols,
      max: FOCUS_MAX, // a focus set is one v7 request; a taller viewport still is
    })
    const observer = new IntersectionObserver((entries) => tracker.apply(entries))
    const rows = [...board.querySelectorAll(selector)]
    tracker.setElements(rows)
    for (const el of rows) observer.observe(el)

    // Deliberately no state reset here: re-binding on a filter keystroke would
    // otherwise blank the viewport and re-declare it a frame later, releasing
    // and re-taking focus for nothing. The stale list survives one frame at
    // most, and feed.focusedSymbols() already drops anything untracked.
    return () => {
      observer.disconnect()
      tracker.dispose()
    }
  }, [rowsKey])

  return symbols
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
      for (const h of hits) {
        markTriggered(h.id, h.current)
        void queueAlertDelivery(h)
      }
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

    void retryPendingAlertDeliveries()
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

/** Chinese security names for the zh reader: pulls the name table when the
 *  locale is zh and re-renders the caller once it lands (or the locale
 *  changes). Returns nothing — pair with localName(). */
export function useZhNames(symbols = []) {
  const [, tick] = useState(0)
  const symbolKey = [...new Set(symbols)].join('|')
  useEffect(() => {
    let alive = true
    let off = () => {}
    const arm = () => {
      off()
      off = () => {}
      if (getLocale() !== 'zh') return
      off = onZhTable(() => tick((n) => n + 1))
      void loadZhTable().then(() => {
        if (!alive) return
        for (const symbol of symbols) void loadMissingZhName(symbol)
      })
    }
    arm()
    const offLocale = onLocaleChange(() => { arm(); tick((n) => n + 1) })
    return () => { alive = false; off(); offLocale() }
  }, [symbolKey])
}
