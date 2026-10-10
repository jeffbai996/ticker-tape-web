// Samsung remote → app actions. Tizen delivers the D-pad, Enter and Back to a
// web app unasked; the colour and channel keys arrive only after
// tvinputdevice.registerKey, which is why REGISTERED_KEYS lists just those.
// Desktop keys stand in for each one so the board can be driven in a browser.

const BY_CODE = new Map([
  [37, 'left'], [38, 'up'], [39, 'right'], [40, 'down'],
  [13, 'enter'],
  [10009, 'back'], [27, 'back'], [8, 'back'],
  [403, 'red'], [404, 'green'], [405, 'yellow'], [406, 'blue'],
  [427, 'pageUp'], [428, 'pageDown'], [33, 'pageUp'], [34, 'pageDown'],
])

const BY_KEY = new Map([
  ['Escape', 'back'], ['Backspace', 'back'],
  ['r', 'red'], ['g', 'green'], ['y', 'yellow'], ['b', 'blue'],
  ['PageUp', 'pageUp'], ['PageDown', 'pageDown'],
])

export const REGISTERED_KEYS = [
  'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
  'ChannelUp', 'ChannelDown',
]

/** The action a keydown means, or null when the app leaves it alone. */
export function actionForKey(event) {
  return BY_CODE.get(event.keyCode) || BY_KEY.get(event.key) || null
}
