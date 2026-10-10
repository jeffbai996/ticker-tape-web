import './boot.js'
import { render } from 'preact'
import { App } from './app.jsx'
import { keepScreenOn, registerRemoteKeys } from './platform.js'
import './tv.css'

// The layout is authored at 1920x1080, the web viewport of a Samsung TV. In
// a desktop browser the stage scales to fit so the same pixels can be checked.
function fitStage() {
  const stage = document.getElementById('stage')
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080)
  stage.style.transform = scale === 1 ? '' : `scale(${scale})`
}

addEventListener('resize', fitStage)
fitStage()
registerRemoteKeys()
keepScreenOn()
render(<App />, document.getElementById('stage'))
