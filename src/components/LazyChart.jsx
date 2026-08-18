// The chart library, off the first paint.
//
// `lightweight-charts` is ~165 kB raw / ~53 kB gzip. The dashboard is the
// landing route and stays in the eager set on purpose, so a module-scope
// `import { createChart } from 'lightweight-charts'` there dragged the whole
// charting engine into index.html's modulepreload list: every first visit,
// phone included, downloaded and parsed a charting library before a single
// chart existed on screen — and the default widget rail has no chart in it.
//
// The widgets that do need it (dashboard mini charts, the demo portfolio
// equity curve) mount through this boundary instead, so the library lands in
// its own chunk fetched the first time such a widget actually appears. The
// routed chart surfaces (research, screen, ChartSuite) already live in lazy
// route chunks and pick the same chunk up from there.
//
// Two lessons carried over from LazyPage.jsx:
//   - the module promise is cached module-wide, so a second widget on the same
//     page does not re-fetch and does not flash its placeholder again;
//   - a REJECTION is never cached. A chunk fetch fails for one common reason —
//     the tab has been open across a deploy and the hashed file is gone — and
//     pinning that would leave every chart on its placeholder until reload.

import { useEffect, useRef, useState } from 'preact/hooks'

/**
 * One-shot module cache with retry-after-failure.
 * @param {() => Promise<object>} load resolves to the module namespace
 * @returns {() => Promise<object>} same promise for every caller
 */
export function chartModuleCache(load) {
  let mod = null
  let pending = null
  return () => {
    if (mod) return Promise.resolve(mod)
    if (!pending) {
      pending = Promise.resolve().then(load).then(
        (m) => { mod = m; return m },
        (err) => { pending = null; throw err },
      )
    }
    return pending
  }
}

/**
 * Resolves to the slice of `lightweight-charts` these widgets draw with;
 * fetched at most once.
 *
 * The destructure is load-bearing, not style. Handing the whole namespace
 * object out of the `import()` escapes it, Rollup can no longer prove which
 * exports are dead, and the chunk ships every series type in the library
 * (measured: 186 kB instead of 164 kB). Naming what is used keeps the chunk
 * the same size it was when the import was static. A widget that needs another
 * series type adds it here — it does not reach for the raw namespace.
 */
export const loadCharts = chartModuleCache(() => import('lightweight-charts')
  .then(({ createChart, AreaSeries }) => ({ createChart, AreaSeries })))

/**
 * A sized box that builds a chart into itself once the library is on the page.
 *
 * @param {object} props
 * @param {(host: HTMLElement, lib: object) => (() => void)|void} props.mount
 *   builds the chart into `host`; return the teardown (`chart.remove()`).
 * @param {any[]} [props.deps] re-run `mount` when these change, exactly like
 *   the `useEffect` deps the chart effect used before it moved here.
 * @param {string} [props.class] classes for the box — they must size it, since
 *   this box is what holds the layout open while the chunk is in flight.
 * @param {any} [props.placeholder] shown inside the box until the chart is up.
 * @param {any} [props.error] shown instead if the chunk never lands.
 * @param {() => Promise<object>} [props.load] injection seam for tests.
 */
export function ChartMount({
  mount, deps = [], class: cls = '', placeholder = null, error = null, load = loadCharts,
}) {
  const host = useRef(null)
  // `mount` is a fresh closure on every render — a quote ticking in the widget
  // header above the chart re-renders this component several times a minute.
  // Holding it in a ref lets the effect depend on `deps` alone, so a live chart
  // is never torn down and rebuilt by a re-render.
  const latest = useRef(mount)
  latest.current = mount
  const [state, setState] = useState('loading')

  useEffect(() => {
    const el = host.current
    if (!el) return undefined
    let alive = true
    let cleanup = null
    load().then(
      (lib) => {
        if (!alive) return
        cleanup = latest.current(el, lib) || null
        setState('ready')
      },
      () => { if (alive) setState('failed') },
    )
    return () => {
      alive = false
      if (cleanup) cleanup()
    }
  }, deps)

  return (
    <div class={`relative ${cls}`}>
      {/* The library owns this node's children. It carries no children of its
          own in the vnode tree, so preact never diffs into it and the canvases
          appended below survive every re-render above. */}
      <div ref={host} class="absolute inset-0" />
      {state !== 'ready' && (
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          {state === 'failed' ? error : placeholder}
        </div>
      )}
    </div>
  )
}
