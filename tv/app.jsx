import { useEffect, useRef, useState } from 'preact/hooks'
import { useFocusedSymbols, useQuotes } from './hooks.js'
import { actionForKey } from './lib/keys.js'
import { INITIAL_FOCUS, moveFocus, windowStart } from './lib/focus.js'
import { RAIL, RAIL_SYMBOLS } from './lib/rail.js'
import { nextSort, sortSymbols } from './lib/view.js'
import { addSymbol, loadSymbols, removeSymbol, saveSymbols } from './lib/watchlist.js'
import { exitApp } from './platform.js'
import { Header } from './components/Header.jsx'
import { Board, BOARD_ROWS } from './components/Board.jsx'
import { Rail } from './components/Rail.jsx'
import { Wire } from './components/Wire.jsx'
import { Legend } from './components/Legend.jsx'
import { Tape } from './components/Tape.jsx'
import { Detail } from './components/Detail.jsx'
import { AddDialog, RemoveDialog } from './components/Dialogs.jsx'

const storage = (() => {
  try { return globalThis.localStorage } catch { return null }
})()
const memory = { getItem: () => null, setItem: () => {} }

const SORT_KEY = 'ttw-tv-sort'

function loadSort() {
  try { return storage?.getItem(SORT_KEY) || 'list' } catch { return 'list' }
}

export function App() {
  const [symbols, setSymbols] = useState(() => loadSymbols(storage || memory))
  const [sort, setSort] = useState(loadSort)
  const [focus, setFocus] = useState(INITIAL_FOCUS)
  const [first, setFirst] = useState(0)
  // null | { kind: 'detail', list, index } | { kind: 'add' } | { kind: 'remove', symbol }
  const [layer, setLayer] = useState(null)

  const quotes = useQuotes([...symbols, ...RAIL_SYMBOLS])
  const quoteOf = (s) => quotes[s]?.quote
  const ordered = sortSymbols(symbols, quoteOf, sort)

  const sizes = { board: ordered.length, rail: RAIL.length, page: BOARD_ROWS }
  const current = moveFocus(focus, 'none', sizes)
  const start = windowStart(first, current.board, ordered.length, BOARD_ROWS)
  const visible = ordered.slice(start, start + BOARD_ROWS)
  useFocusedSymbols(layer?.kind === 'detail' ? [layer.list[layer.index]] : visible)

  useEffect(() => { if (start !== first) setFirst(start) }, [start, first])

  const commitSymbols = (next) => {
    setSymbols(next)
    saveSymbols(storage || memory, next)
  }

  // The key handler reads the newest render through a ref instead of being
  // rebound on every quote tick.
  const live = useRef(null)
  live.current = { current, ordered, sizes, layer, sort, symbols }

  useEffect(() => {
    const onKey = (event) => {
      const { current: f, ordered: rows, sizes: sz, layer: top, sort: mode } = live.current
      if (top?.kind === 'add') return // the dialog's input owns the keyboard
      const action = actionForKey(event)
      if (!action) return
      event.preventDefault()

      if (top?.kind === 'remove') {
        if (action === 'enter') commitSymbols(removeSymbol(live.current.symbols, top.symbol))
        if (action === 'enter' || action === 'back') setLayer(null)
        return
      }

      if (top?.kind === 'detail') {
        if (action === 'back') setLayer(null)
        else if (action === 'up' || action === 'down') {
          const step = action === 'up' ? -1 : 1
          setLayer((prev) => (prev?.kind === 'detail'
            ? { ...prev, index: Math.max(0, Math.min(prev.list.length - 1, prev.index + step)) }
            : prev))
        }
        return // Left/Right belong to the chart's range control
      }

      switch (action) {
        case 'back': exitApp(); break
        case 'enter': {
          const list = f.zone === 'board' ? rows : RAIL_SYMBOLS
          const index = f.zone === 'board' ? f.board : f.rail
          if (list.length) setLayer({ kind: 'detail', list, index })
          break
        }
        case 'green': setLayer({ kind: 'add' }); break
        case 'red':
          if (f.zone === 'board' && rows[f.board]) setLayer({ kind: 'remove', symbol: rows[f.board] })
          break
        case 'yellow': {
          const next = nextSort(mode)
          setSort(next)
          try { storage?.setItem(SORT_KEY, next) } catch { /* session-only sort */ }
          break
        }
        // Functional update: a held key repeats faster than a TV repaints,
        // and each repeat must step from the previous step, not the last paint.
        default: setFocus((prev) => moveFocus(prev, action, sz))
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const onAdd = (raw) => {
    const next = addSymbol(symbols, raw)
    if (next !== symbols) {
      commitSymbols(next)
      // Land on the new row so the viewer sees it arrive.
      if (sort === 'list') setFocus({ ...current, zone: 'board', board: next.length - 1 })
    }
    setLayer(null)
  }

  return (
    <div class="tv">
      <Header />
      <main class="tv-main">
        <Board
          rows={visible}
          start={start}
          total={ordered.length}
          focused={current.zone === 'board' ? current.board : -1}
          quotes={quotes}
          sort={sort}
        />
        <aside class="tv-side">
          <Rail quotes={quotes} focused={current.zone === 'rail' ? current.rail : -1} />
          <Wire />
        </aside>
      </main>
      <Legend zone={current.zone} />
      <Tape symbols={ordered} quotes={quotes} />
      {layer?.kind === 'detail' && (
        <Detail
          symbol={layer.list[layer.index]}
          entry={quotes[layer.list[layer.index]]}
          position={`${layer.index + 1} of ${layer.list.length}`}
        />
      )}
      {layer?.kind === 'add' && <AddDialog onSubmit={onAdd} onCancel={() => setLayer(null)} />}
      {layer?.kind === 'remove' && <RemoveDialog symbol={layer.symbol} />}
    </div>
  )
}
