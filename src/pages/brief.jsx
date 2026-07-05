import { useEffect, useState } from 'preact/hooks'
import { useQuotes, useWatchlist } from '../hooks.js'
import { INDICES } from '../lib/symbols.js'
import { ECON_EVENTS, upcomingEvents } from '../lib/markets.js'
import { assembleBriefing, renderBriefing, briefingPrompt, BRIEFING_SYSTEM } from '../lib/briefing.js'
import { useEarningsDays } from './dashboard.jsx'
import { AiReport, MdLite } from '../components/AiReport.jsx'
import { loadArchive, onArchiveChange, removeReport } from '../lib/archive.js'
import { tl, t as tt } from '../lib/i18n.js'

const INDEX_SYMBOLS = INDICES.map((i) => i.symbol)

function downloadMd(name, text) {
  const blob = new Blob([text], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

function ArchivePanel() {
  const [reports, setReports] = useState(loadArchive)
  const [openId, setOpenId] = useState(null)
  useEffect(() => onArchiveChange(setReports), [])
  if (!reports.length) return null

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Archive')} <span class="text-muted normal-case tracking-normal">({reports.length})</span>
        </h2>
      </header>
      <div>
        {reports.map((r) => (
          <div key={r.id} class="border-b border-line last:border-0">
            <div class="flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] hover:bg-surface-2 group">
              <button
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                class="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <span class={`px-1.5 rounded text-[9px] font-bold uppercase ${r.kind === 'memo' ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-ink-2'}`}>
                  {r.kind}
                </span>
                {r.symbol && <span class="text-ink font-bold">{r.symbol}</span>}
                <span class="text-ink-2 truncate">{r.title}</span>
                <span class="text-muted ml-auto shrink-0">
                  {new Date(r.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </button>
              <button
                onClick={() => downloadMd(`${r.title.replace(/\s+/g, '-').toLowerCase()}.md`, r.text)}
                class="text-muted hover:text-ink opacity-0 group-hover:opacity-100 shrink-0"
              >
                .md
              </button>
              <button
                onClick={() => removeReport(r.id)}
                class="text-muted hover:text-down opacity-0 group-hover:opacity-100 shrink-0"
                title="delete"
              >
                ✕
              </button>
            </div>
            {openId === r.id && (
              <div class="px-3 py-2 text-[13px] leading-relaxed text-ink-2 border-t border-line bg-surface-0/40">
                <MdLite text={r.text} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

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
          archive={{ kind: 'briefing', title: `Briefing ${new Date().toISOString().slice(0, 10)}` }}
        />

        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
            <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Data')}</h2>
          </header>
          <pre class="px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-2 whitespace-pre-wrap overflow-x-auto">
            {text || tt('common.loading')}
          </pre>
        </section>

        <ArchivePanel />
      </div>
    </div>
  )
}
