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
  'research.no_options_chain': { en: 'no options chain — {error}', zh: '无期权链数据 — {error}' },
  'research.options_note': {
    en: 'spot {spot} · amber rule = spot · shaded = ITM · Δ via Black-Scholes from IV · vol = vol>OI',
    zh: '现价 {spot} · 琥珀线 = 现价 · 阴影 = 价内 · Δ 由隐波经 Black-Scholes 计算 · 成交量高亮 = 成交量>未平仓量',
  },
  'research.no_wire_config': {
    en: 'no wire backend configured — this tab shows everything fragwire captured on {symbol}. set the endpoint on the Wire tab first.',
    zh: '尚未配置快讯后端 — 此页会显示 Fragwire 收录的所有 {symbol} 动态。请先在“快讯”页设置地址。',
  },
  'research.wire_unreachable': { en: 'wire unreachable: {error}', zh: '无法连接快讯：{error}' },
  'research.nothing_on_wire': { en: 'nothing on the wire for {symbol} yet', zh: '快讯中暂时没有 {symbol} 的动态' },
  'research.landing_hint': {
    en: 'type a symbol — or hit a number once a name is open. every function below works on any listed security.',
    zh: '输入代码；打开标的后也可直接按数字切换功能。下方功能适用于所有上市证券。',
  },
  'research.terminal_hint': {
    en: 'MU open research · ta MU chart · an MU analysts · vs MU NVDA compare · w MU watch — full list: h',
    zh: 'MU 打开研究 · ta MU 图表 · an MU 分析师 · vs MU NVDA 对比 · w MU 加入自选 — 完整命令：h',
  },
  'screen.placeholder': {
    en: 'Symbols, space or comma separated (max 8)',
    zh: '股票代码，空格或逗号分隔（最多8个）',
  },
  'common.loading': { en: 'loading…', zh: '加载中…' },
  'common.days': { en: '{days}d', zh: '{days}天' },
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
  'chat.placeholder': { en: 'ask a question…', zh: '问个问题…' },
  'chat.follow_up': { en: 'Follow up…', zh: '继续补充…' },
  'chat.wire_empty': { en: 'Ask about a ticker, a sector, or the book.', zh: '可以问股票、板块或持仓。' },
  'chat.session_messages': { en: '{n} messages', zh: '{n} 条消息' },
  'chat.exchange_saved': { en: '✓ exchange saved to journal #{id}', zh: '✓ 本轮对话已保存至交易日志 #{id}' },
  'chat.earnings_due': { en: 'ern {when}', zh: '财报 {when}' },
  'chat.action_earnings_summary': { en: "summarize {symbol}'s earnings report", zh: '总结 {symbol} 的财报' },
  'chat.action_earnings_preview': { en: "what should I watch in {symbol}'s earnings ({days}d out)?", zh: '{symbol} 将在 {days} 天后发布财报，我该关注什么？' },
  'chat.action_mover': { en: "what's driving {symbol} {direction} {pct}% today?", zh: '{symbol} 今日{direction} {pct}%，原因是什么？' },
  'chat.action_event': { en: 'what does {event} ({when}) mean for {target}?', zh: '{event}（{when}）对{target}意味着什么？' },
  'chat.action_book_position': { en: 'how is my book positioned this week?', zh: '本周我的持仓结构如何？' },
  'chat.action_book_risk': { en: "what's the biggest risk to the book right now?", zh: '当前持仓最大的风险是什么？' },
  'chat.action_alert': { en: 'arm an alert on {symbol} at {level}', zh: '在 {symbol} 到达 {level} 时设置提醒' },
  'chat.action_strongest': { en: 'which watchlist name looks strongest technically?', zh: '自选股里哪个标的技术面最强？' },
  'chat.action_journal': { en: 'what did my journal say about {symbol}?', zh: '我的交易日志里对 {symbol} 怎么说？' },
  'chat.action_heatmap': { en: 'open the heatmap', zh: '打开热力图' },
  'chat.action_moving': { en: "what's moving today?", zh: '今天哪些标的在异动？' },
  'chat.action_technical': { en: 'how does NVDA look technically?', zh: 'NVDA 的技术面如何？' },
  'chat.action_calendar': { en: "what's on the calendar this week?", zh: '本周有哪些重要日程？' },
  'chat.action_research': { en: 'open TSLA research', zh: '打开 TSLA 研究页' },
  'wire.sync_ok': { en: 'synced {count} symbols → wire', zh: '已同步 {count} 只股票 → 快讯' },
  'wire.sync_failed': { en: 'sync failed', zh: '同步失败' },
  'wire.byo_note': {
    en: 'BYO wire: this page ships no endpoint and no data — point it at any fragwire-compatible service and everything renders in your browser only. Blank endpoint runs a synthetic demo feed.',
    zh: '自带快讯源：此页不内置地址或数据。连接任意兼容 Fragwire 的服务后，内容只会在浏览器中渲染；地址留空则使用模拟数据。',
  },
  'wire.story_outlets': { en: '{count} outlets on this story', zh: '{count} 家媒体报道此事件' },
  'wire.digest_number': { en: 'digest #{number}', zh: '摘要 #{number}' },
  'wire.tape_latency': { en: 'tape latency {latency}', zh: '快讯延迟 {latency}' },
  'chat.cap_note': {
    en: 'shared daily spend across all visitors, worst-case charged',
    zh: '全站访客共享的每日用量，按最坏情况计费',
  },
  'chat.context_line': {
    en: 'live quotes · technicals · calendar · watchlist · alerts · memory · journal · navigation',
    zh: '实时行情 · 技术指标 · 日历 · 自选股 · 提醒 · 记忆 · 日志 · 导航',
  },
  'watchlists.empty': {
    en: 'No tickers yet. Open this list to build it.',
    zh: '暂无股票。打开这组自选股即可添加。',
  },
  'watchlists.subtitle': {
    en: 'Separate market lenses with the same live dashboard machinery.',
    zh: '用同一套实时看盘，分开追踪不同主题。',
  },
  'watchlists.empty_title': {
    en: 'One dashboard is plenty—until it isn’t.',
    zh: '一组自选股够用——直到它不够用。',
  },
  'watchlists.empty_body': {
    en: 'Create a focused list for earnings, setups, sectors, or whatever fresh market disease has entered the building.',
    zh: '按财报、交易机会或板块建立独立自选股，随时切换。',
  },
  'watchlists.unique_name': {
    en: 'Use a unique watchlist name.',
    zh: '请输入一个未使用的自选股名称。',
  },
  'watchlists.delete_confirm': {
    en: 'Delete watchlist “{name}”?',
    zh: '删除自选股“{name}”？',
  },
  'demo.timeline_note': {
    en: '252-day seeded random walk ending at the current demo NLV — not a real account history',
    zh: '252天随机模拟曲线，终点为当前演示净值 — 非真实账户历史',
  },
  'backtest.replay_start': {
    en: 'replay starts {date}',
    zh: '回测起点 {date}',
  },
  'portfolio.live': { en: 'LIVE', zh: '实时账户' },
  'portfolio.connecting': { en: 'CONNECTING TO IBKR…', zh: '正在连接 IBKR…' },
  'portfolio.link_down': { en: 'IBKR LINK DOWN — nothing to show, retrying', zh: 'IBKR 连接中断 — 正在重试' },
  'portfolio.gateway_loading': { en: 'asking the gateway…', zh: '正在查询网关…' },
  'portfolio.gateway_empty': { en: 'nothing to show', zh: '暂无数据' },
  'portfolio.account_switcher': { en: 'Portfolio account', zh: '投资账户' },
  'portfolio.live_book': { en: 'Live broker book', zh: '实时券商持仓' },
  'portfolio.margin_preview': { en: 'margin impact from the gateway — nothing is placed', zh: '由网关估算保证金影响 — 不会提交订单' },
  'portfolio.watcher_loading': { en: 'reading the watcher…', zh: '正在读取监控器…' },
  'portfolio.watcher_unavailable': { en: 'breaker watcher unavailable on this box', zh: '此设备无法使用逻辑破坏条件监控' },
  'portfolio.time_note': { en: 'off the backtest fills ledger — as-of positions, then vs now', zh: '基于回测成交记录 — 对比当时持仓与当前价格' },
  'portfolio.pricing_past': { en: 'pricing the past…', zh: '正在计算历史价格…' },
  'portfolio.no_historical_positions': { en: 'no open positions in the ledger on that date', zh: '成交记录在该日没有未平仓头寸' },
  'portfolio.pick_one_account': { en: 'Select one account for account-scoped broker tools.', zh: '请选择一个账户使用单账户券商工具。' },
}

// Short labels keyed by English text. Absent key → English passthrough.
const LABELS = {
  // Nav
  Dashboard: '仪表盘', Watchlists: '自选股', Markets: '市场', Research: '研究', Portfolio: '持仓',
  Screening: '筛选', Alerts: '提醒', Wire: '快讯', 'AI Chat': 'AI 对话', Overview: '概览',
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
  'Megacaps': '大型科技', 'Semis & AI': '半导体与AI', 'Software & Media': '软件与媒体',
  'Old Economy': '传统经济', 'ETFs & Macro': 'ETF与宏观',
  'Semis': '半导体', 'Software & AI': '软件与AI', 'Consumer & Media': '消费与媒体',
  'Health': '医疗', 'Staples': '必需消费', 'Energy & Industrials': '能源与工业',
  // Market groups
  'US Equity': '美国股指', 'US Futures': '美股期货', 'Global ETFs': '全球ETF', Canada: '加拿大', Europe: '欧洲',
  'Asia-Pacific': '亚太', Rates: '利率', Credit: '信用债', Volatility: '波动率', FX: '外汇', Crypto: '加密货币',
  Metals: '金属', Energy: '能源', Grains: '谷物', Softs: '软商品', Livestock: '畜产品',
  // Indices
  'S&P 500': '标普500', 'Dow Jones': '道琼斯', 'Nasdaq Comp': '纳斯达克综合',
  'Nasdaq 100': '纳指100', 'Russell 2000': '罗素2000', 'Semis (SOX)': '费城半导体',
  'S&P 500 Future': '标普期货', 'Nasdaq Future': '纳指期货', 'Dow Future': '道指期货',
  'Russell Future': '罗素期货', VIX: '恐慌指数', DXY: '美元指数',
  '10Y Yield': '10年期收益率', '5Y Yield': '5年期收益率', '30Y Yield': '30年期收益率',
  'Hang Seng': '恒生指数', 'Nikkei 225': '日经225', 'Shanghai Comp': '上证综指',
  'ASX 200': '澳洲ASX200', 'FTSE 100': '富时100', DAX: '德国DAX', 'CAC 40': '法国CAC40',
  'Euro Stoxx 50': '欧洲斯托克50',
  'S&P MidCap 400': '标普中盘400', 'S&P 100': '标普100',
  'S&P 500 Equal Weight': '标普500等权', 'S&P/TSX Composite': '标普/多伦多综合',
  'TSX 60 ETF': '多伦多60 ETF', 'Taiwan Weighted': '台湾加权', 'Straits Times': '海峡时报',
  'BSE Sensex': '印度Sensex', 'Jakarta Composite': '雅加达综合', 'NZX 50': '新西兰NZX50',
  'Global equities': '全球股票', 'Developed ex-US': '发达市场（除美国）', 'Emerging markets': '新兴市场',
  'Europe ETF': '欧洲ETF', 'Japan ETF': '日本ETF', 'China ETF': '中国ETF',
  'S&P 500 Equal Weight ETF': '标普500等权ETF', 'S&P 500 ETF': '标普500 ETF',
  'IBEX 35': '西班牙IBEX35', 'FTSE MIB': '意大利富时MIB', AEX: '荷兰AEX', 'Swiss Market': '瑞士股市',
  KOSPI: '韩国KOSPI',
  'US high yield': '美国高收益债', 'US investment grade': '美国投资级债',
  'Emerging sovereign debt': '新兴市场主权债', 'US aggregate bonds': '美国综合债',
  'Long Treasuries': '长期美债', 'Short Treasuries': '短期美债', 'Inflation-linked bonds': '通胀保值债券',
  '3M Bill': '3个月美债', '10Y − 3M': '10年 − 3个月', '30Y − 5Y': '30年 − 5年',
  'VIX 9D': '9日VIX', VVIX: 'VVIX', 'Nasdaq VXN': '纳指VXN', 'MOVE (bonds)': 'MOVE（债券）',
  SKEW: 'SKEW', 'Oil OVX': '原油OVX', 'Gold GVZ': '黄金GVZ',
  'EUR/USD': '欧元/美元', 'GBP/USD': '英镑/美元', 'USD/JPY': '美元/日元', 'USD/CNH': '美元/离岸人民币',
  'USD/CAD': '美元/加元', 'AUD/USD': '澳元/美元', 'USD/CHF': '美元/瑞郎', 'USD/KRW': '美元/韩元',
  'USD/INR': '美元/卢比', 'USD/MXN': '美元/墨西哥比索', 'NZD/USD': '新西兰元/美元',
  NASDAQ: '纳指', DOW: '道指', RUT: '罗素', SOX: '费半', US10Y: '美债10Y', GOLD: '黄金',
  // Commodities
  Gold: '黄金', Silver: '白银', Copper: '铜', Platinum: '铂金', Palladium: '钯金',
  'WTI Crude Oil': 'WTI原油', 'Brent Crude': '布伦特原油', 'Natural Gas': '天然气',
  'Heating Oil': '取暖油', 'RBOB Gasoline': 'RBOB汽油',
  Corn: '玉米', Wheat: '小麦', Soybeans: '大豆', Coffee: '咖啡',
  'Sugar #11': '糖11号', Cocoa: '可可', Cotton: '棉花',
  Oats: '燕麦', 'Rough Rice': '稻米', 'Soybean Meal': '豆粕', 'Soybean Oil': '豆油',
  'Orange Juice': '橙汁', Lumber: '木材', 'Live Cattle': '活牛', 'Feeder Cattle': '育肥牛', 'Lean Hogs': '瘦肉猪',
  Bitcoin: '比特币', Ethereum: '以太坊', XRP: 'XRP', BNB: 'BNB', Cardano: 'Cardano', Avalanche: 'Avalanche',
  Chainlink: 'Chainlink', Polkadot: 'Polkadot', Litecoin: '莱特币', 'Bitcoin Cash': '比特币现金', Sui: 'Sui',
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
  All: '全部', Sort: '排序', Ticker: '代码', Spread: '价差', Search: '搜索',
  'Main dashboard': '主仪表盘', 'Market workspace': '市场工作区',
  'Global markets': '全球市场', 'Open markets': '打开市场', 'Market groups': '市场分组',
  'Jump to': '快速跳转', 'Relative signals': '相对强弱', 'leadership and risk appetite': '领涨结构与风险偏好',
  'Equal weight / S&P': '等权 / 标普', 'Semis / Nasdaq': '半导体 / 纳指',
  'High yield / IG': '高收益债 / 投资级债', 'Gold / Silver': '金 / 银', 'Bitcoin / Gold': '比特币 / 黄金',
  'Scroll sectors right': '向右滚动板块',
  'Create watchlist': '新建自选股', 'Watchlist name': '自选股名称',
  PRIMARY: '默认', Rename: '重命名', Delete: '删除', Save: '保存',
  'Open dashboard →': '打开看盘 →', ticker: '只股票', tickers: '只股票',
  'average move': '平均涨跌', declining: '下跌',
  'moving now': '正在异动', 'next earnings': '下一批财报', 'on the calendar': '日历事件',
  'the book': '持仓', 'context it carries': '携带的上下文', memories: '记忆', journal: '日志',
  watching: '关注中', book: '持仓', live: '实时', demo: '演示', 'start here': '从这里开始',
  markets: '市场', app: '应用', 'resume thread': '继续对话', model: '模型',
  'thinking effort': '思考强度', 'saved chat sessions': '已保存的对话',
  'chat sessions': '对话记录', 'trade journal': '交易日志', send: '发送', newline: '换行',
  'stop generating': '停止生成',
  'reading the wire…': '正在读取快讯…',
  'Chat sessions': '对话记录', Memories: '记忆', 'Trade journal': '交易日志',
  'Saved automatically. Open any session without replacing this one.': '自动保存。打开任意对话都不会覆盖当前对话。',
  'no saved sessions yet': '暂无已保存对话', 'no saved threads': '暂无已保存对话',
  'Details the assistant should remember in future chats.': '需要 AI 在今后对话中记住的内容。',
  'nothing saved yet': '暂未保存任何内容', 'add a memory': '添加记忆',
  'Your decisions, rationale, and notes—not AI settings.': '你的决策、理由和笔记，不是 AI 设置。',
  'log a decision, a read, a why': '记录决策、观点或理由',
  'queued follow-up': '待发送追问', 'in view': '当前视图', sessions: '对话', library: '资料库',
  'loading…': '加载中…', 'chart unavailable': '图表不可用', 'no chart': '暂无图表',
  'empty watchlist — add the first ticker below': '自选股为空 — 在下方添加第一只股票',
  'shared across Briefing, Wire, AI, and the tape': '在晨报、快讯、AI 和滚动行情中共享',
  'independent dashboard view': '独立看盘',
  Briefing: '晨报', Data: '数据', copy: '复制', generate: '生成', regenerate: '重新生成',
  'AI synthesis': 'AI 综述', 'AI memo': 'AI 备忘录', 'AI report': 'AI 报告',
  'add symbol': '添加代码', add: '添加', 'already on the list': '已在自选股中',
  reorder: '排序', 'reorder the list': '调整顺序', done: '完成',
  'select rows': '多选', selected: '已选', 'select all': '全选',
  top: '置顶', remove: '移除', Manual: '手动',
  'Main board': '主看板', 'board menu': '看板菜单',
  'drag rows or use the arrows': '拖动行或使用箭头调整顺序',
  'move up': '上移', 'move down': '下移',
  'not a symbol': '代码无效',
  widget: '组件', cancel: '取消', pulse: '广度', earnings: '财报', calendar: '日历',
  movers: '异动', chart: '图表', Movers: '异动',
  'Technicals — daily': '技术指标 — 日线', Name: '姓名', 'no headlines': '暂无新闻',
  Sym: '代码', 'Day %': '日%', Custom: '自定义', 'Health & Staples': '医疗与消费',
  '10Y Note Future': '10年期国债期货', '30Y Bond Future': '30年期国债期货',
  Solana: 'Solana', Dogecoin: '狗狗币', Movers: '异动榜', Analysts: '分析师',
  Gainers: '涨幅榜', Losers: '跌幅榜', 'Most active': '成交活跃',
  'Price targets': '目标价', 'Rec trend': '评级分布', 'Recent rating changes': '近期评级变动',
  'Strong buy': '强烈买入', Hold: '持有', 'Strong sell': '强烈卖出',
  Firm: '机构', Action: '动作', From: '原评级', To: '新评级',
  Low: '最低', Mean: '平均', High: '最高', Current: '现价',
  // Portfolio (demo)
  Account: '账户', Sizing: '仓位计算', Carry: '融资成本', Cockpit: '风险面板',
  'What-if': '情景模拟', Trades: '交易', 'Time travel': '历史回看', Thesis: '投资逻辑',
  Timeline: '净值曲线', Backtest: '回测', Positions: '持仓',
  'Avg cost': '成本价', Weight: '权重', 'Day P&L': '日盈亏',
  'Unreal P&L': '浮动盈亏', Total: '合计', Cash: '现金', 'Gross exposure': '总敞口',
  Leverage: '杠杆', Maintenance: '维持保证金', 'Excess liquidity': '超额流动性',
  Cushion: '缓冲', 'Target weight': '目标权重', 'Target value': '目标市值',
  Equity: '净资产', 'Above maintenance': '高于维持保证金', Concentration: '集中度', Margin: '保证金',
  Both: '合并', 'Book pulse': '持仓脉搏', 'Top contributor': '最大正贡献',
  'Top detractor': '最大负贡献', 'Largest line': '最大持仓',
  'Thesis breakers': '逻辑破坏条件', 'New candidates': '新候选', 'Rotation estimate': '轮动预期',
  Qty: '数量', 'Value then': '当时市值', 'Price now': '当前价格', 'Since then': '至今涨跌',
  'Target shares': '目标股数', 'Held (demo)': '当前持有（演示）', Buy: '买入',
  Sell: '卖出', shares: '股', 'Target leverage': '目标杠杆', 'Margin loan': '融资额',
  'Per year': '每年', 'Per month': '每月', 'Per day': '每日', 'Stress test': '压力测试',
  'Market move': '市场变动', 'Book P&L': '组合盈亏', 'Top position': '最大持仓',
  'Concentration (HHI)': '集中度 (HHI)', 'Demo betas': '演示Beta',
  Send: '发送', clear: '清空', export: '导出',
  Pulse: '市场脉搏', Hi: '高', Lo: '低', Spd: '价差', down: '跌',
  Median: '中位', Green: '上涨',
  // Backtest
  Backtest: '回测', 'Fills ledger': '成交记录', Save: '保存', 'Reset to demo': '重置为演示',
  'DEMO LEDGER': '演示记录', Benchmark: '基准', 'Report currency': '报告货币',
  'Book return': '组合收益', 'Benchmark return': '基准收益', Alpha: '超额收益',
  'Max drawdown': '最大回撤',
  'No fills yet — add rows to the ledger above.': '暂无成交记录 — 请在上方添加记录',
  'CSV format': 'CSV 格式',
  // Remaining chrome discovered by the full Chinese route sweep.
  '% held': '持仓比例', '52wk pos': '52周位置', Ahead: '前瞻', Archive: '归档', Avg: '平均',
  'Beta / D-E': 'Beta / 负债权益比', Business: '业务', Description: '简介', Website: '网站', Phone: '电话', 'Mkt cap': '市值', unreal: '浮盈',
  'on the board': '已在自选', 'add to watchlist': '加入自选', 'Scroll sectors left': '向左滚动',
  Financials: '财务', Ownership: '持仓结构', Quarterly: '季度', Annual: '年度',
  'Corporate actions': '公司行动', 'Relative value': '相对估值',
  'Gross margin': '毛利率', 'Rev growth': '营收增速', 'off high': '距高点',
  dividend: '分红', split: '拆股', 'more in the last 5y': '更多(近5年)',
  Revenue: '营收', 'Net income': '净利润', 'Net margin': '净利率',
  'EPS (dil)': '摊薄EPS', 'Free cash flow': '自由现金流', 'no headlines': '暂无新闻', Chart: '图表', Company: '公司', Consensus: '一致预期',
  'Div yld': '股息率', Dividends: '分红', Docket: '日程', Employees: '员工', 'Event priced': '事件定价',
  Filed: '申报日期', Filings: '申报文件', Form: '表格', Holder: '持有人', Holders: '持有人',
  'Implied move': '隐含波动', Industry: '行业', Insiders: '内部人士', Institutions: '机构',
  'Macro tape': '宏观行情', 'Mkt cap / EV': '市值 / EV', 'New PT': '新目标价', 'Next ern': '下次财报',
  Officers: '管理层', 'On the wire': '快讯动态', 'Open / prev': '开盘 / 昨收', Ownership: '持股结构',
  'Past PT': '原目标价', Profile: '公司资料', 'Px / Chg': '价格 / 涨跌', 'Reaction history': '历史反应',
  Reports: '公布', 'Rotation — trailing': '轮动 — 滚动', 'SEC filings': 'SEC申报', STALE: '数据过期',
  Sector: '板块', 'Short % flt': '空头 / 流通股', 'Shrs out / float': '总股本 / 流通股',
  'Technical flags': '技术信号', 'Tgt / upside': '目标价 / 上行空间', Title: '职务',
  'Top institutional holders': '主要机构持有人', 'Typical move': '典型波动', 'Vol / avg': '成交量 / 均量',
  'add your own': '添加自定义事件', all: '全部', 'atm straddle': '平值跨式', holders: '持有人',
  'implied vs realized': '隐含 vs 实现', 'no dated prints yet': '暂无已确认日期',
  'nothing on the docket': '日程为空', prints: '次财报', vs: '对比',
  edit: '编辑', close: '关闭', 'flat tape': '盘面平静', 'nothing stretched': '暂无极端信号',
  'clear runway': '近期无重大事件', 'pulling the story…': '正在抓取正文…',
  "source wouldn't give up its text —": '源站未提供正文 —',
  'open the page ↗': '打开页面 ↗',
  'full text at the source ↗': '完整正文见源站 ↗',
  'tape latency': '延迟',
  'latest audio': '最新音频', 'open ↗': '打开 ↗', tape: '行情', buffered: '已缓存',
  'last hour': '过去一小时', symbols: '代码数', 'most mentioned': '提及最多',
  'nothing on the sheet': '今日暂无事件', 'coming up': '即将发生',
  'nothing on the horizon': '近期暂无事件', 'captured today': '今日收录', 'loudest sources': '最活跃来源',
  'open the wire board': '打开快讯看板', 'sync watchlist to wire': '将本站自选股同步到快讯自选股',
  'wire URL (blank = demo)': '快讯地址（留空使用演示）', 'no events': '暂无快讯',
  'no data': '暂无数据', sym: '代码', px: '价格', chg: '涨跌', vol: '成交量', ext: '盘外', day: '日内',
  cross: '交叉', GOLDEN: '金叉', DEATH: '死叉', qty: '数量',
  'park thread': '收起对话（内容仍会保留）', 'fixed thinking tier': '该订阅模型使用固定思考强度',
  'persistent memories': '长期记忆 — AI 会在每次对话中读取', 'trade journal hint': '交易日志 — 可搜索的决策与理由',
  'download transcript': '下载 Markdown 对话记录', 'delete session': '删除对话', 'new session': '新建对话',
  'save exchange to journal': '将本轮对话保存到交易日志', 'advancing / total': '上涨 / 总数',
  'remove catalyst': '删除事件', 'move up': '上移', 'move down': '下移',
  'cycle timezone': '切换时区（美东 → 香港 → 太平洋）', console: '控制台',
  'drag to resize': '拖动调整高度', 'type command or symbol…  (h = help)': '输入命令或代码…（h = 帮助）',
  'focus console': '按 / 随时聚焦控制台', 'report model': '生成此报告的订阅模型',
  'reset full history': '重置为全部历史', Strike: '行权价', Bid: '买价', Ask: '卖价', IV: '隐波', Vol: '成交量', OI: '未平仓量',
  'loading chain…': '正在加载期权链…', EXPIRY: '到期日', 'no intraday data': '暂无日内数据',
  Functions: '功能', Recent: '最近访问', 'From the terminal': '终端快捷方式', GO: '打开',
  'full command list': '完整命令列表', 'watch — full list': '加入自选 — 完整列表',
  'alert now': '当前', 'symbol chips': '股票代码', 'A/D': '涨 / 跌', 'ext A/D': '盘外涨 / 跌',
  'down >3%': '跌超3%', up: '上涨', down: '下跌', 'RSI 14': 'RSI 14', 'vs SMA200': '相对SMA200',
  'vs 50d': '相对50日线', 'vs 200d': '相对200日线',
  '+ new session': '+ 新建对话', '+ new': '+ 新建', 'new session': '新建对话', untitled: '未命名',
  'no matches': '无匹配', 'nothing logged yet': '暂无记录', journal: '日志',
  sector: '板块', 'overlay comparison': '叠加另一代码，按左侧起点归一化比较涨跌幅',
  Last: '现价', '5-min bars · session': '5分钟K线 · 当日',
  'chart · DES stat band · technicals · fundamentals · news': '图表 · 数据概览 · 技术面 · 基本面 · 新闻',
  'intraday + VWAP': '日内走势 + VWAP', 'options chain + IV + Greeks': '期权链 + 隐波 + 希腊值',
  'earnings history + reactions': '财报历史 + 市场反应', 'analyst ratings + targets': '分析师评级 + 目标价',
  'institutional + insider ownership': '机构与内部人士持股', 'the SEC trail': 'SEC申报记录',
  'sector, business, officers': '板块、业务与管理层', 'everything fragwire captured on the name': 'Fragwire收录的全部相关动态',
  Yield: '收益率', 'Rate (annual)': '年化股息', 'Payout ratio': '派息率', 'Ex-div date': '除息日',
  HQ: '总部', 'chart: SYM': '图表：代码',
  'full workbench — overlays, RSI/MACD panes, compare mode': '完整图表 — 叠加指标、RSI/MACD窗格与对比模式',
  'chain with greeks': '期权链与希腊值', 'years of prints, surprises, price reactions': '历年财报、超预期幅度与股价反应',
  'rec trend, price targets, rating changes': '评级趋势、目标价与近期调整', 'insider transactions': '内部人士交易',
  top: '精选', wire: '时间线', 'demo wire — synthetic events': '模拟快讯 — 合成事件', connecting: '连接中', error: '错误',
  'push watchlist → wire': '同步自选股 → 快讯', connect: '连接', all: '全部',
  rail: '侧栏', 'rail ⨯': '侧栏 ⨯', 'wire connection': '快讯连接',
  board: '看板', week: '周历', stats: '统计', demo: '演示',
  'hide the side panels': '隐藏侧栏', 'show the side panels': '显示侧栏',
  earnings: '财报', filings: '申报文件', headlines: '新闻', 'macro + fed': '宏观 + 美联储', 'live audio': '实时音频',
  'online — private wire': '在线 — 私有快讯', 'online — public proxy': '在线 — 公共代理',
  'my book': '我的持仓', 'the market': '市场',
  low: '低', medium: '中', high: '高', Run: '运行', '52w range': '52周区间', '1Y %': '1年涨跌',
  rsi14: 'RSI 14', 'vol x20d': '成交量 / 20日均量', 'off high': '距高点', macd: 'MACD',
  breadth: '涨跌家数', '>2% movers': '涨跌超2%', 'avg volume': '均量',
  'T1 — touches the sector': 'T1 — 涉及相关板块', 'T2 — core thesis story': 'T2 — 核心逻辑事件',
  'T3 — thesis story on a name you hold': 'T3 — 涉及持仓标的的核心事件', 'open source': '打开来源',
  curve: '收益率曲线', 'long end': '长端',
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

export function hasLabelTranslation(label) {
  return Object.hasOwn(LABELS, label)
}

export function formatBriefTechnicalNote(note) {
  if (locale !== 'zh') return note
  let match = String(note).match(/^(\d+(?:\.\d+)?)x avg volume$/)
  if (match) return `${match[1]}倍均量`
  match = String(note).match(/^below 200d · RS (-?\d+)pp$/)
  if (match) return `低于200日线 · 相对强弱 ${match[1]}个百分点`
  return note
}
