import { beforeEach, describe, expect, it } from 'vitest'
import {
  rememberDashboardLanding, resolveDashboardLanding,
} from '../../src/lib/dashboardLanding.js'

beforeEach(() => localStorage.clear())

const lists = [
  { id: 'alice', name: 'Alice', symbols: ['AAPL'] },
  { id: 'bob', name: 'Bob', symbols: ['MSFT'] },
]

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

describe('dashboard landing watchlist', () => {
  it('lands on the main dashboard until this browser opens another list', () => {
    expect(resolveDashboardLanding(lists)).toBeNull()
  })

  it('remembers the last open named list in browser-local storage', () => {
    rememberDashboardLanding('alice')
    expect(resolveDashboardLanding(lists)).toBe('alice')
    expect(localStorage.getItem('dashboard_landing_v1')).toBe('alice')
  })

  it('can switch the landing selection back to the main dashboard', () => {
    rememberDashboardLanding('alice')
    rememberDashboardLanding(null)
    expect(resolveDashboardLanding(lists)).toBeNull()
    expect(localStorage.getItem('dashboard_landing_v1')).toBe('main')
  })

  it('drops a stale deleted-list preference instead of opening an empty board', () => {
    rememberDashboardLanding('alice')
    expect(resolveDashboardLanding([])).toBeNull()
    expect(localStorage.getItem('dashboard_landing_v1')).toBeNull()
  })

  it('keeps different browsers on their own last-open lists', () => {
    const hisBrowser = memoryStorage()
    const herBrowser = memoryStorage()
    rememberDashboardLanding('alice', hisBrowser)
    rememberDashboardLanding('bob', herBrowser)
    expect(resolveDashboardLanding(lists, hisBrowser)).toBe('alice')
    expect(resolveDashboardLanding(lists, herBrowser)).toBe('bob')
  })
})
