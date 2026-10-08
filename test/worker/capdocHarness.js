import { CapDocCoordinator } from '../../worker/capdoc.js'

function storage() {
  const rows = new Map()
  return {
    rows,
    async get(key) { return rows.get(key) },
    async put(key, value) { rows.set(key, value) },
    async delete(key) { rows.delete(key) },
    async list({ prefix = '', limit } = {}) {
      const hits = [...rows].filter(([k]) => k.startsWith(prefix)).sort()
      return new Map(limit ? hits.slice(0, limit) : hits)
    },
  }
}

export function capDocEnv(token) {
  const kvRows = new Map()
  const SPEND = {
    rows: kvRows,
    async get(key) { return kvRows.get(key) ?? null },
    async put(key, value) { kvRows.set(key, value) },
    async delete(key) { kvRows.delete(key) },
  }
  const objects = new Map()
  const env = { SPEND, FAMILY_SYNC_TOKEN: token }
  env.CAP_DOCS = {
    idFromName(name) { return name },
    get(id) {
      if (!objects.has(id)) {
        const coordinator = new CapDocCoordinator({ storage: storage() }, env)
        objects.set(id, coordinator)
      }
      return { fetch: (...args) => objects.get(id).fetch(new Request(...args)) }
    },
  }
  return env
}
