import { matchesHoldingNews } from './holdingNewsMatch.js'
import { venueOfSymbol } from './cnMarkets.js'

export function selectNewsPortfolios(books, configured = '', selected = '') {
  const ids = new Set(configured.split(',').map(s => s.trim()).filter(Boolean))
  if (ids.size) return books.filter(book => ids.has(book.id))
  const book = books.find(book => book.id === selected) || books[0]
  return book ? [book] : []
}

const SECTORS = {
  Megacaps: /科技|互联网|雲端|云计算|人工智能|cloud computing|internet|technology sector/i,
  Semis: /半导体|半導體|芯片|晶片|晶圆|晶圓|存储|記憶體|semiconductor|chipmaker|foundry|memory chip/i,
  'Software & AI': /软件|軟件|互联网|互聯網|云计算|雲端|人工智能|software|cloud computing|artificial intelligence/i,
  'Consumer & Media': /消费|消費|零售|电商|電商|广告|廣告|retail|consumer spending|advertising|e-commerce/i,
  Staples: /食品|饮料|飲料|农业|農業|food prices|beverage|agriculture/i,
  Financials: /银行|銀行|保险|保險|证券|證券|券商|信贷|信貸|息差|banking|bank stocks|insurance|credit growth/i,
  Health: /医药|醫藥|医疗|醫療|生物科技|药品|藥品|healthcare|pharma|biotech/i,
  'Energy & Industrials': /能源|石油|煤炭|电力|電力|工业|工業|机械|機械|oil prices|natural gas|energy sector|industrial/i,
  Materials: /有色|金属|金屬|黄金|黃金|铜价|銅價|钢铁|鋼鐵|化工|采矿|採礦|gold prices|copper|metals|mining/i,
  'Real Estate': /房地产|房地產|地产|地產|楼市|樓市|住房|房贷|房貸|real estate|housing|mortgage/i,
}
const MARKETS = {
  US: /美股|美国|美國|美联储|美聯儲|纳斯达克|納斯達克|标普|標普|\b(?:Fed|FOMC|Nasdaq|S&P|US stocks|U\.S\.)\b/i,
  HK: /港股|香港|恒生|恆生|金管局|港交所|美联储|美聯儲|\b(?:Hong Kong|Hang Seng|HKMA|HKEX|Fed|FOMC)\b/i,
  CN: /A股|沪深|滬深|上证|上證|深证|深證|中国|中國|人民银行|人民銀行|央行|\b(?:China|PBOC|Shanghai|Shenzhen)\b/i,
  CA: /加拿大|加央行|\b(?:Canada|Canadian|TSX|Bank of Canada)\b/i,
}
const MACRO = /利率|通胀|通膨|通縮|通缩|货币政策|貨幣政策|经济增长|經濟增長|关税|關稅|\b(?:inflation|interest rates?|GDP|PMI|tariffs?|monetary policy)\b/i

/** Personal relevance is derived locally, never from the feed owner's thesis. */
export function familyEventTier(event, { holdings = [], watched = [] }) {
  if (holdings.some(holding => matchesHoldingNews(event, holding))) return 3
  if (watched.some(holding => matchesHoldingNews(event, holding))) return 2
  const universe = [...holdings, ...watched]
  if (!universe.length) return 0
  const text = `${event.headline || ''} ${event.headline_zh || ''}`
  if (universe.some(h => SECTORS[h.category]?.test(text))) return 2
  if (MACRO.test(text) || universe.some(h => MARKETS[venueOfSymbol(h.symbol)]?.test(text))) return 1
  return 0
}
