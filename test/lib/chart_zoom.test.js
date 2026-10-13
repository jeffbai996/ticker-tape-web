// The desktop layout zooms #app by --app-zoom. lightweight-charts reads the
// mouse as clientX - box.left, both on-screen pixels, but draws in its own
// CSS pixels, so under the zoom the crosshair landed at the cursor times the
// zoom: about an inch right of the cursor on the right of a wide chart
// (2026-10-13). Charts mount in a child that undoes the zoom.
import { afterEach, describe, expect, it } from 'vitest'
import { chartFont, chartHost } from '../../src/lib/chartview.js'

afterEach(() => document.documentElement.style.removeProperty('--app-zoom'))

describe('charts under the desktop zoom', () => {
  it('mount in one child that undoes the zoom, reused on a redraw', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const first = chartHost(host)
    expect(first.className).toBe('lwc-unzoom')
    expect(chartHost(host)).toBe(first)
    expect(host.querySelectorAll('.lwc-unzoom')).toHaveLength(1)
    expect(host.style.position).toBe('relative')
  })

  it('scale their font so text looks as it did', () => {
    document.documentElement.style.setProperty('--app-zoom', '1.1')
    expect(chartFont(10)).toBe(11)
    document.documentElement.style.setProperty('--app-zoom', '1')
    expect(chartFont(10)).toBe(10)
  })
})
