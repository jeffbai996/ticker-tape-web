const INTERACTIVE = 'a, button, input, select, textarea, form, [role="button"]'

/** Whether a card click came from inert space and should open its dashboard. */
export function shouldOpenWatchlistCard(event, selectedText = '') {
  if (event?.defaultPrevented || selectedText) return false
  return !event?.target?.closest?.(INTERACTIVE)
}
