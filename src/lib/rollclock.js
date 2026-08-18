// Rolodex time — fragwire's time-wheel mechanics, DOM-driven so preact only
// owns the container. Digits roll in place; non-digits rewrite in place.

export function paintRollingTime(element, value) {
  // Same string as last time = nothing to paint. Callers tick on a wall
  // clock, so the phone's HH:MM face is asked to repaint sixty times for
  // every change it actually has; without this guard each of those wrote an
  // aria-label and walked every cell for nothing.
  if (element.dataset.rollValue === value) return
  element.dataset.rollValue = value
  element.setAttribute('aria-label', value)
  if (element.children.length !== value.length) {
    const old = [...element.children]
    const shift = old.length - value.length
    element.innerHTML = ''
    ;[...value].forEach((character, index) => {
      const previous = old[index + shift]
      let cell = null
      if (previous && /\d/.test(character)
          && previous.classList.contains('time-wheel-digit')) {
        cell = previous
        cell.classList.remove('rolling')
        clearTimeout(cell.rollTimer)
        cell.innerHTML = `<span class="time-wheel-face">${cell.dataset.value}</span>`
      } else {
        cell = document.createElement('span')
        cell.setAttribute('aria-hidden', 'true')
        if (/\d/.test(character)) {
          cell.className = 'time-wheel-digit'
          cell.dataset.value = character
          cell.innerHTML = `<span class="time-wheel-face">${character}</span>`
        } else {
          cell.className = 'time-wheel-mark'
          cell.textContent = character
        }
      }
      element.appendChild(cell)
    })
  }
  ;[...value].forEach((character, index) => {
    const cell = element.children[index]
    if (!/\d/.test(character)) {
      if (cell.textContent !== character) cell.textContent = character
      return
    }
    if (cell.dataset.value === character) return
    const previous = cell.dataset.value
    cell.dataset.value = character
    clearTimeout(cell.rollTimer)
    cell.classList.remove('rolling')
    // no whitespace between the spans — inline-grid turns stray text into
    // its own grid item and knocks the digit off the baseline
    cell.innerHTML = `<span class="time-wheel-old">${previous}</span>`
      + `<span class="time-wheel-new">${character}</span>`
    void cell.offsetHeight
    cell.classList.add('rolling')
    cell.rollTimer = setTimeout(() => {
      if (cell.dataset.value !== character) return
      cell.classList.remove('rolling')
      cell.innerHTML = `<span class="time-wheel-face">${character}</span>`
    }, 360)
  })
}

/**
 * Cancel every in-flight roll on an element and settle it where the timer
 * would have.
 *
 * Each rolling digit arms a 360ms timer that swaps the two-face cell back to
 * a single face. On unmount those timers were still pending against detached
 * nodes: harmless work, but work, and it pinned the subtree in memory until
 * they fired. Doing the settle here as well as cancelling means the same
 * element can be repainted straight afterwards — the timezone cycle tears the
 * effect down and paints a new zone immediately — without leaving a digit
 * stuck mid-roll. Call this from the owning effect's cleanup.
 */
export function stopRollingTime(element) {
  if (!element) return
  for (const cell of element.children) {
    if (!cell.rollTimer) continue
    clearTimeout(cell.rollTimer)
    cell.rollTimer = null
    cell.classList.remove('rolling')
    cell.innerHTML = `<span class="time-wheel-face">${cell.dataset.value}</span>`
  }
}

/** IANA zones handle DST; we never do offset math ourselves. */
export const CLOCK_ZONES = [
  { id: 'America/New_York', label: 'ET' },
  { id: 'Asia/Hong_Kong', label: 'HKT' },
  { id: 'America/Los_Angeles', label: 'PT' },
]
