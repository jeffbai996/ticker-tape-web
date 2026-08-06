import { render } from 'preact'
import { App } from './app.jsx'
import { startWatchlistSync } from './lib/cloudsave.js'
import './styles/main.css'

render(<App />, document.getElementById('app'))
// wire-connected builds share watchlists through the cloud save; the public
// keyless build has no endpoint and the engine stays off
startWatchlistSync()
