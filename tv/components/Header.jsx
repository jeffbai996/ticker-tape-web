import { feedHealth } from '../../src/lib/feedHealth.js'
import { marketState } from '../../src/lib/marketState.js'
import { useFeedStatus } from '../hooks.js'
import { sessionLabel } from '../lib/view.js'

const ET = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
const LOCAL = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
const DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
})

export function Header() {
  const status = useFeedStatus() // ticks once a second, which drives the clocks
  const now = new Date()
  const session = marketState(now)
  const health = feedHealth(status, now.getTime())
  return (
    <header class="tv-header">
      <div class="tv-brand">TICKER<span>TAPE</span></div>
      <div class={`tv-chip session-${session.state}`}>{sessionLabel(session)}</div>
      <div class={`tv-chip feed-${health.state}`}>{health.label}</div>
      <div class="tv-clocks">
        <div class="tv-clock">
          <span class="tv-clock-label">{DAY.format(now)} · New York</span>
          <span class="tv-clock-time">{ET.format(now)}</span>
        </div>
        <div class="tv-clock tv-clock-local">
          <span class="tv-clock-label">Local</span>
          <span class="tv-clock-time">{LOCAL.format(now)}</span>
        </div>
      </div>
    </header>
  )
}
