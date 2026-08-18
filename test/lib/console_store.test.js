import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Jeff 2026-08-17: "Add console to phone UI somewhere in the chin. The console
// on phone should just be its own page rather than be allowed to float."
// The log + history move into a tiny shared store so the desktop bar and the
// phone page are two views of one console.
describe('console store', () => {
  let store
  beforeEach(async () => {
    store = await import('../../src/lib/consoleStore.js')
    store._reset()
  })
  it('print appends, caps at 41 lines, and notifies subscribers', () => {
    const seen = []
    const off = store.subscribe((log) => seen.push(log.length))
    for (let i = 0; i < 45; i++) store.print(`c${i}`, `out ${i}`)
    expect(store.getLog().length).toBe(41)
    expect(store.getLog()[0].cmd).toBe('c4')
    expect(seen.at(-1)).toBe(41)
    off()
    store.print('x', 'y')
    expect(seen.at(-1)).toBe(41)      // unsubscribed — no more notifications
  })
  it('history is shared and recall walks newest-first', () => {
    store.pushHistory('a'); store.pushHistory('b')
    expect(store.getHistory()).toEqual(['a', 'b'])
    expect(store.recall(0)).toBe('b')
    expect(store.recall(1)).toBe('a')
    expect(store.recall(2)).toBe(null)
  })
  it('clear empties the log and notifies', () => {
    store.print('a', 'b'); store.clear()
    expect(store.getLog()).toEqual([])
  })
})

describe('phone console page', () => {
  const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
  it('routes #/console to a dedicated page and the chin has a >_ slot', () => {
    expect(src('src/pages/index.jsx')).toMatch(/route\.section === 'console'/)
    expect(src('src/lib/nav.js')).toMatch(/id: 'console'/)
    // the >_ label is nav data; the chin renders phone-only entries raw
    expect(src('src/lib/nav.js')).toMatch(/label: '>_'.*phoneOnly: true/)
    expect(src('src/components/BottomNav.jsx')).toMatch(/section\.phoneOnly \? section\.label/)
    // desktop sidebar + palette nav skip phone-only entries
    expect(src('src/components/Sidebar.jsx')).toMatch(/!s\.phoneOnly/)
    expect(src('src/lib/search.js')).toMatch(/section\.phoneOnly\) continue/)
  })
  it('the page pins its input at the bottom above the chin and uses the shared store; the desktop bar stays desktop-only', () => {
    const page = src('src/pages/console.jsx')
    expect(page).toMatch(/consoleStore/)
    expect(page).toMatch(/sticky bottom-0/)                 // input pinned above the chin
    expect(page).toMatch(/text-\[16px\]|text-base/)     // no iOS focus zoom
    const bar = src('src/components/CommandBar.jsx')
    expect(bar).toMatch(/max-md:hidden/)                 // floating panel remains desktop-only
    expect(bar).toMatch(/consoleStore/)                  // and reads the same log
  })
})
