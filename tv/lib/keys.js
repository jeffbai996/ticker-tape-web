// Samsung remote → remote-layer actions. Tizen delivers the D-pad, Enter and
// Back to a web app unasked; the colour and channel keys arrive only after
// tvinputdevice.registerKey, which is why REGISTERED_KEYS lists just those.
// PageUp/PageDown stand in for the channel keys on a desktop keyboard. Escape
// stays the app's own key: Back reuses it by dispatching one, so mapping it
// here too would close two layers per press. Letters and Backspace are never
// mapped; they belong to whatever text field has focus.

const BY_CODE = new Map([
  [37, 'left'], [38, 'up'], [39, 'right'], [40, 'down'],
  [13, 'enter'],
  [10009, 'back'],
  [403, 'red'], [404, 'green'], [405, 'yellow'], [406, 'blue'],
  [427, 'pageUp'], [428, 'pageDown'], [33, 'pageUp'], [34, 'pageDown'],
])

export const REGISTERED_KEYS = [
  'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
  'ChannelUp', 'ChannelDown',
]

/** The action a keydown means, or null when the remote layer leaves it alone. */
export function actionForKey(event) {
  return BY_CODE.get(event.keyCode) || null
}
