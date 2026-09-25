// Route-level code splitting without pulling in preact/compat.
//
// The shell, the dashboard, and the command grammar are the first paint; every
// other routed surface is a separate chunk fetched the first time its hash is
// visited (2026-08-18: the single bundle had grown past Vite's 500 kB warning).
// `lazy`/`Suspense` from preact/compat would work, but compat is dead weight in
// a codebase that never touches the React API — this is the whole feature in
// twenty lines.
//
// The resolved component is cached on the wrapper, so re-entering a route (back
// button, tab switch) renders synchronously with no second fallback flash.

import { useEffect, useState } from 'preact/hooks'
import { Loading } from './Loading.jsx'
import { t as tt, getLocale } from '../lib/i18n.js'

/** Fills the routed area so the page does not jump when the chunk lands. */
function PageFallback() {
  return (
    <div class="flex-1 min-w-0 flex items-start justify-center pt-16">
      <Loading label={tt('common.loading')} />
    </div>
  )
}

/**
 * @param {() => Promise<Function>} load resolves to the page component
 * @returns {Function} a component that renders the fallback until it does
 */
export function lazyPage(load, timeoutMs = 12000) {
  let Comp = null
  let pending = null
  // A chunk fetch fails for one common reason: the tab has been open across a
  // deploy and the hashed file is gone. The in-flight promise is cached so a
  // route is only fetched once — but caching the REJECTION pins the route on
  // its fallback until the tab is reloaded, so a failure clears the slot and
  // the next visit is allowed to ask again.
  const preload = () => {
    if (!pending) {
      let timer
      const attempt = Promise.race([
        Promise.resolve().then(load),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Page load timed out')), timeoutMs) }),
      ])
      pending = attempt.finally(() => clearTimeout(timer)).then(
        (c) => { Comp = c; return c },
        (err) => { pending = null; throw err },
      )
    }
    return pending
  }

  function Lazy(props) {
    // Hook order stays fixed whether or not the chunk is already resolved.
    const [, bump] = useState(0)
    const [error, setError] = useState(false)
    const [attempt, retry] = useState(0)
    useEffect(() => {
      if (Comp) return undefined
      let alive = true
      setError(false)
      preload().then(
        () => { if (alive) bump((n) => n + 1) },
        () => { if (alive) setError(true) },
      )
      return () => { alive = false }
    }, [attempt])
    if (Comp) return <Comp {...props} />
    if (error) {
      const zh = getLocale() === 'zh'
      return <div role="alert" class="flex-1 min-w-0 px-5 py-12 font-mono text-[12px]">
        <p class="text-ink">{zh ? '页面未能加载。' : 'Page could not load.'}</p>
        <p class="mt-2 text-muted">{zh ? '请重试；更新后仍无法加载时，请刷新页面。' : 'Retry, or reload the page after an update.'}</p>
        <div class="mt-3 flex gap-2">
          <button class="rounded border border-line px-3 py-1 text-accent hover:bg-surface-3" onClick={() => retry(n => n+1)}>{zh ? '重试' : 'Retry'}</button>
          <button class="rounded border border-line px-3 py-1 text-ink-2 hover:bg-surface-3" onClick={() => location.reload()}>{zh ? '刷新页面' : 'Reload page'}</button>
        </div>
      </div>
    }
    return <PageFallback />
  }
  Lazy.preload = preload
  return Lazy
}
