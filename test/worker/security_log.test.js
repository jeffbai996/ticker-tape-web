import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../../worker/worker.js'
import { coarseUserAgent, SECURITY_EVENT } from '../../worker/security_log.js'
import { capDocEnv } from './capdocHarness.js'

const TOKEN = 'a'.repeat(32)
const AUDIT_KEY = 'audit-key-'.padEnd(48, 'x')
const DEVICE = '12345678123412341234123456789abc'
const RAW_IP = '203.0.113.77'
const PRIVATE_BOOK_LABEL = 'private-family-book-name'

function env() {
  return Object.assign(capDocEnv(TOKEN), {
    TTW_SECURITY_LOGGING: '1',
    TTW_AUDIT_KEY: AUDIT_KEY,
  })
}

function request(path, init = {}, cf = { country: 'CA', asn: 64500, colo: 'YVR' }) {
  const req = new Request(`https://worker.test${path}`, init)
  Object.defineProperty(req, 'cf', { value: cf })
  return req
}

afterEach(() => vi.restoreAllMocks())

describe('privacy-bounded Worker security events', () => {
  it('logs a successful write without its token, body, raw device, IP, or full user agent', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const body = {
      rev: 0,
      data: {
        main: ['AAPL'],
        lists: [{ id: 'family', name: PRIVATE_BOOK_LABEL, symbols: ['NVDA'] }],
        touched: { main: 1, family: 1 },
        deleted: {},
      },
    }
    const req = request('/watchlists', {
      method: 'POST',
      headers: {
        Origin: 'https://jeffbai.com',
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'X-TTW-Device-ID': DEVICE,
        'CF-Connecting-IP': RAW_IP,
        'CF-Ray': 'abc123-YVR',
        'User-Agent': 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1 private-ua-marker',
      },
      body: JSON.stringify(body),
    })
    const response = await worker.fetch(req, env())
    expect(response.status).toBe(200)
    expect(log).toHaveBeenCalledTimes(1)
    const row = log.mock.calls[0][0]
    expect(row).toMatchObject({
      event: SECURITY_EVENT,
      kind: 'document', resource: 'watchlists', operation: 'write',
      auth: 'ok', status: 200, outcome: 'ok',
      revision_before: 0, revision_after: 1,
      country: 'CA', asn: 64500, colo: 'YVR', ray: 'abc123-YVR',
    })
    expect(row.device).toMatch(/^device:[a-f0-9]{20}$/)
    expect(row.network).toMatch(/^network:[a-f0-9]{20}$/)
    const serialized = JSON.stringify(row)
    for (const forbidden of [TOKEN, RAW_IP, DEVICE, PRIVATE_BOOK_LABEL, 'private-ua-marker']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('records explicit missing-token failures without logging a credential value', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const response = await worker.fetch(request('/portfolios', {
      headers: { Origin: 'https://jeffbai.com', 'CF-Connecting-IP': RAW_IP },
    }), env())
    expect(response.status).toBe(401)
    expect(log.mock.calls[0][0]).toMatchObject({
      resource: 'portfolios', operation: 'read', auth: 'missing', status: 401,
      outcome: 'authentication_required',
    })
  })

  it('does not misreport browser preflights as anonymous document reads', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const response = await worker.fetch(request('/watchlists', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://jeffbai.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization,X-TTW-Device-ID',
      },
    }), env())
    expect(response.status).toBe(204)
    expect(log).not.toHaveBeenCalled()
  })

  it('accepts a same-origin, authenticated browser beacon and rejects foreign origins', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const good = request('/telemetry/family-view', {
      method: 'POST',
      headers: {
        Origin: 'https://jeffbai.com', Authorization: `Bearer ${TOKEN}`,
        'X-TTW-Device-ID': DEVICE, 'CF-Connecting-IP': RAW_IP,
      },
    })
    expect((await worker.fetch(good, env())).status).toBe(204)
    expect(log.mock.calls[0][0]).toMatchObject({
      kind: 'browser', resource: 'family_page', operation: 'view', status: 204,
    })

    log.mockClear()
    const foreign = request('/telemetry/family-view', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example', Authorization: `Bearer ${TOKEN}`,
        'X-TTW-Device-ID': DEVICE,
      },
    })
    expect((await worker.fetch(foreign, env())).status).toBe(403)
    expect(log).not.toHaveBeenCalled()
  })

  it('uses coarse user-agent classes rather than retaining fingerprint strings', () => {
    expect(coarseUserAgent('MicroMessenger/8.0.0')).toBe('wechat')
    expect(coarseUserAgent('Googlebot/2.1')).toBe('bot-or-preview')
    expect(coarseUserAgent('ttw-backup/1')).toBe('ttw-backup')
  })
})
