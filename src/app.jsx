import { useEffect, useState } from 'preact/hooks'
import { parseHash } from './lib/route.js'
import { StatusBar } from './components/StatusBar.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { Page } from './pages/index.jsx'

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

  return (
    <div class="h-dvh flex flex-col bg-surface-0 text-ink font-sans antialiased">
      <StatusBar />
      <div class="flex-1 flex min-h-0">
        <Sidebar route={route} />
        <main class="flex-1 flex min-w-0 overflow-y-auto">
          <Page route={route} />
        </main>
      </div>
    </div>
  )
}
