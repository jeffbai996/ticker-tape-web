// One console, two views: the desktop command bar's floating panel and the
// phone's dedicated #/console page both read and write this store, so a
// command run on either surface shows up on both. Module-level on purpose —
// the log must outlive whichever view is mounted.

const MAX_LINES = 41   // 40 prior + the one just printed (matches the old slice(-40))
let log = []
let history = []
let nextId = 1
const subs = new Set()

function emit() { for (const fn of subs) fn(log) }

export function getLog() { return log }
export function getHistory() { return history }

export function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

/** Append one command/output pair. */
export function print(cmd, text) {
  log = [...log.slice(-(MAX_LINES - 1)), { id: nextId++, cmd, text }]
  emit()
}

export function clear() {
  log = []
  emit()
}

export function pushHistory(cmd) {
  if (!cmd) return
  history = [...history, cmd]
}

/** n = 0 is the most recent command; null past the oldest. */
export function recall(n) {
  const i = history.length - 1 - n
  return i >= 0 && i < history.length ? history[i] : null
}

/** Test hook. */
export function _reset() {
  log = []; history = []; nextId = 1; subs.clear()
}
