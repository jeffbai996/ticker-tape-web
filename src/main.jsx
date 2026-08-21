import { render } from 'preact'
import { App } from './app.jsx'
import { startWatchlistSync } from './lib/cloudsave.js'
import { startMyPortfolioSync } from './lib/portfolioSync.js'
import { startWireWatchlistSync } from './lib/watchlistExport.js'
import { startFreshnessWatch } from './lib/freshness.js'
import './styles/main.css'

render(<App />, document.getElementById('app'))
// Private builds use the wire save; public builds stay local until the viewer
// explicitly enables capability-scoped watchlist sync.
startWatchlistSync()
startMyPortfolioSync()
startWireWatchlistSync()
// stale open tabs reload themselves on tab-return after a deploy
startFreshnessWatch()
