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
  marker.className = 'pointer-events-none absolute z-10 font-mono text-[11px] text-ink tabular-nums whitespace-nowrap'
  marker.style.cssText = 'display:none;transform:translate(-50%,-100%);text-shadow:0 1px 4px #000,0 1px 4px #000'
  const dot = document.createElement('span')
  dot.className = 'absolute left-1/2 -translate-x-1/2 rounded-full bg-accent-2'
  dot.style.cssText = 'width:5px;height:5px;bottom:-5px'
  marker.append(dot)
  host.append(marker)
  let shown = null
  const update = () => {
    const bar = peakInRange(bars, chart.timeScale().getVisibleLogicalRange())
    const x = bar && chart.timeScale().timeToCoordinate(bar.time)
    const y = bar && series.priceToCoordinate(bar.high)
    if (!bar || x == null || y == null || x < 0 || x > host.clientWidth) {
      marker.style.display = 'none'
      shown = null
      return
    }
    if (shown !== bar) {
      marker.replaceChildren(document.createTextNode(fmtPrice(bar.high)), dot)
      shown = bar
    }
    marker.style.display = 'block'
    marker.style.left = `${Math.max(35, Math.min(host.clientWidth - 35, x))}px`
    marker.style.top = `${Math.max(24, y - 7)}px`
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(update)
  const observer = new ResizeObserver(update)
  observer.observe(host)
  update()
  return () => {
    chart.timeScale().unsubscribeVisibleLogicalRangeChange(update)
    observer.disconnect()
    marker.remove()
  }
}
