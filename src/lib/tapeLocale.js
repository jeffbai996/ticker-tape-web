// The language the top tape reads in: its names and its headlines. It follows
// the app unless the reader picks one (Jeff 2026-10-08). Per device, like the
// tape's watchlist choice.
import { getLocale } from './i18n.js'

const KEY = 'tape_locale_v1'
export const TAPE_LOCALES = ['auto', 'en', 'zh']
const listeners = new Set()

export function getTapeLocaleSetting() {
  try {
    const saved = localStorage.getItem(KEY)
    return TAPE_LOCALES.includes(saved) ? saved : 'auto'
  } catch { return 'auto' }
}

export function setTapeLocaleSetting(value) {
  const next = TAPE_LOCALES.includes(value) ? value : 'auto'
  try { localStorage.setItem(KEY, next) } catch { /* best-effort */ }
  for (const fn of [...listeners]) fn(next)
}

/** 'en' or 'zh': the reader's choice, or the app's language under 'auto'. */
export function tapeLocale() {
  const setting = getTapeLocaleSetting()
  return setting === 'auto' ? getLocale() : setting
}

export function onTapeLocaleChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
