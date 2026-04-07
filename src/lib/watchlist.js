// Watchlist management: custom symbol filter + groups.
// Default symbols come from data files. User can add/remove via localStorage.

import { getItem, setItem } from './storage.js'

const FILTER_KEY = 'watchlist_filter'
const GROUPS_KEY = 'watchlist_groups'

// Get custom watchlist filter (null = use all from data)
export function getWatchlistFilter() {
  return getItem(FILTER_KEY, null)
}

export function setWatchlistFilter(symbols) {
  if (!symbols?.length) {
    localStorage.removeItem(FILTER_KEY)
  } else {
    setItem(FILTER_KEY, symbols.map(s => s.toUpperCase()))
  }
}

export function addToWatchlist(symbol) {
  const current = getWatchlistFilter() || []
  if (!current.includes(symbol.toUpperCase())) {
    current.push(symbol.toUpperCase())
    setItem(FILTER_KEY, current)
  }
}

export function removeFromWatchlist(symbol) {
  const current = getWatchlistFilter()
  if (!current) return
  setItem(FILTER_KEY, current.filter(s => s !== symbol.toUpperCase()))
}

// Groups
export function loadGroups() {
  return getItem(GROUPS_KEY, {})
}

export function saveGroup(name, symbols) {
  const groups = loadGroups()
  groups[name] = symbols.map(s => s.toUpperCase())
  setItem(GROUPS_KEY, groups)
}

export function deleteGroup(name) {
  const groups = loadGroups()
  delete groups[name]
  setItem(GROUPS_KEY, groups)
}
