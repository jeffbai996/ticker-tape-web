// Two focus zones: the watchlist board and the markets rail. Each keeps its
// own row index so Left/Right returns to where the viewer was, and every move
// re-clamps against current sizes because the board shrinks when a symbol is
// removed.

export const INITIAL_FOCUS = { zone: 'board', board: 0, rail: 0 }

const clamp = (n, size) => Math.max(0, Math.min(n, Math.max(0, size - 1)))

export function moveFocus(focus, action, { board, rail, page }) {
  const next = {
    zone: focus.zone,
    board: clamp(focus.board, board),
    rail: clamp(focus.rail, rail),
  }
  if (next.zone === 'board' && board === 0 && rail > 0) next.zone = 'rail'
  if (next.zone === 'rail' && rail === 0) next.zone = 'board'

  const zone = next.zone
  const size = zone === 'board' ? board : rail
  switch (action) {
    case 'up': next[zone] = clamp(next[zone] - 1, size); break
    case 'down': next[zone] = clamp(next[zone] + 1, size); break
    case 'pageUp': next[zone] = clamp(next[zone] - page, size); break
    case 'pageDown': next[zone] = clamp(next[zone] + page, size); break
    case 'right': if (zone === 'board' && rail > 0) next.zone = 'rail'; break
    case 'left': if (zone === 'rail' && board > 0) next.zone = 'board'; break
    default: break
  }
  return next
}

/** First visible row of a scrolling list: move only when focus would leave
 *  the window, so the board does not jump on every keypress. */
export function windowStart(start, index, total, rows) {
  if (total <= rows) return 0
  let first = start
  if (index < first) first = index
  if (index >= first + rows) first = index - rows + 1
  return Math.max(0, Math.min(first, total - rows))
}
