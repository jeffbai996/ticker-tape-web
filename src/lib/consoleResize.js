/** Height of a bottom-docked console while its top edge is dragged. */
export function consoleHeightAt(startHeight, startY, pointerY, viewportHeight) {
  const wanted = startHeight + (startY - pointerY)
  return Math.max(120, Math.min(viewportHeight * 0.8, wanted))
}
