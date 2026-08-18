import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Overlay } from './Overlay.jsx'
import { tl } from '../lib/i18n.js'
import {
  capturedAgo, cleanWorkspaceName, deleteWorkspace, getActiveWorkspace, listWorkspaces,
  onWorkspacesChange, renameWorkspace, saveWorkspace, summarizeLayout,
} from '../lib/workspaces.js'
import { applyToBoard, captureBoard, WORKSPACE_EVENT } from '../lib/workspaceState.js'

// Saved workspaces, as a board control rather than a page: the toolbar is one
// row at every width, so this is a 26px control with a popover — the same
// shape the sort/spark menu already uses — not a second row of buttons.
//
// The list is deliberately a mono ledger, not cards: name, capture age, and
// one line of layout ("megacaps · sectors · DAY sparks · 3 widgets"). Amber
// marks the workspace you are in. Hairlines separate rows; nothing floats.

const rowId = (i) => `ws-row-${i}`

export function WorkspacesControl({
  listId = null, lists = [], viewMode, setViewMode, sort, setSort,
  spark, setSpark, sparkWin, setSparkWin,
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(listWorkspaces)
  const [active, setActive] = useState(getActiveWorkspace)
  const [cursor, setCursor] = useState(0)
  // {mode:'save'|'rename', name} — the only modal this control owns
  const [prompt, setPrompt] = useState(null)
  const [draft, setDraft] = useState('')
  const ref = useRef(null)
  const popRef = useRef(null)
  const inputRef = useRef(null)

  const refresh = () => { setItems(listWorkspaces()); setActive(getActiveWorkspace()) }
  useEffect(() => onWorkspacesChange(refresh), [])

  // The console's `ws NAME` applies through the same store; a mounted board
  // pulls the new values into component state here instead of remounting.
  useEffect(() => {
    const onWorkspace = (e) => {
      const layout = e.detail?.layout || {}
      if (layout.viewMode) setViewMode?.(layout.viewMode)
      if (layout.sort) setSort?.(layout.sort)
      if (layout.spark) setSpark?.(layout.spark)
      if (layout.sparkWindow) setSparkWin?.(layout.sparkWindow)
      refresh()
    }
    addEventListener(WORKSPACE_EVENT, onWorkspace)
    return () => removeEventListener(WORKSPACE_EVENT, onWorkspace)
  }, [setViewMode, setSort, setSpark, setSparkWin])

  useEffect(() => {
    if (!open) return undefined
    refresh()
    // Arrow keys and Escape hang off the panel, so the panel has to hold focus
    // the moment it opens — otherwise focus is still on the trigger button and
    // the whole keyboard contract is dead on arrival.
    popRef.current?.focus?.({ preventScroll: true })
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [open])

  const listName = useMemo(
    () => lists.find((l) => l.id === listId)?.name || null, [lists, listId],
  )

  // Live board state beats the persisted copy by one render, so the capture
  // reads the props the toolbar is showing right now.
  const capture = (name) => captureBoard(name, {
    listId: () => listId,
    viewMode: () => viewMode,
    sort: () => sort,
    spark: () => spark,
    sparkWindow: () => sparkWin,
  })

  const apply = (ws) => {
    if (!ws) return
    applyToBoard(ws, {
      setViewMode, setSort, setSpark, setSparkWindow: setSparkWin,
      navigate: (hash) => { if (location.hash !== hash) location.hash = hash },
    })
    setActive(ws.name)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setCursor((i) => (items.length ? (i + 1) % items.length : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setCursor((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
        break
      case 'Enter':
        if (items[cursor]) {
          e.preventDefault()
          apply(items[cursor])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
      default:
        break
    }
  }

  const commitPrompt = (e) => {
    e?.preventDefault?.()
    const name = cleanWorkspaceName(draft)
    if (!name) return
    if (prompt?.mode === 'rename') renameWorkspace(prompt.name, name)
    else saveWorkspace(name, capture(name).layout)
    setPrompt(null)
    setDraft('')
    refresh()
  }

  return (
    <div ref={ref} class="relative shrink-0">
      <button type="button" onClick={() => { setOpen((v) => !v); setCursor(0) }}
        title={tl('Workspaces')} aria-expanded={open} aria-label={tl('Workspaces')}
        class={`board-control grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg border ${
          open ? 'border-accent/60 text-accent'
            : `${active ? 'text-accent' : 'text-ink-2'} hover:text-accent hover:border-accent/50`}`}>
        {/* three panes = a layout, not a document */}
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="1.6" y="2.2" width="5" height="11.6" rx="1" />
          <rect x="8.4" y="2.2" width="6" height="5.2" rx="1" />
          <rect x="8.4" y="8.6" width="6" height="5.2" rx="1" />
        </svg>
      </button>

      {/* board-menu-pop, not a class of its own: this is the second popover
          hanging off the same toolbar and it has to anchor, size and animate
          exactly like the sort/spark menu. (It shipped on a `ws-pop` that was
          never written, so the panel had no `position` at all and laid out in
          the toolbar flow, breaking the one-row rule.) */}
      {open && (
        <div class="board-menu-pop z-40 overflow-hidden border border-line bg-surface-1/95 backdrop-blur"
          ref={popRef} role="listbox" aria-label={tl('Workspaces')} tabIndex={0} onKeyDown={onKeyDown}>
          <div class="flex items-center justify-between border-b border-line px-2.5 py-1.5">
            <span class="font-mono text-[8.5px] uppercase tracking-wider text-muted">{tl('Workspaces')}</span>
            <span class="font-mono text-[8.5px] text-muted">↑↓ · ⏎ · esc</span>
          </div>

          {items.length === 0 && (
            <div class="px-2.5 py-3 font-mono text-[10px] text-muted">
              {tl('no saved workspaces yet')}
            </div>
          )}

          {items.map((ws, i) => {
            const isActive = active && ws.name.toLowerCase() === active.toLowerCase()
            return (
              <div key={ws.name} id={rowId(i)} role="option" aria-selected={isActive}
                class={`group flex items-center gap-2 border-b border-line/60 px-2.5 py-1.5 ${
                  i === cursor ? 'bg-accent-soft' : ''}`}>
                <button type="button" onClick={() => apply(ws)} onMouseEnter={() => setCursor(i)}
                  class="min-w-0 flex-1 text-left">
                  <div class="flex items-baseline gap-2">
                    <span class={`truncate font-mono text-[11px] ${isActive ? 'text-accent' : 'text-ink'}`}>
                      {ws.name}
                    </span>
                    <span class="ml-auto shrink-0 font-mono text-[9px] text-muted">
                      {capturedAgo(ws.capturedAt)}
                    </span>
                  </div>
                  <div class="truncate font-mono text-[9.5px] text-muted">
                    {summarizeLayout(ws.layout, {
                      listName: lists.find((l) => l.id === ws.layout.listId)?.name,
                    })}
                  </div>
                </button>
                <button type="button" title={tl('Rename')}
                  onClick={() => { setPrompt({ mode: 'rename', name: ws.name }); setDraft(ws.name) }}
                  class="shrink-0 font-mono text-[10px] text-muted hover:text-accent">✎</button>
                <button type="button" title={tl('Delete')}
                  onClick={() => { deleteWorkspace(ws.name); refresh() }}
                  class="shrink-0 font-mono text-[10px] text-muted hover:text-down">✕</button>
              </div>
            )
          })}

          <div class="flex items-center justify-between px-2.5 py-1.5">
            <button type="button"
              onClick={() => { setPrompt({ mode: 'save', name: '' }); setDraft('') }}
              class="font-mono text-[10px] text-ink-2 hover:text-accent">
              + {tl('Save as…')}
            </button>
            <span class="truncate font-mono text-[9px] text-muted">
              {summarizeLayout(capture('').layout, { listName })}
            </span>
          </div>
        </div>
      )}

      {prompt && (
        <Overlay onClose={() => setPrompt(null)} label={tl('Workspace name')}
          initialFocus={inputRef}
          class="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface-1 p-3">
          <form onSubmit={commitPrompt}>
            <div class="font-mono text-[8.5px] uppercase tracking-wider text-muted">
              {prompt.mode === 'rename' ? tl('Rename') : tl('Save as…')}
            </div>
            <input ref={inputRef} value={draft} onInput={(e) => setDraft(e.currentTarget.value)}
              placeholder={tl('opening · research · event day')}
              class="mt-2 w-full rounded-lg border border-line bg-surface-0 px-2 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent" />
            <div class="mt-2.5 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setPrompt(null)}
                class="rounded-lg border border-line px-2 py-1 font-mono text-[10px] text-ink-2 hover:text-ink">
                {tl('Cancel')}
              </button>
              <button type="submit"
                class="rounded-lg border border-accent/60 bg-accent-soft px-2 py-1 font-mono text-[10px] text-accent">
                {tl('Save')}
              </button>
            </div>
          </form>
        </Overlay>
      )}
    </div>
  )
}
