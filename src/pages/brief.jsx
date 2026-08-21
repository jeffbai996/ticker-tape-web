import { useEffect, useState } from 'preact/hooks'
import { useQuotes, useWatchlist } from '../hooks.js'
import { INDICES } from '../lib/symbols.js'
import { ECON_EVENTS, upcomingEvents } from '../lib/markets.js'
import { assembleBriefing, renderBriefing, briefingPrompt, BRIEFING_SYSTEM } from '../lib/briefing.js'
import { useEarningsDays } from './dashboard.jsx'
import { AiReport, MdLite } from '../components/AiReport.jsx'
import { Empty } from '../components/Loading.jsx'
import { loadArchive, onArchiveChange, removeReport } from '../lib/archive.js'
import { formatBriefTechnicalNote, getLocale, tl } from '../lib/i18n.js'
import { Marquee } from '../components/Marquee.jsx'
import { fmtPct } from '../lib/format.js'

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
      <header class="px-3 py-[3px] border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Archive')} <span class="text-muted normal-case tracking-normal">({reports.length})</span>
        </h2>
      </header>
      <div>
        {reports.map((r) => (
          <div key={r.id} class="border-b border-line last:border-0">
            <div class="flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] hover:bg-surface-3 group">
              <button
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                class="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <span class={`px-1.5 rounded text-[9px] font-bold uppercase ${r.kind === 'memo' ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-ink-2'}`}>
                  {r.kind}
                </span>
                {r.symbol && <span class="text-ink font-bold">{r.symbol}</span>}
                <Marquee text={r.title} class="block min-w-0 flex-1 text-ink-2" />
                <span class="text-muted ml-auto shrink-0">
                  {new Date(r.ts).toLocaleString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </button>
              <button
                onClick={() => downloadMd(`${r.title.replace(/\s+/g, '-').toLowerCase()}.md`, r.text)}
                class="text-muted hover:text-ink shrink-0"
                title={tl('download .md')}
              >
                .md
              </button>
              {/* always visible: hover-only made past briefings read as
                  undeletable on desktop */}
              <button
                onClick={() => removeReport(r.id)}
                class="w-5 h-5 grid place-items-center rounded border border-down/40 bg-down/10 text-down hover:bg-down hover:text-white shrink-0 text-[10px] font-bold"
                title={tl('delete')}
                aria-label={tl('delete')}
              >
                ✕
              </button>
            </div>
            {openId === r.id && (
              <div class="px-3 py-2 font-anth text-[13px] leading-relaxed text-ink-2 border-t border-line bg-surface-0/40">
                <MdLite text={r.text} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function Card({ title, children, aside, sub }) {
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
      <header class="flex items-baseline gap-2 px-3 py-[3px] border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
        {aside && <span class="ml-auto font-mono text-[10px] text-muted">{aside}</span>}
      </header>
      {sub && <p class="px-3 pt-1.5 font-anth text-[9.5px] leading-snug text-muted">{sub}</p>}
      {children}
    </section>
  )
}

/** Tiny RSI scale: 0-100 track, the 30/70 bands shaded, a dot at the value.
 *  The whole read is "where inside (or past) the bands the name sits". */
function RsiMeter({ value }) {
  if (value == null) return null
  const pos = Math.max(0, Math.min(100, value))
  return (
    <span class="relative inline-block h-[5px] w-16 shrink-0 rounded-full bg-line/70" title={`RSI ${Math.round(value)}`}>
      <span class="absolute inset-y-0 left-[30%] right-[30%] bg-surface-3 rounded-sm" />
      <span class={`absolute top-1/2 -translate-y-1/2 h-[9px] w-[3px] rounded-sm ${
        value >= 70 ? 'bg-down' : value <= 30 ? 'bg-up' : 'bg-accent-2'}`}
        style={{ left: `calc(${pos}% - 1.5px)` }} />
    </span>
  )
}

const TECH_NOTE_TONE = {
  overbought: 'border-down/40 text-down/90 bg-down/10',
  oversold: 'border-up/40 text-up bg-up/10',
  volume: 'border-accent/40 text-accent bg-accent/10',
  downtrend: 'border-down/30 text-ink-2 bg-down/5',
}

const rowCls = 'flex items-baseline justify-between gap-2 px-3 py-[3px] font-mono text-[11.5px] border-b border-line/40 last:border-0'
const upDown = (v) => (v >= 0 ? 'text-up' : 'text-down')

/** The briefing data as readable cards — the ALL-CAPS text block only lives
 *  on as the AI prompt body now. */
function BriefData({ s }) {
  const fmtDays = (days) => days === 0
    ? tl('today')
    : getLocale() === 'zh' ? `${days}天` : `${days}d`
  const movers = [
    ...s.movers.gainers.map((m) => ({ ...m, side: 'g' })),
    ...s.movers.losers.map((m) => ({ ...m, side: 'l' })),
  ]
  return (
    <div class="grid gap-3 sm:grid-cols-2">
      <Card title={tl('Macro tape')}>
        {s.macro.map((m) => (
          <div key={m.label} class={rowCls}>
            <span class="font-anth text-ink-2">{tl(m.label)}</span>
            <span class="ml-auto text-ink">{m.price.toFixed(2)}</span>
            <span class={`w-16 text-right ${upDown(m.pct)}`}>{fmtPct(m.pct)}</span>
          </div>
        ))}
        {s.pulse && (
          <div class="px-3 py-1.5 font-mono text-[10.5px] text-muted border-t border-line">
            {tl('breadth')} <span class="text-up">{s.pulse.adv}</span>/<span class="text-down">{s.pulse.dec}</span>
            {' · '}{tl('avg')} <span class={upDown(s.pulse.avg)}>{fmtPct(s.pulse.avg)}</span>
            {' · '}{tl('>2% movers')} <span class="text-ink-2">{s.pulse.movers}/{s.pulse.total}</span>
          </div>
        )}
      </Card>

      <Card title={tl('Movers')}>
        {movers.length ? movers.map((m) => (
          <div key={m.symbol} class={rowCls}>
            <a href={`#/research/${m.symbol.toLowerCase()}`} class="font-[650] font-tick text-ink hover:no-underline">{m.symbol}</a>
            {/* the dead middle of the row carries the full name in the quiet
                shade (Jeff 2026-08-06: "put down the full name in smaller/
                different shade text") */}
            {m.name && <Marquee text={m.name} class="block min-w-0 flex-1 font-anth text-[10px] text-muted" />}
            <span class="ml-auto text-ink-2">{m.price.toFixed(2)}</span>
            <span class={`w-16 text-right ${upDown(m.pct)}`}>{fmtPct(m.pct)}</span>
          </div>
        )) : <Empty label={tl('flat tape')} />}
      </Card>

      <Card title={tl('Technical flags')} sub={tl('stretched names on the board — the chip says what it means, the meter shows where RSI sits')}>
        {s.techNotes.length ? s.techNotes.map((n) => (
          <div key={n.symbol} class="flex items-center gap-2.5 px-3 py-2 border-b border-line/40 last:border-0">
            <a href={`#/research/${n.symbol.toLowerCase()}`} class="w-14 shrink-0 font-[650] font-tick text-ink hover:no-underline">{n.symbol}</a>
            <RsiMeter value={n.rsi} />
            {n.pct != null && (
              <span class={`w-14 shrink-0 text-right font-mono text-[10px] ${upDown(n.pct)}`}>{fmtPct(n.pct)}</span>
            )}
            <span class="ml-auto flex flex-wrap justify-end gap-1">
              {n.notes.map((note) => (
                <span key={note.text || note} class={`rounded border px-1.5 py-px font-mono text-[9.5px] ${
                  TECH_NOTE_TONE[note.kind] || 'border-line text-ink-2'}`}>
                  {formatBriefTechnicalNote(note)}
                </span>
              ))}
            </span>
          </div>
        )) : <Empty label={tl('nothing stretched')} />}
      </Card>

      <Card title={tl('Ahead')}>
        {s.earnings.map((e) => (
          <div key={e.symbol} class={rowCls}>
            <a href={`#/research/${e.symbol.toLowerCase()}/earnings`} class="font-[650] font-tick text-ink hover:no-underline">{e.symbol}</a>
            <span class="font-anth text-[11px] text-muted">{tl('earnings')}</span>
            <span class={`w-14 text-right ${e.days === 0 ? 'text-imminent font-bold' : e.days <= 7 ? 'text-down' : 'text-accent'}`}>
              {fmtDays(e.days)}
            </span>
          </div>
        ))}
        {s.calendar.map((e) => (
          <div key={e.type + e.days} class={rowCls}>
            <span class="font-mono text-[10px] text-accent font-bold w-10">{e.type}</span>
            <span class="font-anth text-[11px] text-ink-2 min-w-0 truncate">{tl(e.label)}</span>
            <span class={`w-14 text-right ${e.days <= 7 ? 'text-down' : 'text-muted'}`}>{fmtDays(e.days)}</span>
          </div>
        ))}
        {!s.earnings.length && !s.calendar.length && (
          <div class="px-3 py-2 font-mono text-[11px] text-muted">{tl('clear runway')}</div>
        )}
      </Card>
    </div>
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

  const date = new Date().toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', {
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

        <BriefData s={sections} />

        <ArchivePanel />
      </div>
    </div>
  )
}
