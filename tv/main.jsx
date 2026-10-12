// Samsung TV entry. The TV runs the web app itself; this file only prepares
// the platform before it mounts. Import order is execution order: the shims
// in boot.js must exist before any shared module reaches for a missing API.
import './boot.js'
import { keepScreenOn, registerRemoteKeys } from './platform.js'
import { installRemote } from './remote.js'
import '../src/main.jsx'
import './tv.css'

registerRemoteKeys()
keepScreenOn()
installRemote()
