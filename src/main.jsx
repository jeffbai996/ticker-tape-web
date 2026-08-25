import { render } from 'preact'
import { App } from './app.jsx'
import { startWireWatchlistSync } from './lib/watchlistExport.js'
import { startFreshnessWatch } from './lib/freshness.js'
import { registerServiceWorker } from './lib/pwa.js'
import './styles/main.css'

render(<App />, document.getElementById('app'))
// Capability-scoped sync belongs only to builds that HAVE a capability: the
// family build (its own host) and the private tailnet build. The public
// deploy carries none, and until 2026-08-25 it carried one — the family
// bearer was baked into the world-readable Pages bundle. Importing these
// behind the flag means the portfolio-sync module is not merely inert in the
// public build, it is not bundled into it.
if (import.meta.env.VITE_FAMILY_BUILD === '1' || import.meta.env.VITE_PRIVATE === '1') {
  import('./lib/cloudsave.js').then((m) => m.startWatchlistSync())
  import('./lib/portfolioSync.js').then((m) => m.startMyPortfolioSync())
}
startWireWatchlistSync()
// stale open tabs reload themselves on tab-return after a deploy
startFreshnessWatch()
// the shell launches from disk on the next open (add-to-home-screen works)
registerServiceWorker()
