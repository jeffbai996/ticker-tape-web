import { useEffect, useState } from 'preact/hooks'
import { feedStatus } from '../lib/feed.js'
import { feedHealth } from '../lib/feedHealth.js'
import { tl, t as tt } from '../lib/i18n.js'

// Amber carries feed state; up/down green and red stay reserved for market
// direction, so a limping feed can never be mistaken for a falling tape.
const STATE_CLASS = {
  recovering: 'text-accent',
  delayed: 'text-accent font-bold',
}

/**
 * Shell feed health — RECOVERING / DELAYED and the age of the newest data.
 *
 * A healthy feed says NOTHING. The chip shipped with a LIVE state and Jeff
 * pulled it the same day ("remove the word LIVE here, not sure how it made
 * it"): a status row that announces the normal case is noise, and the prices
 * ticking are already the proof. Only the abnormal states earn a word. State
 * logic stays in feedHealth.js — this only paints, on its own 10s tick so the
 * rest of the bar doesn't repaint.
 */
export function FeedIndicator() {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])
  const health = feedHealth(feedStatus())
  if (health.state === 'live') return null
  return (
    <span
      data-feed-state={health.state}
      title={tt(health.titleKey, health.titleParams)}
      class={`inline-flex items-baseline gap-1 shrink-0 whitespace-nowrap font-mono text-[10px] tracking-wider ${STATE_CLASS[health.state]}`}
    >
      {tl(health.state.toUpperCase())}
      {/* the age is the first thing to go on a phone header — the word alone
          still says the feed is not live */}
      {health.ageLabel && (
        <span class="max-sm:hidden text-muted">{health.ageLabel}</span>
      )}
    </span>
  )
}
