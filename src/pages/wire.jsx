import { useEffect, useRef, useState } from 'preact/hooks'
import {
  wireUrl, setWireUrl, fetchEvents, fetchToday, fetchQuotes, fetchMeta,
  demoBackfill, demoEvent, demoToday, demoQuotes, rankEvents, TYPE_CODE,
} from '../lib/wire.js'

const CODE_TONE = {
  earnings_release: 'text-accent font-semibold',
  digest: 'text-up',
  transcript_chunk: 'text-up',
  macro_print: 'text-ink-2',
  fed_speech: 'text-ink-2',
  fed_headline: 'text-ink-2',
}

const FILTERS = [
  { id: '', label: 'all' },
  { id: 'earnings_release', label: 'earnings' },
  { id: 'filing', label: 'filings' },
  { id: 'headline', label: 'headlines' },
  { id: 'fed_speech,fed_headline,macro_print', label: 'macro + fed' },
  { id: 'transcript_chunk,digest', label: 'live audio' },
]

const hhmmss = (ts) =>
  new Date(ts * 1000).toLocaleTimeString('en-US', { hour12: false })

const countdown = (sec) => {
  if (sec <= 0) return 'now'
  if (sec < 3600) return `in ${Math.round(sec / 60)}m`
  if (sec < 86400) return `in ${(sec / 3600).toFixed(1)}h`
  return `in ${Math.round(sec / 86400)}d`
}

function Row({ ev, hot, open, onToggle }) {
  const lat = ev.ts_seen - ev.ts_event
  const latTxt = lat > 0.5 && lat < 600 ? `+${lat.toFixed(1)}s` : ''
  const expandable = Boolean(ev.body) || Object.keys(ev.numbers || {}).length > 0
  return (
    <div
      class={`border-b border-line/30 font-mono transition-colors duration-1000 ${
        hot ? 'bg-accent text-black' : open ? 'bg-surface-1' : ''
      } ${expandable ? 'cursor-pointer' : ''}`}
      onClick={expandable ? onToggle : undefined}
    >
      <div class="grid grid-cols-[64px_56px_36px_1fr_auto] gap-x-2.5 items-baseline px-2.5 py-[3px] text-[12px] leading-[1.55]">
        <span class={hot ? '' : 'text-muted'}>{hhmmss(ev.ts_event)}</span>
        <span class={hot ? 'font-semibold' : 'text-accent font-medium'}>
          {(ev.symbols || []).join(' ') || '—'}
        </span>
        <span class={`text-[10px] tracking-wider ${hot ? '' : CODE_TONE[ev.type] || 'text-muted'}`}>
          {TYPE_CODE[ev.type] || String(ev.type).slice(0, 3).toUpperCase()}
        </span>
        <span class={`truncate ${hot ? '' : ev.type === 'earnings_release' ? 'text-ink font-semibold' : 'text-ink-2'}`} title={ev.headline}>
          {ev.url ? (
            <a href={ev.url} target="_blank" rel="noopener" class="hover:text-accent" onClick={(e) => e.stopPropagation()}>{ev.headline}</a>
          ) : ev.headline}
        </span>
        <span class={`text-[10.5px] ${hot ? '' : lat < 60 ? 'text-up' : 'text-muted'}`}>{latTxt}</span>
      </div>
      {open && (
        <div class="px-2.5 pb-2 pl-[168px]">
          {ev.body && <p class="text-[11.5px] leading-relaxed text-ink-2 max-w-[72ch]">{ev.body}</p>}
          {Object.keys(ev.numbers || {}).length > 0 && (
            <div class="flex flex-wrap gap-1.5 mt-1.5">
              {Object.entries(ev.numbers).map(([k, v]) => (
                <span key={k} class="border border-line rounded px-2 py-0.5">
                  <span class="block text-[8.5px] uppercase tracking-wider text-muted">{k.replace(/_/g, ' ')}</span>
                  <span class="text-[11.5px] font-semibold text-accent">{v}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section class="border border-line rounded-lg bg-surface overflow-hidden">
      <h3 class="px-2.5 py-1 border-b border-line font-mono text-[9.5px] uppercase tracking-[.12em] text-muted">{title}</h3>
      <div class="px-2.5 py-1.5">{children}</div>
    </section>
  )
}

function Rail({ today, quotes, now }) {
  const sessions = (today?.sessions || []).filter((s) => s.status !== 'failed')
  const live = sessions.filter((s) => ['armed', 'capturing'].includes(s.status))
  return (
    <aside class="flex flex-col gap-2 w-[290px] shrink-0 max-lg:w-full">
      {quotes && Object.keys(quotes).length > 0 && (
        <Panel title="watchlist">
          <div class="flex flex-col">
            {Object.entries(quotes).map(([sym, q]) => (
              <div key={sym} class="flex justify-between items-baseline font-mono text-[11.5px] py-[2px]">
                <span class="text-ink">{sym}</span>
                <span class={q.change_pct >= 0 ? 'text-up' : 'text-down'}>
                  {q.change_pct > 0 ? '+' : ''}{Number(q.change_pct).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="today">
        {(today?.calendar || []).length === 0 && (
          <p class="font-mono text-[11px] text-muted py-0.5">nothing on the sheet</p>
        )}
        {(today?.calendar || []).map((row) => (
          <div key={row.id} class="py-[3px] font-mono">
            <div class="flex justify-between gap-2 text-[11.5px]">
              <span class="text-ink truncate" title={row.label}>{row.label}</span>
              <span class="text-accent whitespace-nowrap">{countdown(row.ts - now)}</span>
            </div>
            <div class="text-[9.5px] uppercase tracking-wider text-muted">
              {row.kind}{row.symbol ? ` · ${row.symbol}` : ''} · {hhmmss(row.ts).slice(0, 5)}
            </div>
          </div>
        ))}
      </Panel>
      <Panel title="coming up">
        {(today?.upcoming || []).length === 0 && (
          <p class="font-mono text-[11px] text-muted py-0.5">nothing on the horizon</p>
        )}
        {(today?.upcoming || []).slice(0, 8).map((row) => (
          <div key={row.id} class="flex justify-between gap-2 py-[2.5px] font-mono text-[11px]">
            <span class="text-ink-2 truncate" title={row.label}>{row.label}</span>
            <span class="text-muted whitespace-nowrap">{countdown(row.ts - now)}</span>
          </div>
        ))}
      </Panel>
      {sessions.length > 0 && (
        <Panel title={`sessions${live.length ? ` · ${live.length} live` : ''}`}>
          {sessions.slice(0, 6).map((s) => (
            <div key={s.id} class="flex items-baseline gap-2 py-[2.5px] font-mono text-[11px]">
              <span class={`text-[9px] uppercase tracking-wider ${
                s.status === 'capturing' ? 'text-accent' : s.status === 'done' ? 'text-up' : 'text-muted'
              }`}>{s.status}</span>
              <span class="text-ink-2 truncate" title={s.label}>
                {s.symbol}{s.label ? ` · ${s.label}` : ''}
              </span>
            </div>
          ))}
        </Panel>
      )}
      <Panel title="captured today">
        <div class="flex flex-wrap gap-1.5">
          {Object.entries(today?.captured || {}).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
            <span key={type} class="border border-line rounded px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">
              <b class="text-ink">{n}</b> {type.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </Panel>
    </aside>
  )
}

export function Wire() {
  const [endpoint, setEndpoint] = useState(() => wireUrl())
  const [draft, setDraft] = useState(() => wireUrl())
  const [events, setEvents] = useState([])
  const [hotIds, setHotIds] = useState(new Set())
  const [openIds, setOpenIds] = useState(new Set())
  const [filter, setFilter] = useState('')
  const [mode, setMode] = useState(() => localStorage.getItem('tape-wire-mode') || 'top')
  const [state, setState] = useState('demo')   // demo | connecting | live | error
  const [error, setError] = useState('')
  const [today, setToday] = useState(null)
  const [quotes, setQuotes] = useState(null)
  const [watchset, setWatchset] = useState(new Set())
  const [now, setNow] = useState(Date.now() / 1000)
  const esRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 30_000)
    return () => clearInterval(t)
  }, [])

  const markHot = (id) => {
    setHotIds((cur) => new Set(cur).add(id))
    setTimeout(() => setHotIds((cur) => {
      const next = new Set(cur); next.delete(id); return next
    }), 8000)
  }

  useEffect(() => {
    let cancelled = false
    if (esRef.current) { esRef.current.close(); esRef.current = null }

    if (!endpoint) {
      setState('demo')
      setEvents(demoBackfill())
      setToday(demoToday())
      setQuotes(demoQuotes())
      setWatchset(new Set(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA']))
      let nextId = 41
      const timer = setInterval(() => {
        const ev = demoEvent(nextId++, Date.now() / 1000)
        ev.ts_event = Date.now() / 1000 - 2
        ev.ts_seen = Date.now() / 1000
        setEvents((cur) => [...cur.slice(-199), ev])
        markHot(ev.id)
      }, 15000)
      return () => { cancelled = true; clearInterval(timer) }
    }

    setState('connecting')
    setError('')
    const pollRail = () => {
      fetchToday(endpoint).then((out) => !cancelled && setToday(out)).catch(() => {})
      fetchQuotes(endpoint)
        .then((out) => !cancelled && setQuotes(out.ok ? out.quotes : null))
        .catch(() => !cancelled && setQuotes(null))
    }
    fetchMeta(endpoint)
      .then((out) => !cancelled && setWatchset(new Set(out.watchlist || [])))
      .catch(() => {})
    fetchEvents(endpoint, { limit: 300 })
      .then((out) => {
        if (cancelled) return
        setEvents(out.events || [])
        pollRail()
        const es = new EventSource(`${endpoint}/api/stream?since_id=${out.latest_id || 0}`)
        esRef.current = es
        es.onopen = () => setState('live')
        es.onerror = () => setState('error')
        es.addEventListener('wire', (msg) => {
          const ev = JSON.parse(msg.data)
          setEvents((cur) => [...cur.slice(-399), ev])
          markHot(ev.id)
        })
      })
      .catch((err) => {
        if (cancelled) return
        setState('error')
        setError(String(err.message || err))
      })
    const railTimer = setInterval(pollRail, 30_000)
    return () => {
      cancelled = true
      clearInterval(railTimer)
      if (esRef.current) { esRef.current.close(); esRef.current = null }
    }
  }, [endpoint])

  const wanted = filter ? filter.split(',') : null
  const filtered = events.filter((ev) => !wanted || wanted.includes(ev.type))
  const shown = mode === 'top'
    ? rankEvents(filtered, watchset, now)
    : filtered.slice().sort((a, b) => b.id - a.id)

  const applyEndpoint = (e) => {
    e.preventDefault()
    try {
      setEndpoint(setWireUrl(draft))
    } catch (err) {
      setError(String(err.message || err))
    }
  }

  const toggleOpen = (id) => setOpenIds((cur) => {
    const next = new Set(cur)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const setModePersist = (m) => {
    setMode(m)
    localStorage.setItem('tape-wire-mode', m)
  }

  const stateTone = { demo: 'text-muted', connecting: 'text-muted', live: 'text-accent', error: 'text-down' }

  return (
    <div class="flex flex-col gap-2 flex-1 min-w-0 p-3">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex gap-1">
          {['top', 'wire'].map((m) => (
            <button
              key={m}
              class={`border rounded-md px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                mode === m ? 'bg-accent border-accent text-black' : 'border-line text-ink-2 hover:text-ink'
              }`}
              onClick={() => setModePersist(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <span class={`font-mono text-[11px] uppercase tracking-widest ${stateTone[state]}`}>
          {state === 'demo' ? 'demo wire — synthetic events' : state}
        </span>
        {error && <span class="font-mono text-[11px] text-down">{error}</span>}
        <form class="flex gap-2 ml-auto" onSubmit={applyEndpoint}>
          <input
            class="bg-surface-2 border border-line rounded-md px-2 py-1 font-mono text-[11.5px] text-ink outline-none focus:border-accent w-64"
            placeholder="your wire URL (blank = demo)"
            value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
          <button class="border border-line rounded-md px-3 py-1 text-[11.5px] font-semibold text-ink-2 hover:text-ink hover:border-ink-2">
            connect
          </button>
        </form>
      </div>
      <div class="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            class={`border rounded-md px-2.5 py-0.5 text-[11px] font-semibold ${
              filter === f.id
                ? 'bg-accent border-accent text-black'
                : 'border-line text-ink-2 hover:text-ink'
            }`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div class="flex gap-2 items-start max-lg:flex-col">
        <div class="flex-1 min-w-0 border border-line rounded-lg overflow-hidden bg-surface">
          {shown.length === 0 && (
            <div class="px-3 py-6 font-mono text-[12px] text-muted">no events</div>
          )}
          {shown.slice(0, 250).map((ev) => (
            <Row key={ev.id} ev={ev} hot={hotIds.has(ev.id)}
                 open={openIds.has(ev.id)} onToggle={() => toggleOpen(ev.id)} />
          ))}
        </div>
        <Rail today={today} quotes={quotes} now={now} />
      </div>
      <p class="font-mono text-[10.5px] text-muted max-w-[74ch]">
        BYO wire: this page ships no endpoint and no data — point it at any
        fragwire-compatible service (/api/events + /api/stream, optionally
        /api/today, /api/quotes, /api/meta) and everything renders in your
        browser only. Blank endpoint runs a synthetic demo feed.
      </p>
    </div>
  )
}
