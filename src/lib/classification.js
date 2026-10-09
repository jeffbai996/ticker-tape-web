import { fetchProfile } from './fundamentals.js'
import { fetchCnIndustry, isCnListing } from './cnData.js'

const SECTORS = {
  technology: 'Software & AI',
  'communication services': 'Consumer & Media',
  'consumer cyclical': 'Consumer & Media',
  'consumer defensive': 'Staples',
  'financial services': 'Financials',
  financials: 'Financials',
  healthcare: 'Health',
  energy: 'Energy & Industrials',
  industrials: 'Energy & Industrials',
  utilities: 'Energy & Industrials',
  'basic materials': 'Materials',
  'real estate': 'Real Estate',
}

/** Industry takes precedence: chip makers share Technology with software. */
export function categoryFromProfile(profile) {
  const industry = String(profile?.industry || '').trim()
  if (/semiconductor|半导体/i.test(industry)) return 'Semis'
  const sector = String(profile?.sector || '').trim().toLowerCase()
  if (SECTORS[sector]) return SECTORS[sector]
  if (/银行|保险|证券|金融/.test(industry)) return 'Financials'
  if (/软件|互联网|信息技术/.test(industry)) return 'Software & AI'
  if (/医药|医疗|生物科技/.test(industry)) return 'Health'
  if (/食品|饮料|农业/.test(industry)) return 'Staples'
  if (/电力|电气|机械|能源|石油|煤炭|运输|建筑/.test(industry)) return 'Energy & Industrials'
  if (/有色金属|钢铁|化工|材料/.test(industry)) return 'Materials'
  if (/房地产|地产/.test(industry)) return 'Real Estate'
  return null
}

/** Failed or incomplete providers leave the existing General fallback intact. */
export async function resolveClassification(symbol, {
  profile = fetchProfile, industry = fetchCnIndustry,
} = {}) {
  try {
    const category = categoryFromProfile(await profile(symbol))
    if (category) return category
  } catch { /* The regional provider can still classify this listing. */ }
  if (isCnListing(symbol)) {
    try { return categoryFromProfile({ industry: await industry(symbol) }) }
    catch { /* Missing metadata is not a classification. */ }
  }
  return null
}
