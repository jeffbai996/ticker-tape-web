import { pubDisplayName } from '../../src/lib/wire.js'
import { useHeadlines, useNow } from '../hooks.js'
import { ageLabel } from '../lib/view.js'

const SHOWN = 2
const ROTATE_MS = 12_000

/** The panel fits two headlines at wall-reading size, so it pages through
 *  the newest eight instead of truncating them. */
export function Wire() {
  const nowMs = useNow(ROTATE_MS)
  const items = useHeadlines(8)
  const pages = Math.max(1, Math.ceil(items.length / SHOWN))
  const page = Math.floor(nowMs / ROTATE_MS) % pages
  const shown = items.slice(page * SHOWN, page * SHOWN + SHOWN)
  return (
    <section class="tv-wire">
      <div class="tv-panel-head">
        <span>Wire</span>
        {pages > 1 && <span class="tv-panel-meta">{page + 1} of {pages}</span>}
      </div>
      {!items.length && <div class="tv-empty">Headlines appear here when the wire responds.</div>}
      {shown.map((ev) => (
        <article key={ev.id} class="tv-headline">
          <div class="tv-headline-text">{ev.headline}</div>
          <div class="tv-headline-meta">{pubDisplayName(ev)} · {ageLabel(ev.at, nowMs / 1000)}</div>
        </article>
      ))}
    </section>
  )
}
