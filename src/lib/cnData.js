/** Chinese-language market data for HK / mainland listings — news by
 *  company name, company profiles, industry labels — through the worker's
 *  /cn/* routes (East Money upstream). Yahoo has none of this: its search
 *  ignores CJK and its profiles are English prose.
 *
 *  Parsers are pure and exported for tests; fetchers accept a `fetchImpl`
 *  so nothing here needs a network to be exercised.
 */

import { proxyBase } from './feed.js'

const CN_SYMBOL = /^\d{1,6}\.(HK|SS|SZ)$/i

/** Does the /cn/* surface cover this symbol at all? */
export function isCnListing(symbol) {
  return CN_SYMBOL.test(String(symbol || '').trim())
}

/** East Money search result → [{title, summary, source, url, ts}] newest first. */
export function parseCnNews(data) {
  const rows = data?.result?.cmsArticleWebOld || []
  return rows
    .filter((r) => r?.title && r?.url)
    .map((r) => ({
      title: String(r.title).replace(/<[^>]+>/g, ''),
      summary: String(r.content || '').replace(/<[^>]+>/g, '').trim(),
      source: r.mediaName || '',
      url: r.url,
      ts: Date.parse(String(r.date || '').replace(' ', 'T') + '+08:00') || 0,
    }))
    .sort((a, b) => b.ts - a.ts)
}

/** HK CompanyProfile or A-share CompanySurvey → {name, nameEn, profile, business, industry, listed, exchange}. */
export function parseCnProfile(data) {
  if (data?.gszl) {                         // Hong Kong
    const g = data.gszl
    const z = data.zqzl || {}
    return {
      name: g.gsmc || '', nameEn: g.ywmc || '',
      profile: String(g.gsjs || '').trim(), business: String(g.zyyw || '').trim(),
      industry: '', listed: String(z.ssrq || '').split(' ')[0].replace(/\//g, '-'),
      exchange: z.jys || '', chairman: g.dsz || '', employees: g.ygrs || '', website: g.gswz || '',
    }
  }
  const j = Array.isArray(data?.jbzl) ? data.jbzl[0] : null
  if (!j) return null
  return {
    name: j.ORG_NAME || j.SECURITY_NAME_ABBR || '', nameEn: j.ORG_NAME_EN || '',
    profile: String(j.ORG_PROFILE || '').trim(), business: String(j.BUSINESS_SCOPE || '').trim(),
    industry: j.EM2016 || j.INDUSTRYCSRC1 || '', listed: '',
    exchange: j.TRADE_MARKET || '', chairman: j.CHAIRMAN || '', employees: j.EMP_NUM || '', website: j.ORG_WEB || '',
  }
}

/** The East Money industry label, from either shape the worker proxies:
 *  push2 stock/get (HK: f127 "软件服务") or the mainland company survey
 *  (EM2016 "金融-银行-股份制与城商行" → the middle tier, "银行"). */
export function parseCnIndustry(data) {
  const f127 = String(data?.data?.f127 || '').trim()
  if (f127) return f127
  const j = Array.isArray(data?.jbzl) ? data.jbzl[0] : null
  const em = String(j?.EM2016 || j?.INDUSTRYCSRC1 || '').trim()
  if (!em) return ''
  const parts = em.split('-').map((x) => x.trim()).filter(Boolean)
  return parts.length >= 3 ? parts[1] : parts[parts.length - 1]
}

async function getJson(path, { fetchImpl = fetch, signal } = {}) {
  const resp = await fetchImpl(`${proxyBase()}${path}`, { signal: signal ?? AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`cn: HTTP ${resp.status}`)
  return resp.json()
}

export async function fetchCnNews(name, { n = 8, ...opts } = {}) {
  return parseCnNews(await getJson(`/cn/news?q=${encodeURIComponent(name)}&n=${n}`, opts))
}

export async function fetchCnProfile(symbol, opts = {}) {
  if (!isCnListing(symbol)) return null
  return parseCnProfile(await getJson(`/cn/profile?symbol=${encodeURIComponent(symbol.toUpperCase())}`, opts))
}

/** Industry labels are stable for months — remembered per symbol so a
 *  20-name book asks once, not every render. */
const IND_KEY = 'cn_industry_v1'
function readInd() {
  try { return JSON.parse(localStorage.getItem(IND_KEY)) || {} } catch { return {} }
}

export async function fetchCnIndustry(symbol, opts = {}) {
  if (!isCnListing(symbol)) return ''
  const sym = symbol.toUpperCase()
  const known = readInd()
  if (typeof known[sym] === 'string') return known[sym]
  const label = parseCnIndustry(await getJson(`/cn/industry?symbol=${encodeURIComponent(sym)}`, opts))
  try { localStorage.setItem(IND_KEY, JSON.stringify({ ...readInd(), [sym]: label })) } catch { /* best-effort */ }
  return label
}
