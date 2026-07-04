import { useQuotes, useWatchlist } from '../hooks.js'
import { INDICES } from '../lib/symbols.js'
import { ECON_EVENTS, upcomingEvents } from '../lib/markets.js'
import { assembleBriefing, renderBriefing, briefingPrompt, BRIEFING_SYSTEM } from '../lib/briefing.js'
import { useEarningsDays } from './dashboard.jsx'
import { AiReport } from '../components/AiReport.jsx'
import { tl, t as tt } from '../lib/i18n.js'

const INDEX_SYMBOLS = INDICES.map((i) => i.symbol)

export function Brief() {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)
  const indexQuotes = useQuotes(INDEX_SYMBOLS)
  const earnDays = useEarningsDays(watchlist)

  const econ = upcomingEvents(ECON_EVENTS, new Date().toISOString().slice(0, 10), 60)
    .slice(0, 5)
    .map(({ type, label, days }) => ({ type, label, days }))

  const sections = assembleBriefing({
    watchlist, quotes, indices: INDICES, indexQuotes, earnDays, econEvents: econ,
  })
  const text = renderBriefing(sections)

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York',
  })

  return (
    <div class="flex-1 p-3 select-text min-w-0 max-w-3xl">
      <div class="flex items-baseline gap-3 px-1 pb-2 flex-wrap">
        <h1 class="font-mono font-bold text-lg text-ink">{tl('Briefing')}</h1>
        <span class="font-mono text-[11px] text-muted">{date}</span>
      </div>

      <div class="flex flex-col gap-3">
        <AiReport
          label="AI synthesis"
          filename={`briefing-${new Date().toISOString().slice(0, 10)}.md`}
          buildPrompt={async () => ({ system: BRIEFING_SYSTEM, prompt: briefingPrompt(text) })}
        />

        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
            <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Data')}</h2>
          </header>
          <pre class="px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-2 whitespace-pre-wrap overflow-x-auto">
            {text || tt('common.loading')}
          </pre>
        </section>
      </div>
    </div>
  )
}
