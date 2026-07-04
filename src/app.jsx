import { useEffect, useState } from 'preact/hooks'
import { parseHash } from './lib/route.js'
import { conditionText } from './lib/alerts.js'
import { useAlertEngine } from './hooks.js'
import { StatusBar } from './components/StatusBar.jsx'
import { Tape } from './components/Tape.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { Palette } from './components/Palette.jsx'
import { Page } from './pages/index.jsx'

function AlertToasts({ toasts, dismiss }) {
  if (!toasts.length) return null
  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {toasts.map((t) => (
        <div key={t.id}
          class="bg-surface-2 border border-accent rounded-lg px-3 py-2 shadow-lg flex items-start gap-3">
          <div class="font-mono text-[11px]">
            <div class="text-accent font-bold text-[9px] uppercase tracking-wider pb-0.5">Alert triggered</div>
            <div class="text-ink">{conditionText(t)}</div>
            <div class="text-ink-2">now {Number(t.current).toFixed(2)}</div>
          </div>
          <button onClick={() => dismiss(t.id)} class="text-muted hover:text-ink font-mono text-[12px]">✕</button>
        </div>
      ))}
    </div>
  )
}

function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash))
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function App() {
  const route = useHashRoute()
  const { toasts, dismiss } = useAlertEngine()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <div class="h-dvh flex flex-col bg-surface-0 text-ink font-sans antialiased">
      <StatusBar />
      <Tape />
      <div class="flex-1 flex min-h-0">
        <Sidebar route={route} />
        <main class="flex-1 flex min-w-0 overflow-y-auto">
          <Page route={route} />
        </main>
      </div>
      <AlertToasts toasts={toasts} dismiss={dismiss} />
      {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}
