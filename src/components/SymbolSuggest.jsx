/** Symbol input with the company-name dropdown (Jeff 2026-08-20: "the
 *  autocomplete dropdown doesn't work when adding stocks to portfolio").
 *
 *  Same v1 name-search the dashboard's add-symbol row runs — "apple" finds
 *  AAPL, "hynix" finds every venue — packaged once so any form can carry it.
 *  The dropdown hangs above the input by default (these rows live at the
 *  bottom of tables); `dropUp={false}` flips it under.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { searchSymbols } from '../lib/symbolSearch.js'
import { codeSearchQueries } from '../lib/venueCodes.js'
import { hasCjk, loadZhTable, localName, zhAliasHits } from '../lib/zhNames.js'
import { venueFlag } from '../lib/venueFlag.js'
import { tl } from '../lib/i18n.js'
import { Marquee } from './Marquee.jsx'
import { useZhNames } from '../hooks.js'

export function SymbolSuggest({
  value, onInput, onPick, onHits, placeholder, inputClass = '', dropUp = true,
  inputRef = null, ariaLabel = null,
}) {
  useZhNames()
  const [hits, setHits] = useState(null)
  const [active, setActive] = useState(-1)
  const pickedRef = useRef(null)
  const boxRef = useRef(null)
  const ownRef = useRef(null)
  const input = inputRef || ownRef

  useEffect(() => {
    const away = (e) => { if (!boxRef.current?.contains(e.target)) { setHits(null); setActive(-1) } }
    addEventListener('pointerdown', away)
    return () => removeEventListener('pointerdown', away)
  }, [])

  useEffect(() => {
    const q = String(value || '').trim()
    // a just-picked value must not immediately re-open the dropdown over
    // whatever field the user moved on to
    if (q.length < 2 || q === pickedRef.current) { setHits(null); setActive(-1); return }
    // `onHits` lets a caller that requires a real listing accept a symbol the
    // user typed in full — the provider still had to confirm it exists.
    const ctl = new AbortController()
    const t = setTimeout(() => {
      // A bare board code ("02628") is asked for twice — as typed, and as the
      // venue symbol it means — because the provider knows only the second
      // one and a dropdown that returns nothing is a dead end.
      // A Chinese name is answered from the local table — Yahoo's search
      // returns nothing for CJK queries, so the round-trip is a guaranteed
      // empty dropdown (Gordon, 2026-08-22)
      const lookups = hasCjk(q)
        ? [loadZhTable().then(() => zhAliasHits(q))]
        : codeSearchQueries(q).map((query) => (
          searchSymbols(query, { signal: ctl.signal }).catch(() => [])
        ))
      Promise.all(lookups)
        .then((lists) => {
          const seen = new Set()
          const rows = lists.flat().filter((h) => !seen.has(h.symbol) && seen.add(h.symbol))
          setHits(rows.slice(0, 5))
          setActive(-1)
          onHits?.(rows)
        })
        .catch(() => {})
    }, 280)
    return () => { clearTimeout(t); ctl.abort() }
  }, [value])

  const pick = (h) => {
    pickedRef.current = h.symbol
    setHits(null)
    setActive(-1)
    onPick?.(h)
  }

  const onKey = (e) => {
    if (e.key === 'Escape' && hits?.length) { e.stopPropagation(); setHits(null); setActive(-1); return }
    if (!hits?.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % hits.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? hits.length : i) - 1) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(hits[active]) }
  }

  return (
    <span ref={boxRef} class="relative inline-flex">
      {hits?.length > 0 && (
        <div class={`absolute left-0 z-40 w-[22rem] max-w-[86vw] overflow-hidden rounded-lg border border-line bg-surface-1/95 backdrop-blur ${
          dropUp ? 'bottom-full mb-1 shadow-[0_-8px_24px_rgba(0,0,0,0.6)]' : 'top-full mt-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]'}`}>
          {hits.map((h, i) => (
            <button key={h.symbol} type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(h)}
              class={`flex w-full items-center gap-2 border-t border-line/60 px-2.5 py-2 text-left first:border-0 ${
                i === active ? 'bg-accent-soft' : 'hover:bg-accent-soft'}`}>
              {venueFlag(h) && (
                <img src={venueFlag(h)} alt="" class="h-3 w-4 shrink-0 rounded-[1px]" title={h.exch} />
              )}
              <span class="shrink-0 font-mono text-[11px] font-bold text-accent">{h.symbol}</span>
              <Marquee text={localName(h.symbol, h.name)} class="block min-w-0 font-anth text-[10.5px] text-ink-2" />
              <span class="ml-auto shrink-0 font-mono text-[8.5px] uppercase tracking-wider text-muted">{tl(h.exch)}</span>
            </button>
          ))}
        </div>
      )}
      <input ref={input} value={value} placeholder={placeholder} aria-label={ariaLabel || placeholder}
        onInput={onInput} onKeyDown={onKey} autocomplete="off" autocapitalize="characters"
        spellcheck={false} data-1p-ignore data-lpignore="true" data-form-type="other"
        class={inputClass} />
    </span>
  )
}
