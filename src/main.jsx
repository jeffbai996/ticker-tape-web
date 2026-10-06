import { render } from 'preact'
import { App } from './app.jsx'
import { startWireWatchlistSync } from './lib/watchlistExport.js'
import { startFreshnessWatch } from './lib/freshness.js'
import { registerServiceWorker } from './lib/pwa.js'
import { initMarketColorOrder } from './lib/marketColors.js'
import { getHighContrast, applyHighContrast } from './lib/contrast.js'
import './styles/main.css'

// Paint the preferred gain/loss convention before Preact mounts.
initMarketColorOrder()
applyHighContrast(getHighContrast())
render(<App />, document.getElementById('app'))
// Cloud sync rides the private build's wire save documents. The public deploy
// has no sync backend, so the modules are not bundled into it; instead it clears
// the orphaned book that an earlier public deploy once left in visitors'
// browsers (one time only, see familyResidue.js).
if (import.meta.env.VITE_PRIVATE === '1') {
  import('./lib/cloudsave.js').then((m) => m.startWatchlistSync())
  import('./lib/portfolioSync.js').then((m) => m.startMyPortfolioSync())
} else {
  import('./lib/familyResidue.js').then((m) => m.purgeFamilyResidue(globalThis.localStorage))
}
startWireWatchlistSync()
// stale open tabs reload themselves on tab-return after a deploy
startFreshnessWatch()
// the shell launches from disk on the next open (add-to-home-screen works)
registerServiceWorker()
