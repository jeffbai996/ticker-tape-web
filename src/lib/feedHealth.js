// Feed observability, as pure functions. The feed knows three clocks —
// websocket ticks, v7/v8 REST snapshots, and the overnight sidecar fill —
// and the UI has historically shown one global "updated HH:MM:SS". These
// helpers turn those clocks into something a row (and the shell) can state
// honestly: which pipe produced the number on screen, and how old it is.
//
// The rule the whole module exists to enforce: a snapshot is never described
// as live. Only a websocket print is.

/** A snapshot older than ~2.5 sweeps (30s cadence) is no longer "current". */
export const SNAPSHOT_LIVE_MS = 75_000
/** Matches the sidebar's long-standing 5-minute stale banner. */
export const FEED_DELAYED_MS = 300_000
/** Same window per symbol: past this, the row is a museum piece. */
export const SYMBOL_STALE_MS = 300_000

/** One glanceable unit — status chrome has no room for "4m 12s". */
export function fmtAge(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return ''
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  return `${Math.floor(ms / 3_600_000)}h`
}

/**
 * Shell-level feed state.
 *
 * live        socket up AND a snapshot landed within the sweep window
 * recovering  data still arriving, but one pipe is behind (or nothing has
 *             arrived yet — a cold start is not a failure)
 * delayed     nothing at all for FEED_DELAYED_MS
 *
 * `ageMs` is the age of the newest data of any kind, which is what "+ age"
 * means next to a non-live label.
 *
 * The tooltip comes back as `titleKey` + `titleParams` rather than a finished
 * sentence: a string with the age already interpolated into it can only ever
 * be shown in English, which is how three of these four explanations shipped
 * untranslated.
 */
export function feedHealth({ streamConnected, lastStreamTs, lastSnapshotTs } = {}, now = Date.now()) {
  const newest = Math.max(lastStreamTs || 0, lastSnapshotTs || 0)
  const snapshotAge = lastSnapshotTs ? now - lastSnapshotTs : Infinity
  const ageMs = newest ? now - newest : null

  let state
  let titleKey
  if (ageMs == null) {
    // Nothing has landed yet. Claiming DELAYED one second into a cold start
    // is a lie in the other direction, so the shell simply says it is working.
    state = 'recovering'
    titleKey = 'feed.title_cold'
  } else if (ageMs >= FEED_DELAYED_MS) {
    state = 'delayed'
    titleKey = 'feed.title_delayed'
  } else if (!streamConnected || snapshotAge >= SNAPSHOT_LIVE_MS) {
    state = 'recovering'
    titleKey = streamConnected ? 'feed.title_snapshot_late' : 'feed.title_reconnecting'
  } else {
    state = 'live'
    titleKey = 'feed.title_live'
  }

  const word = state.toUpperCase()
  const ageLabel = state === 'live' ? '' : fmtAge(ageMs)
  return {
    state,
    ageMs,
    ageLabel,
    label: ageLabel ? `${word} ${ageLabel}` : word,
    titleKey,
    // only the states whose sentence quotes an age carry one
    titleParams: state === 'live' || ageMs == null ? {} : { age: fmtAge(ageMs) },
  }
}

const SOURCE_CLOCKS = [
  ['stream', 'streamTs'],
  ['snapshot', 'snapshotTs'],
  ['overnight', 'overnightTs'],
]

/** Only a websocket print counts as live. Snapshots never do. */
export function isLiveSource(source) {
  return source === 'stream'
}

/**
 * Per-symbol source/freshness from a feed cache entry. The newest of the
 * three quote clocks wins — `ts` is deliberately ignored, because it stamps
 * the 1Y chart fetch, not the price on the row.
 */
export function symbolFreshness(entry, now = Date.now()) {
  let source = null
  let receivedAt = 0
  for (const [name, key] of SOURCE_CLOCKS) {
    const ts = entry?.[key] || 0
    if (ts > receivedAt) {
      receivedAt = ts
      source = name
    }
  }
  if (!receivedAt) return { source: 'stale', receivedAt: null, ageMs: null }
  const ageMs = now - receivedAt
  if (ageMs >= SYMBOL_STALE_MS) return { source: 'stale', receivedAt, ageMs }
  return { source, receivedAt, ageMs }
}

const SOURCE_WORDS = {
  stream: 'live stream',
  snapshot: 'snapshot',
  overnight: 'overnight book',
  stale: 'stale',
}

/** Row tooltip copy: what produced this print, and how long ago. */
export function freshnessTitle(fresh) {
  if (!fresh || fresh.receivedAt == null) return 'no quote yet'
  return `${SOURCE_WORDS[fresh.source] || fresh.source} · ${fmtAge(fresh.ageMs)} ago`
}
