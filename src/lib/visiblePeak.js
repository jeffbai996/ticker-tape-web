import { fmtPrice } from './format.js'

export function peakInRange(bars, range) {
  if (!range || !bars?.length) return null
  const first = Math.max(0, Math.ceil(range.from))
  const last = Math.min(bars.length - 1, Math.floor(range.to))
  let peak = null
  for (let i = first; i <= last; i++) {
    const bar = bars[i]
    if (Number.isFinite(bar?.high) && (!peak || bar.high > peak.high)) peak = bar
  }
  return peak
}

// The label lives over the chart canvas so it never changes the price scale.
export function attachVisiblePeak(chart, series, host, bars) {
  const marker = document.createElement('div')
  marker.className = 'pointer-events-none absolute z-10 font-mono text-[9px] text-ink tabular-nums whitespace-nowrap'
  marker.style.cssText = 'display:none;transform:translate(-100%,-50%);text-shadow:0 1px 4px #000,0 1px 4px #000'
  const dot = document.createElement('span')
  dot.className = 'pointer-events-none absolute z-10 rounded-full bg-accent-2'
  dot.style.cssText = 'display:none;width:4px;height:4px;transform:translate(-50%,-50%)'
  host.append(marker, dot)
  let shown = null
  const update = () => {
    const bar = peakInRange(bars, chart.timeScale().getVisibleLogicalRange())
    const x = bar && chart.timeScale().timeToCoordinate(bar.time)
    const y = bar && series.priceToCoordinate(bar.high)
    if (!bar || x == null || y == null || x < 0 || x > host.clientWidth) {
      marker.style.display = 'none'
      dot.style.display = 'none'
      shown = null
      return
    }
    if (shown !== bar) {
      marker.textContent = fmtPrice(bar.high)
      shown = bar
    }
    marker.style.display = 'block'
    dot.style.display = 'block'
    const roomOnLeft = x >= marker.offsetWidth + 12
    marker.style.transform = roomOnLeft ? 'translate(-100%,-50%)' : 'translate(0,-50%)'
    marker.style.left = `${x + (roomOnLeft ? -9 : 9)}px`
    marker.style.top = `${Math.max(10, y - 8)}px`
    dot.style.left = `${x}px`
    dot.style.top = `${y}px`
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(update)
  const observer = new ResizeObserver(update)
  observer.observe(host)
  update()
  return () => {
    chart.timeScale().unsubscribeVisibleLogicalRangeChange(update)
    observer.disconnect()
    marker.remove()
    dot.remove()
  }
}
