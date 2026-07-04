import { useEffect, useRef, useState } from 'preact/hooks'
import { filterNav, searchSymbols } from '../lib/search.js'
import { hrefFor } from '../lib/route.js'
import { t as tt } from '../lib/i18n.js'

// Ctrl/Cmd+K command palette: jump to a section or pull up any symbol.
// Symbol lookups are debounced so a fast typist costs one request, not ten.

export function Palette({ onClose }) {
  const [query, setQuery] = useState('')
  const [symbols, setSymbols] = useState([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const debounce = useRef(null)

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    clearTimeout(debounce.current)
    if (!query.trim()) {
      setSymbols([])
      return
    }
    debounce.current = setTimeout(() => {
      searchSymbols(query).then(setSymbols).catch(() => setSymbols([]))
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [query])

  const navEntries = filterNav(query)
  const entries = [
    ...symbols.map((s) => ({
      kind: 'symbol',
      label: s.symbol,
      detail: [s.name, s.type, s.exchange].filter(Boolean).join(' · '),
      href: hrefFor('research', s.symbol.toLowerCase()),
    })),
    ...navEntries,
  ]
  const sel = Math.min(selected, Math.max(0, entries.length - 1))

  const go = (entry) => {
    if (!entry) return
    location.hash = entry.href
    onClose()
  }

  const onKey = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((n) => Math.min(n + 1, entries.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((n) => Math.max(n - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // bare ticker + no results yet → jump straight to research
      if (!entries.length && /^[A-Za-z0-9.^=-]{1,12}$/.test(query.trim())) {
        location.hash = hrefFor('research', query.trim().toLowerCase())
        onClose()
      } else go(entries[sel])
    }
  }

  return (
    <div class="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[15vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class="w-full max-w-lg bg-surface-1 border border-line rounded-xl shadow-2xl overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onInput={(e) => { setQuery(e.currentTarget.value); setSelected(0) }}
          onKeyDown={onKey}
          placeholder={tt('palette.placeholder')}
          class="w-full bg-surface-2 px-4 py-3 font-mono text-[13px] text-ink outline-none border-b border-line placeholder:text-muted"
        />
        <div class="max-h-80 overflow-y-auto">
          {entries.length === 0 && query.trim() && (
            <div class="px-4 py-3 font-mono text-[11px] text-muted">
              {tt('palette.no_match', { q: query.trim().toUpperCase() })}
            </div>
          )}
          {entries.map((entry, i) => (
            <button
              key={`${entry.kind}:${entry.label}`}
              onClick={() => go(entry)}
              onMouseEnter={() => setSelected(i)}
              class={`w-full flex items-baseline gap-3 px-4 py-2 text-left font-mono text-[12px] ${
                i === sel ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-2'
              }`}
            >
              <span class="text-[9px] uppercase tracking-wider text-muted w-12 shrink-0">
                {entry.kind === 'symbol' ? 'sym' : 'go to'}
              </span>
              <span class="font-bold">{entry.label}</span>
              {entry.detail && <span class="text-[10px] text-muted truncate">{entry.detail}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
