// en/zh-CN internationalization, ported from the CLI's i18n string table.
// Two lookup styles: t('key') for sentences and hints, tl('Label') for short
// labels keyed by their English text — data-driven labels (bucket names,
// instrument names) translate at render and fall back to themselves, so a
// missing entry shows English instead of breaking.
// Financial abbreviations (P/E, RSI, VWAP, EPS) stay English in both locales,
// as they do in Chinese finance media.

const KEY = 'locale_v1'
export const LOCALES = ['en', 'zh']

let locale = 'en'
try {
  const saved = localStorage.getItem(KEY)
  if (LOCALES.includes(saved)) locale = saved
} catch { /* no storage — stay en */ }

const listeners = new Set()

export function getLocale() {
  return locale
}

export function setLocale(l) {
  if (!LOCALES.includes(l)) return
  locale = l
  try {
    localStorage.setItem(KEY, l)
  } catch { /* best-effort */ }
  for (const fn of listeners) fn(l)
}

export function onLocaleChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Sentences and parameterized chrome. {name} placeholders interpolate.
const STRINGS = {
  'palette.placeholder': {
    en: 'symbol or section… (esc to close)',
    zh: '输入代码或版块…（esc 关闭）',
  },
  'palette.no_match': {
    en: 'no matches — Enter opens {q} in research',
    zh: '无匹配 — 回车直接打开 {q} 的研究页',
  },
  'alerts.subtitle': {
    en: 'checked against the live feed · triggered alerts stay put until re-armed',
    zh: '基于实时行情检查 · 触发后的提醒保留至重置',
  },
  'alerts.none': { en: 'no alerts configured', zh: '尚未配置提醒' },
  'alerts.hint.price': { en: 'trigger level in $', zh: '触发价（美元）' },
  'alerts.hint.rsi': { en: 'RSI(14) level, 0-100', zh: 'RSI(14) 水平，0-100' },
  'alerts.hint.sma': { en: 'SMA window, e.g. 50 or 200', zh: 'SMA 窗口，如 50 或 200' },
  'alerts.hint.volume': { en: 'multiple of 20-day avg volume', zh: '相对20日均量的倍数' },
  'earn.note': {
    en: "reaction = close-to-close around the report date · dashes = Yahoo's calendar lacks the date",
    zh: '反应 = 财报日前后收盘价变动 · 破折号 = Yahoo 日历缺少该日期',
  },
  'research.no_earnings': {
    en: 'no earnings history for {sym} (ETFs/indices/crypto have none)',
    zh: '{sym} 无财报历史（ETF/指数/加密货币没有财报）',
  },
  'research.no_insider': {
    en: 'no insider data for {sym} (ETFs/indices/crypto have none)',
    zh: '{sym} 无内部交易数据（ETF/指数/加密货币没有）',
  },
  'screen.placeholder': {
    en: 'Symbols, space or comma separated (max 8)',
    zh: '股票代码，空格或逗号分隔（最多8个）',
  },
  'common.loading': { en: 'loading…', zh: '加载中…' },
  'demo.banner': {
    en: 'DEMO — NOT REAL POSITIONS · synthetic book on live prices',
    zh: 'DEMO — 非真实持仓 · 模拟组合 + 实时价格',
  },
  'demo.formulas': {
    en: 'flat 25% maintenance — demo simplification',
    zh: '统一25%维持保证金 — 演示简化',
  },
  'demo.carry_note': {
    en: 'hypothetical margin loan at {rate}% APR on the demo book',
    zh: '演示组合按 {rate}% 年利率的假设融资成本',
  },
  'demo.stress_note': {
    en: 'beta-weighted shock on static demo betas — indicative only',
    zh: '基于静态演示Beta的冲击测算 — 仅供参考',
  },
  'chat.empty': {
    en: 'Ask about a ticker, a sector, or how this app works. Proxied server-side — no API key in your browser, $10/day shared cap.',
    zh: '问我任意股票、板块，或这个应用怎么用。服务端代理 — 浏览器无需 API key，全站共享每日 $10 上限。',
  },
  'chat.placeholder': { en: 'ask anything…', zh: '随便问…' },
  'chat.cap_note': {
    en: 'shared daily spend across all visitors, worst-case charged',
    zh: '全站访客共享的每日用量，按最坏情况计费',
  },
  'demo.timeline_note': {
    en: '252-day seeded random walk ending at the current demo NLV — not a real account history',
    zh: '252天随机模拟曲线，终点为当前演示净值 — 非真实账户历史',
  },
}

// Short labels keyed by English text. Absent key → English passthrough.
const LABELS = {
  // Nav
  Dashboard: '仪表盘', Markets: '市场', Research: '研究', Portfolio: '持仓',
  Screening: '筛选', Alerts: '提醒', 'AI Chat': 'AI 对话', Overview: '概览',
  Sectors: '板块', Heatmap: '热力图', Commodities: '商品', Earnings: '财报',
  Calendar: '财经日历', Compare: '对比', Correlation: '相关性', Valuation: '估值',
  // Research tabs + panels
  Intraday: '日内', Options: '期权', Insider: '内部交易',
  Technicals: '技术指标', Fundamentals: '基本面', News: '新闻',
  Calls: '看涨', Puts: '看跌',
  // Status bar
  OPEN: '盘中', CLOSED: '休市', PRE: '盘前', POST: '盘后', HOLIDAY: '休市日',
  Watchlist: '自选股', Breadth: '广度',
  // Table headers
  Quarter: '季度', Reported: '发布日', 'EPS est': '预期EPS', 'EPS act': '实际EPS',
  Surprise: '超预期', Reaction: '反应', Peers: '同组',
  'Beat rate': '超预期率', 'Beat streak': '连续超预期', 'Avg surprise': '平均超预期',
  'Avg reaction': '平均反应',
  Date: '日期', Role: '职位', Transaction: '交易', Shares: '股数', Value: '金额',
  Condition: '条件', Last: '现价', Status: '状态', Created: '创建', Actions: '操作',
  Symbol: '代码', Type: '类型', Op: '条件', Price: '价格',
  ARMED: '待触发', TRIGGERED: '已触发', 're-arm': '重置', delete: '删除',
  '+ Add alert': '+ 添加提醒', 'Alert triggered': '提醒触发',
  'SMA cross': 'SMA交叉', Volume: '成交量',
  // Buckets
  'Mega Tech': '大型科技', 'Semis & AI': '半导体与AI', 'Software & Media': '软件与媒体',
  'Old Economy': '传统经济', 'ETFs & Macro': 'ETF与宏观',
  // Market groups
  'US Equity': '美国股指', 'US Futures': '美股期货', Europe: '欧洲',
  'Asia-Pacific': '亚太', 'Rates & Vol': '利率与波动', FX: '外汇', Crypto: '加密货币',
  Metals: '金属', Energy: '能源', Grains: '谷物', Softs: '软商品',
  // Indices
  'S&P 500': '标普500', 'Dow Jones': '道琼斯', 'Nasdaq Comp': '纳斯达克综合',
  'Nasdaq 100': '纳指100', 'Russell 2000': '罗素2000', 'Semis (SOX)': '费城半导体',
  'S&P 500 Fut': '标普期货', 'Nasdaq Fut': '纳指期货', 'Dow Fut': '道指期货',
  'Russell Fut': '罗素期货', VIX: '恐慌指数', DXY: '美元指数',
  '10Y Yield': '10年期收益率', '5Y Yield': '5年期收益率', '30Y Yield': '30年期收益率',
  'Hang Seng': '恒生指数', 'Nikkei 225': '日经225', 'Shanghai Comp': '上证综指',
  'ASX 200': '澳洲ASX200', 'FTSE 100': '富时100', DAX: '德国DAX', 'CAC 40': '法国CAC40',
  'Euro Stoxx 50': '欧洲斯托克50',
  NASDAQ: '纳指', DOW: '道指', RUT: '罗素', SOX: '费半', US10Y: '美债10Y', GOLD: '黄金',
  // Commodities
  Gold: '黄金', Silver: '白银', Copper: '铜', Platinum: '铂金', Palladium: '钯金',
  'WTI Crude Oil': 'WTI原油', 'Brent Crude': '布伦特原油', 'Natural Gas': '天然气',
  'Heating Oil': '取暖油', 'RBOB Gasoline': 'RBOB汽油',
  Corn: '玉米', Wheat: '小麦', Soybeans: '大豆', Coffee: '咖啡',
  'Sugar #11': '糖11号', Cocoa: '可可', Cotton: '棉花',
  Bitcoin: '比特币', Ethereum: '以太坊',
  // Sectors
  Technology: '科技', Financials: '金融', Healthcare: '医疗保健',
  Industrials: '工业', Materials: '原材料', Utilities: '公用事业',
  'Real Estate': '房地产', 'Cons. Staples': '必需消费', 'Cons. Discretionary': '可选消费',
  'Comm. Services': '通信服务', Semiconductors: '半导体',
  // Econ events
  'FOMC Rate Decision': '美联储议息', 'CPI Release': 'CPI公布',
  'Nonfarm Payrolls': '非农就业', 'GDP (Advance)': 'GDP初值', 'Core PCE': '核心PCE',
  // Section headers + inline bits
  'Sector ETFs — today': '板块ETF — 今日',
  'Upcoming earnings — watchlist': '自选股 — 即将发布财报',
  'Economic calendar — next 90 days': '财经日历 — 未来90天',
  'loading earnings dates…': '加载财报日期…',
  today: '今日', advancing: '上涨', avg: '均', est: '预期',
  updated: '更新于', 'STALE — last good fetch': '数据过期 — 上次成功获取', ago: '前',
  General: '其他',
  Briefing: '晨报', Data: '数据', copy: '复制', generate: '生成', regenerate: '重新生成',
  'AI synthesis': 'AI 综述', 'AI memo': 'AI 备忘录', 'AI report': 'AI 报告',
  'Technicals — daily': '技术指标 — 日线', Name: '姓名', 'no headlines': '暂无新闻',
  Sym: '代码', 'Day %': '日%', Custom: '自定义', 'Health & Staples': '医疗与消费',
  '10Y Note Fut': '10年期国债期货', '30Y Bond Fut': '30年期国债期货',
  Solana: 'Solana', Dogecoin: '狗狗币', Movers: '异动榜', Analysts: '分析师',
  Gainers: '涨幅榜', Losers: '跌幅榜', 'Most active': '成交活跃',
  'Price targets': '目标价', 'Rec trend': '评级分布', 'Recent rating changes': '近期评级变动',
  'Strong buy': '强烈买入', Hold: '持有', 'Strong sell': '强烈卖出',
  Firm: '机构', Action: '动作', From: '原评级', To: '新评级',
  Low: '最低', Mean: '平均', High: '最高', Current: '现价',
  // Portfolio (demo)
  Account: '账户', Sizing: '仓位计算', Carry: '融资成本', Cockpit: '风险面板',
  Timeline: '净值曲线', 'Avg cost': '成本价', Weight: '权重', 'Day P&L': '日盈亏',
  'Unreal P&L': '浮动盈亏', Total: '合计', Cash: '现金', 'Gross exposure': '总敞口',
  Leverage: '杠杆', Maintenance: '维持保证金', 'Excess liquidity': '超额流动性',
  Cushion: '缓冲', 'Target weight': '目标权重', 'Target value': '目标市值',
  'Target shares': '目标股数', 'Held (demo)': '当前持有（演示）', Buy: '买入',
  Sell: '卖出', shares: '股', 'Target leverage': '目标杠杆', 'Margin loan': '融资额',
  'Per year': '每年', 'Per month': '每月', 'Per day': '每日', 'Stress test': '压力测试',
  'Market move': '市场变动', 'Book P&L': '组合盈亏', 'Top position': '最大持仓',
  'Concentration (HHI)': '集中度 (HHI)', 'Demo betas': '演示Beta',
  Send: '发送', clear: '清空',
  Pulse: '市场脉搏', Hi: '高', Lo: '低', Spd: '价差', down: '跌',
  Median: '中位', Green: '上涨',
}

export function t(key, params) {
  const entry = STRINGS[key]
  let s = entry ? (entry[locale] ?? entry.en) : key
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}

export function tl(label) {
  if (locale === 'en') return label
  return LABELS[label] ?? label
}
