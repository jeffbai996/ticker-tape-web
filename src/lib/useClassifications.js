import { useEffect, useState } from 'preact/hooks'
import { BUCKETS } from './symbols.js'
import { createPCache } from './pcache.js'
import { resolveClassification } from './classification.js'

const cache = createPCache('symbol_categories_v1', { max: 500 })
const pending = new Map()
const WEEK = 7 * 24 * 60 * 60_000

function lookup(symbol) {
  const hit = cache.get(symbol)
  const ttl = hit?.value ? WEEK : 10 * 60_000
  if (hit && Date.now() - hit.ts < ttl) return Promise.resolve(hit.value)
  if (!pending.has(symbol)) {
    pending.set(symbol, resolveClassification(symbol).then((value) => {
      cache.set(symbol, { value, ts: Date.now() })
      return value
    }).finally(() => pending.delete(symbol)))
  }
  return pending.get(symbol)
}

/** Only unmatched names need metadata; quote ticks never restart this work. */
export function useClassifications(symbols) {
  const key = symbols.filter((symbol) =>
    !BUCKETS.some((bucket) => bucket.symbols.includes(symbol))).join(',')
  const [categories, setCategories] = useState({})
  useEffect(() => {
    let active = true
    const queue = key ? key.split(',') : []
    const known = Object.fromEntries(queue.map((symbol) => [symbol, cache.peek(symbol)?.value]))
    setCategories(known)
    // Bound new provider requests while sharing in-flight work with the rail.
    const worker = async () => {
      while (active && queue.length) {
        const symbol = queue.shift()
        const category = await lookup(symbol)
        if (active && category) setCategories((current) => ({ ...current, [symbol]: category }))
      }
    }
    const workers = Math.min(4, queue.length)
    for (let i = 0; i < workers; i++) void worker()
    return () => { active = false }
  }, [key])
  return categories
}
