// Imported first by main.jsx: module bodies run in import order, so the shims
// are in place before any shared data module can reach for a missing API.
import { installPolyfills } from './lib/polyfills.js'

installPolyfills()
