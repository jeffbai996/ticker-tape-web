// Keep the viewport attached to real bars. lightweight-charts otherwise lets
// wheel zoom and drag create arbitrary empty logical bars beyond both edges.
export function boundedTimeScale(timeVisible = false) {
  return {
    borderColor: 'rgba(255,255,255,0.10)',
    timeVisible,
    rightOffset: 0,
    minBarSpacing: 0.5,
    fixLeftEdge: true,
    fixRightEdge: true,
    lockVisibleTimeRangeOnResize: true,
  }
}
