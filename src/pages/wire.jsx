import { useEffect, useRef, useState } from 'preact/hooks'
import {
  wireUrl, setWireUrl, fetchEvents, demoBackfill, demoEvent, TYPE_CODE,
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

function Row({ ev, hot }) {
  const lat = ev.ts_seen - ev.ts_event
  const latTxt = lat > 0.5 && lat < 600 ? `+${lat.toFixed(1)}s` : ''
  return (
    <div
      class={`grid grid-cols-[64px_56px_36px_1fr_auto] gap-x-2.5 items-baseline px-2.5 py-[3px] border-b border-line/30 font-mono text-[12px] leading-[1.55] transition-colors duration-1000 ${
        hot ? 'bg-accent text-black' : ''
      }`}
    >
      <span class={hot ? '' : 'text-muted'}>{hhmmss(ev.ts_event)}</span>
      <span class={hot ? 'font-semibold' : 'text-accent font-medium'}>
        {(ev.symbols || []).join(' ') || '—'}
      </span>
      <span class={`text-[10px] tracking-wider ${hot ? '' : CODE_TONE[ev.type] || 'text-muted'}`}>
        {TYPE_CODE[ev.type] || String(ev.type).slice(0, 3).toUpperCase()}
      </span>
      <span class={`truncate ${hot ? '' : ev.type === 'earnings_release' ? 'text-ink font-semibold' : 'text-ink-2'}`} title={ev.headline}>
        {ev.url ? (
          <a href={ev.url} target="_blank" rel="noopener" class="hover:text-accent">{ev.headline}</a>
        ) : ev.headline}
      </span>
      <span class={`text-[10.5px] ${hot ? '' : lat < 60 ? 'text-up' : 'text-muted'}`}>{latTxt}</span>
    </div>
  )
}

export function Wire() {
  const [endpoint, setEndpoint] = useState(() => wireUrl())
  const [draft, setDraft] = useState(() => wireUrl())
  const [events, setEvents] = useState([])
  const [hotIds, setHotIds] = useState(new Set())
  const [filter, setFilter] = useState('')
  const [state, setState] = useState('demo')   // demo | connecting | live | error
  const [error, setError] = useState('')
  const esRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (esRef.current) { esRef.current.close(); esRef.current = null }

    if (!endpoint) {
      // demo mode: synthetic backfill + a slow synthetic drip
      setState('demo')
      setEvents(demoBackfill())
      let nextId = 41
      const timer = setInterval(() => {
        const ev = demoEvent(nextId++, Date.now() / 1000)
        ev.ts_event = Date.now() / 1000 - 2
        ev.ts_seen = Date.now() / 1000
        setEvents((cur) => [...cur.slice(-199), ev])
        setHotIds((cur) => new Set(cur).add(ev.id))
        setTimeout(() => setHotIds((cur) => {
          const next = new Set(cur); next.delete(ev.id); return next
        }), 8000)
      }, 15000)
      return () => { cancelled = true; clearInterval(timer) }
    }

    setState('connecting')
    setError('')
    fetchEvents(endpoint, { limit: 150 })
      .then((out) => {
        if (cancelled) return
        setEvents(out.events || [])
        const es = new EventSource(`${endpoint}/api/stream?since_id=${out.latest_id || 0}`)
        esRef.current = es
        es.onopen = () => setState('live')
        es.onerror = () => setState('error')
        es.addEventListener('wire', (msg) => {
          const ev = JSON.parse(msg.data)
          setEvents((cur) => [...cur.slice(-299), ev])
          setHotIds((cur) => new Set(cur).add(ev.id))
          setTimeout(() => setHotIds((cur) => {
            const next = new Set(cur); next.delete(ev.id); return next
          }), 8000)
        })
      })
      .catch((err) => {
        if (cancelled) return
        setState('error')
        setError(String(err.message || err))
      })
    return () => {
      cancelled = true
      if (esRef.current) { esRef.current.close(); esRef.current = null }
    }
  }, [endpoint])

  const wanted = filter ? filter.split(',') : null
  const shown = events
    .filter((ev) => !wanted || wanted.includes(ev.type))
    .slice()
    .sort((a, b) => b.id - a.id)

  const applyEndpoint = (e) => {
    e.preventDefault()
    try {
      setEndpoint(setWireUrl(draft))
    } catch (err) {
      setError(String(err.message || err))
    }
  }

  const stateTone = { demo: 'text-muted', connecting: 'text-muted', live: 'text-accent', error: 'text-down' }

  return (
    <div class="flex flex-col gap-2 flex-1 min-w-0 p-3">
      <div class="flex items-center gap-3 flex-wrap">
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
      <div class="border border-line rounded-lg overflow-hidden bg-surface">
        {shown.length === 0 && (
          <div class="px-3 py-6 font-mono text-[12px] text-muted">no events</div>
        )}
        {shown.slice(0, 200).map((ev) => (
          <Row key={ev.id} ev={ev} hot={hotIds.has(ev.id)} />
        ))}
      </div>
      <p class="font-mono text-[10.5px] text-muted max-w-[70ch]">
        BYO wire: this page ships no endpoint and no data — point it at any
        fragwire-compatible service (GET /api/events + SSE /api/stream) and
        events render in your browser only. Blank endpoint runs a synthetic
        demo feed.
      </p>
    </div>
  )
}
