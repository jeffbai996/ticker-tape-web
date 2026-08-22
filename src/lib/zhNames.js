/** Chinese company names → listing symbols, checked BEFORE the provider.
 *
 *  Yahoo's search ignores Chinese queries entirely — "中国人寿" returns
 *  nothing with or without lang/region (verified at the source 2026-08-22).
 *  Gordon, a zh reader, could only add holdings by code or English name.
 *  This table is public reference data (exchange-listed company names), not
 *  anyone's book: it covers the Hang Seng and mainland large-caps plus the
 *  common broad ETFs. Traditional forms sit beside simplified because Hong
 *  Kong brokers print one and mainland apps the other.
 */

const HK = 'HKG'
const SH = 'SHH'
const SZ = 'SHZ'

// symbol, simplified, traditional (only when it differs), venue
const ROWS = [
  // ── Hang Seng / HK main board ──
  ['0700.HK', '腾讯控股', '騰訊控股', HK], ['9988.HK', '阿里巴巴', '', HK],
  ['3690.HK', '美团', '美團', HK], ['1810.HK', '小米集团', '小米集團', HK],
  ['9618.HK', '京东集团', '京東集團', HK], ['9999.HK', '网易', '網易', HK],
  ['1024.HK', '快手', '', HK], ['9888.HK', '百度集团', '百度集團', HK],
  ['9626.HK', '哔哩哔哩', '嗶哩嗶哩', HK], ['9961.HK', '携程集团', '攜程集團', HK],
  ['0005.HK', '汇丰控股', '滙豐控股', HK], ['2318.HK', '中国平安', '中國平安', HK],
  ['1299.HK', '友邦保险', '友邦保險', HK], ['2628.HK', '中国人寿', '中國人壽', HK],
  ['0966.HK', '中国太平', '中國太平', HK], ['0939.HK', '建设银行', '建設銀行', HK],
  ['1398.HK', '工商银行', '工商銀行', HK], ['3988.HK', '中国银行', '中國銀行', HK],
  ['3968.HK', '招商银行', '招商銀行', HK], ['0998.HK', '中信银行', '中信銀行', HK],
  ['2388.HK', '中银香港', '中銀香港', HK], ['0011.HK', '恒生银行', '恒生銀行', HK],
  ['0388.HK', '香港交易所', '', HK], ['0941.HK', '中国移动', '中國移動', HK],
  ['0728.HK', '中国电信', '中國電信', HK], ['0762.HK', '中国联通', '中國聯通', HK],
  ['0883.HK', '中国海洋石油', '中國海洋石油', HK], ['0857.HK', '中国石油股份', '中國石油股份', HK],
  ['0386.HK', '中国石油化工', '中國石油化工', HK], ['1088.HK', '中国神华', '中國神華', HK],
  ['1211.HK', '比亚迪股份', '比亞迪股份', HK], ['0285.HK', '比亚迪电子', '比亞迪電子', HK],
  ['2015.HK', '理想汽车', '理想汽車', HK], ['9866.HK', '蔚来', '蔚來', HK],
  ['9868.HK', '小鹏汽车', '小鵬汽車', HK], ['0175.HK', '吉利汽车', '吉利汽車', HK],
  ['0981.HK', '中芯国际', '中芯國際', HK], ['1347.HK', '华虹半导体', '華虹半導體', HK],
  ['2382.HK', '舜宇光学', '舜宇光學', HK], ['0268.HK', '金蝶国际', '金蝶國際', HK],
  ['0020.HK', '商汤', '商湯', HK], ['6869.HK', '长飞光纤光缆', '長飛光纖光纜', HK],
  ['2899.HK', '紫金矿业', '紫金礦業', HK], ['1818.HK', '招金矿业', '招金礦業', HK],
  ['3330.HK', '灵宝黄金', '靈寶黃金', HK], ['2099.HK', '中国黄金国际', '中國黃金國際', HK],
  ['1378.HK', '中国宏桥', '中國宏橋', HK], ['2050.HK', '三花智控', '', HK],
  ['0001.HK', '长和', '長和', HK], ['0016.HK', '新鸿基地产', '新鴻基地產', HK],
  ['0012.HK', '恒基地产', '恒基地產', HK], ['0017.HK', '新世界发展', '新世界發展', HK],
  ['0101.HK', '恒隆地产', '恒隆地產', HK], ['0823.HK', '领展房产基金', '領展房產基金', HK],
  ['0960.HK', '龙湖集团', '龍湖集團', HK], ['1109.HK', '华润置地', '華潤置地', HK],
  ['0688.HK', '中国海外发展', '中國海外發展', HK], ['0002.HK', '中电控股', '中電控股', HK],
  ['0003.HK', '香港中华煤气', '香港中華煤氣', HK], ['0006.HK', '电能实业', '電能實業', HK],
  ['2688.HK', '新奥能源', '新奧能源', HK], ['0027.HK', '银河娱乐', '銀河娛樂', HK],
  ['1928.HK', '金沙中国', '金沙中國', HK], ['2020.HK', '安踏体育', '安踏體育', HK],
  ['2331.HK', '李宁', '李寧', HK], ['2313.HK', '申洲国际', '申洲國際', HK],
  ['0288.HK', '万洲国际', '萬洲國際', HK], ['0669.HK', '创科实业', '創科實業', HK],
  ['0914.HK', '海螺水泥', '', HK], ['1919.HK', '中远海控', '中遠海控', HK],
  ['0267.HK', '中信股份', '', HK], ['2269.HK', '药明生物', '藥明生物', HK],
  ['1177.HK', '中国生物制药', '中國生物製藥', HK], ['1093.HK', '石药集团', '石藥集團', HK],
  ['6160.HK', '百济神州', '百濟神州', HK],
  ['2800.HK', '盈富基金', '', HK], ['2828.HK', '恒生中国企业', '恒生中國企業', HK],
  ['3033.HK', '南方恒生科技', '', HK],
  ['7709.HK', '南方东英海力士两倍杠杆', '南方東英海力士兩倍槓桿', HK],
  // ── Shanghai ──
  ['600519.SS', '贵州茅台', '貴州茅台', SH], ['601318.SS', '中国平安', '中國平安', SH],
  ['600036.SS', '招商银行', '招商銀行', SH], ['601166.SS', '兴业银行', '興業銀行', SH],
  ['601398.SS', '工商银行', '工商銀行', SH], ['601288.SS', '农业银行', '農業銀行', SH],
  ['601988.SS', '中国银行', '中國銀行', SH], ['601939.SS', '建设银行', '建設銀行', SH],
  ['600900.SS', '长江电力', '長江電力', SH], ['601857.SS', '中国石油', '中國石油', SH],
  ['600028.SS', '中国石化', '中國石化', SH], ['601088.SS', '中国神华', '中國神華', SH],
  ['600276.SS', '恒瑞医药', '恒瑞醫藥', SH], ['603259.SS', '药明康德', '藥明康德', SH],
  ['600030.SS', '中信证券', '中信證券', SH], ['601688.SS', '华泰证券', '華泰證券', SH],
  ['601012.SS', '隆基绿能', '隆基綠能', SH], ['600690.SS', '海尔智家', '海爾智家', SH],
  ['601899.SS', '紫金矿业', '紫金礦業', SH], ['600489.SS', '中金黄金', '中金黃金', SH],
  ['600309.SS', '万华化学', '萬華化學', SH], ['600887.SS', '伊利股份', '', SH],
  ['600809.SS', '山西汾酒', '', SH], ['601628.SS', '中国人寿', '中國人壽', SH],
  ['601601.SS', '中国太保', '中國太保', SH], ['600585.SS', '海螺水泥', '', SH],
  ['601766.SS', '中国中车', '中國中車', SH], ['600050.SS', '中国联通', '中國聯通', SH],
  ['600941.SS', '中国移动', '中國移動', SH], ['601728.SS', '中国电信', '中國電信', SH],
  ['603501.SS', '韦尔股份', '韋爾股份', SH], ['688981.SS', '中芯国际', '中芯國際', SH],
  ['688008.SS', '澜起科技', '瀾起科技', SH], ['688041.SS', '海光信息', '', SH],
  ['688256.SS', '寒武纪', '寒武紀', SH], ['688012.SS', '中微公司', '', SH],
  ['603986.SS', '兆易创新', '兆易創新', SH], ['600150.SS', '中国船舶', '中國船舶', SH],
  ['601919.SS', '中远海控', '中遠海控', SH],
  ['510300.SS', '沪深300ETF', '滬深300ETF', SH], ['510050.SS', '上证50ETF', '上證50ETF', SH],
  ['588000.SS', '科创50ETF', '科創50ETF', SH], ['512480.SS', '半导体ETF', '半導體ETF', SH],
  ['518880.SS', '黄金ETF', '黃金ETF', SH], ['513100.SS', '纳指ETF', '納指ETF', SH],
  ['513500.SS', '标普500ETF', '標普500ETF', SH],
  ['513050.SS', '中概互联网ETF', '中概互聯網ETF', SH], ['513090.SS', '香港证券ETF', '香港證券ETF', SH],
  // ── Shenzhen ──
  ['300750.SZ', '宁德时代', '寧德時代', SZ], ['002594.SZ', '比亚迪', '比亞迪', SZ],
  ['000858.SZ', '五粮液', '五糧液', SZ], ['000568.SZ', '泸州老窖', '瀘州老窖', SZ],
  ['000333.SZ', '美的集团', '美的集團', SZ], ['000651.SZ', '格力电器', '格力電器', SZ],
  ['300760.SZ', '迈瑞医疗', '邁瑞醫療', SZ], ['002475.SZ', '立讯精密', '立訊精密', SZ],
  ['000725.SZ', '京东方A', '京東方A', SZ], ['002415.SZ', '海康威视', '海康威視', SZ],
  ['000001.SZ', '平安银行', '平安銀行', SZ], ['002352.SZ', '顺丰控股', '順豐控股', SZ],
  ['002371.SZ', '北方华创', '北方華創', SZ], ['300308.SZ', '中际旭创', '中際旭創', SZ],
  ['300502.SZ', '新易盛', '', SZ], ['300394.SZ', '天孚通信', '天孚通訊', SZ],
  ['002049.SZ', '紫光国微', '紫光國微', SZ], ['000630.SZ', '铜陵有色', '銅陵有色', SZ],
  ['000657.SZ', '中钨高新', '中鎢高新', SZ],
  ['159915.SZ', '创业板ETF', '創業板ETF', SZ],
]

const BY_SYMBOL = new Map(ROWS.map(([symbol, zh, zht, exch]) => [symbol, { symbol, zh, zht: zht || zh, exch }]))

const CJK = /[㐀-鿿]/
const ETF_SUFFIX = /ETF$/i

/** Does this query need the alias table at all? */
export function hasCjk(q) {
  return CJK.test(String(q || ''))
}

/** The Chinese name for a symbol, or null when the table has none. */
export function zhName(symbol, { traditional = false } = {}) {
  const row = BY_SYMBOL.get(String(symbol || '').toUpperCase())
  if (!row) return null
  return traditional ? row.zht : row.zh
}

/** Suggestion rows for a Chinese query, provider-shaped ({symbol, name,
 *  exch, type}) so a dropdown needs no special case. Prefix matches rank
 *  first; a query that merely contains the name ("买腾讯") still hits. */
export function zhAliasHits(query, { limit = 8 } = {}) {
  const q = String(query || '').replace(/\s+/g, '')
  if (q.length < 2 || !CJK.test(q)) return []
  const scored = []
  for (const row of BY_SYMBOL.values()) {
    const names = row.zht === row.zh ? [row.zh] : [row.zh, row.zht]
    let best = 0
    for (const n of names) {
      if (n.startsWith(q)) best = Math.max(best, 3)
      else if (n.includes(q)) best = Math.max(best, 2)
      else if (q.includes(n)) best = Math.max(best, 1)
    }
    if (best) scored.push([best, row])
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].symbol.localeCompare(b[1].symbol))
  return scored.slice(0, limit).map(([, row]) => ({
    symbol: row.symbol, name: row.zh, exch: row.exch,
    type: ETF_SUFFIX.test(row.zh) || /基金$/.test(row.zh) ? 'ETF' : 'EQUITY',
  }))
}

/** Test/diagnostic hook — every symbol the table knows. */
export function zhKnownSymbols() {
  return [...BY_SYMBOL.keys()]
}
