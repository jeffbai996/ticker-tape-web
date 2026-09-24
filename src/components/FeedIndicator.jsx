import { useEffect, useState } from 'preact/hooks'
import { feedStatus } from '../lib/feed.js'
import { feedHealth } from '../lib/feedHealth.js'
import { tl, t as tt } from '../lib/i18n.js'
import { startVisibleClock } from '../lib/idleClock.js'

// Literal connection colors never follow the red-up/green-down preference.
const DOT_CLASS = {
  live: 'bg-[#3fb950]',
  recovering: 'bg-[#fbbf24]',
  delayed: 'bg-[#f85149]',
  offline: 'bg-[#f85149]',
}

/**
 * One shell dot for browser connectivity and feed freshness. The surrounding
 * button still switches the gain/loss color convention; its tooltip carries
 * the detailed state without adding visible status copy beside the clock.
 */
export function FeedIndicator({ online = true, colorOrder, onToggle }) {
  const [, tick] = useState(0)
  useEffect(() => startVisibleClock(1000, () => tick((n) => n + 1)), [])
  const health = feedHealth(feedStatus())
  const state = online ? health.state : 'offline'
  const detail = !online ? tl('offline') : health.state === 'live'
    ? tl('online') : tt(health.titleKey, health.titleParams)
  return (
    <button type="button"
      data-market-color-toggle
      aria-pressed={colorOrder === 'cn'}
      aria-label={`${tl('Switch gain and loss colors')} · ${detail}`}
      onClick={onToggle}
      title={`${detail} · ${colorOrder === 'cn' ? tl('red up, green down') : tl('green up, red down')} · ${tl('tap to switch')}`}
      class="-ml-1 grid h-5 w-3.5 cursor-pointer place-items-center rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-line-2">
      <span data-feed-state={state} aria-hidden="true"
        class={`inline-block h-1.5 w-1.5 rounded-full ${DOT_CLASS[state]}`} />
    </button>
  )
}
