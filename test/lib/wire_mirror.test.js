import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

// nav.js reads import.meta.env at module scope, so a private-build assertion
// has to re-import the module graph with the flag already stubbed.
async function loadWire({ privateBuild = false } = {}) {
  vi.resetModules()
  vi.stubEnv('VITE_PRIVATE', privateBuild ? '1' : '')
  return import('../../src/lib/wire.js')
}

describe('mirror endpoint defaulting', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => { vi.unstubAllEnvs(); localStorage.clear() })

  it('points the public build at the worker mirror instead of the demo', async () => {
    const { wireUrl, mirrorBase, isMirrorBase } = await loadWire()
    const { proxyBase } = await import('../../src/lib/feed.js')
    expect(mirrorBase()).toBe(`${proxyBase()}/wire`)
    expect(wireUrl()).toBe(mirrorBase())
    expect(isMirrorBase(wireUrl())).toBe(true)
    expect(isMirrorBase(`${mirrorBase()}/`)).toBe(true)
    expect(isMirrorBase('https://someone-else.example/wire')).toBe(false)
  })

  it('still hands a viewer-supplied endpoint the wheel', async () => {
    const { wireUrl, setWireUrl, isMirrorBase } = await loadWire()
    setWireUrl('https://wire.example')
    expect(wireUrl()).toBe('https://wire.example')
    expect(isMirrorBase(wireUrl())).toBe(false)
  })

  it('never defaults the private build to the public mirror', async () => {
    const { wireUrl } = await loadWire({ privateBuild: true })
    expect(wireUrl()).toBe('')
  })

  it('treats the read-only mirror as no service at all', async () => {
    const { wireServiceUrl, setWireUrl } = await loadWire()
    expect(wireServiceUrl()).toBe('')          // mirror: no chat, saves, alerts, pushes
    setWireUrl('https://wire.example')
    expect(wireServiceUrl()).toBe('https://wire.example')
  })
})

describe('mirror freshness', () => {
  it('reports snapshot age in whole minutes, null before the first push', async () => {
    const { mirrorAgeMinutes } = await loadWire()
    expect(mirrorAgeMinutes(null, 1000)).toBe(null)
    expect(mirrorAgeMinutes(1000, 1000)).toBe(0)
    expect(mirrorAgeMinutes(1000, 1000 + 305)).toBe(5)
    expect(mirrorAgeMinutes(1000, 500)).toBe(0)     // clock skew is not the future
  })
})

describe('wire page mirror mode', () => {
  const page = source('src/pages/wire.jsx')

  it('branches on meta.mirror before deciding how to connect', () => {
    expect(page).toContain('if (out.mirror) startMirror()')
    expect(page).toContain('else startLive()')
  })

  it('opens no EventSource on the mirror — it polls once a minute', () => {
    expect(page).toContain('const MIRROR_POLL_MS = 60_000')
    expect(page).toContain('mirrorStop = startVisibleClock(MIRROR_POLL_MS,')
    // the only stream construction lives in the live path
    const live = page.slice(page.indexOf('const startLive ='), page.indexOf('const startMirror ='))
    expect(live).toContain('new EventSource(')
    const mirror = page.slice(page.indexOf('const startMirror ='), page.indexOf('fetchMeta(endpoint)'))
    expect(mirror).not.toContain('EventSource')
    expect(mirror).toContain('fetchEvents(endpoint')
  })

  it('has a state of its own, so nothing reads as LIVE or DEMO', () => {
    expect(page).toContain("setState('mirror')")
    expect(page).toContain("state === 'mirror' ? 'mirror'")
    expect(page).toContain('mirror: ')
    expect(page).toContain('data-wire-mirror-age')
  })

  it('degrades to the labeled demo when the mirror is empty or down', () => {
    expect(page).toContain('const startDemo = () =>')
    expect(page).toContain('if (first && !rows.length) { startDemo(); return }')
  })

  it('keeps the headline and the source link when /api/read is absent', () => {
    expect(page).toContain('isMirrorBase(base)')
    // status 'empty' is the branch that renders "open the page ↗"
    expect(page).toContain("setState({ status: 'empty', paras: [] }); return")
  })

  // The explanatory footnote under the feed was cut (Jeff 2026-08-21) — it
  // was a paragraph of chrome under a page whose whole job is headlines. The
  // labelling obligation did not go with it: a mirror still has to say it is
  // a mirror, and say how stale it is, in the header where the reader looks
  // for feed state.
  it('labels the mirror in the status header, with its age', () => {
    expect(page).toContain("state === 'mirror'")
    expect(page).toContain('data-wire-mirror-age')
    expect(page).toContain('wire.mirror_age')
    const i18n = source('src/lib/i18n.js')
    const at = i18n.indexOf("'wire.mirror_age':")
    expect(at).toBeGreaterThan(-1)
    expect(i18n.slice(at, at + 400)).toContain('zh:')
    expect(i18n).toContain("mirror: '镜像'")
  })
})

describe('service-only surfaces stay off the mirror', () => {
  // The mirror is a read-only headline archive. Anything that writes, chats,
  // saves or delivers has to ask for a real Fragwire, or the public build
  // would light up affordances that can only 404.
  const serviceOnly = [
    'src/lib/cloudsave.js', 'src/lib/chatstore.js', 'src/lib/wirechat.js',
    'src/lib/alertDelivery.js', 'src/lib/watchlistExport.js', 'src/lib/chatContext.js',
    'src/lib/tools.js', 'src/lib/feed.js', 'src/pages/chat.jsx',
    'src/pages/portfolio.jsx', 'src/pages/watchlists.jsx',
    // Reads too, when the endpoint they want is Fragwire-only: the mirror has
    // no symbol index (?symbols= answers empty), no /api/search, no article
    // extractor and no /api/ibkr/*. Pointing these at the mirror does not
    // degrade gracefully — it renders "wire unavailable" over a wire that is
    // up, and pays a request per render to get there.
    'src/pages/markets.jsx', 'src/pages/research/news.jsx',
    'src/pages/research/wireMini.jsx', 'src/pages/research/dividends.jsx',
    'src/components/EarningsDay.jsx',
  ]
  for (const path of serviceOnly) {
    it(`${path} resolves its endpoint through wireServiceUrl`, () => {
      const text = source(path)
      expect(text).toContain('wireServiceUrl')
      expect(text).not.toMatch(/[^A-Za-z]wireUrl\(/)
    })
  }
})
