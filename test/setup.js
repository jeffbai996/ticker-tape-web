// Global test setup: mock localStorage, Notification API, and reset state.

import { vi, beforeEach } from 'vitest'

// ── localStorage mock ────────────────────────────────
// storage.js calls localStorage.getItem/setItem/removeItem directly.
// jsdom provides a working localStorage, but we clear it before each test
// so tests are fully isolated (no bleed between test cases).
beforeEach(() => {
  localStorage.clear()
})

// ── Notification API mock ────────────────────────────
// toast.js calls new Notification() when permission is granted.
// Default to 'denied' so tests don't create real notifications.
if (!global.Notification) {
  global.Notification = class {
    constructor() {}
    static permission = 'denied'
    static requestPermission() { return Promise.resolve('denied') }
  }
}
