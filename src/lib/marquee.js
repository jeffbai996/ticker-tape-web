/** Number of identical cycles needed to cover the viewport plus one spare. */
export function marqueeCopies(viewportWidth, cycleWidth) {
  if (!(viewportWidth > 0) || !(cycleWidth > 0)) return 2
  return Math.max(2, Math.ceil(viewportWidth / cycleWidth) + 1)
}
