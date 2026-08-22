// Wire panel data layer — optional viewer-supplied endpoint. This site is public and static; it
// ships NO wire URL and NO symbols. A viewer points the panel at their own
// fragwire-compatible service (see its API.md: GET /api/events, SSE
// /api/stream, additive-only), and events render entirely client-side in
// their browser. Without an endpoint the panel runs on synthetic demo events.

import { IS_PRIVATE_BUILD } from './nav.js'
import { proxyBase } from './feed.js'
import { createPCache } from './pcache.js'

const KEY = 'tape-wire-url'

/** The public wire mirror: a sanitized headline snapshot the owner's exporter
 *  pushes to the Worker every few minutes, served back read-only. It is a
 *  flat archive — no stream, no symbol index, no article extraction, no chat.
 *  Lazy on purpose: proxyBase() reads a per-browser override at call time. */
export function mirrorBase() {
  return `${proxyBase().replace(/\/$/, '')}/wire`
}

export function isMirrorBase(base) {
  return !!base && String(base).replace(/\/$/, '') === mirrorBase()
}

/** Whole minutes since the mirror snapshot was generated, null before the
 *  first push ever lands. Floor, and never negative: a browser clock running
 *  ahead of the exporter must not print a story from the future. */
export function mirrorAgeMinutes(generatedAt, now = Date.now() / 1000) {
  if (!generatedAt) return null
  return Math.max(0, Math.floor((now - generatedAt) / 60))
}

export function wireUrl() {
  // Private tailnet build: ALWAYS derive from the host already serving this
  // page. The build has no connect UI, so a localStorage override can only be
  // a leftover from an older scheme — and a stale one silently killed every
  // wire surface on that device ("fragwire headlines do not appear", Jeff
  // 2026-08-10). Purge it so nothing else trips on it either.
  if (IS_PRIVATE_BUILD && typeof location !== 'undefined'
      && location.hostname.endsWith('.ts.net')) {
    try { localStorage.removeItem(KEY) } catch { /* private mode */ }
    return `https://${location.hostname}:${WIRE_UI_PORT}`
  }
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved
  } catch { /* fall through to the build default */ }
  // Public build with nothing configured reads the mirror, so the demo page
  // shows the real headline flow. The private build has its own Fragwire and
  // must never fall back to a public copy of it.
  if (IS_PRIVATE_BUILD) return ''
  return mirrorBase()
}

/** A wire that can do more than answer headlines — chat, saves, alert
 *  delivery, watchlist push, overnight quotes. The public mirror is none of
 *  those, so surfaces gated on "is a wire connected" ask here instead, and
 *  the public build keeps showing its own local behaviour. */
export function wireServiceUrl() {
  const base = wireUrl()
  return isMirrorBase(base) ? '' : base
}

export function setWireUrl(url) {
  const clean = String(url || '').trim().replace(/\/+$/, '')
  if (clean && !/^https?:\/\//.test(clean)) throw new Error('http(s) URL required')
  try {
    if (clean) localStorage.setItem(KEY, clean)
    else localStorage.removeItem(KEY)
  } catch { /* private mode: panel just stays in demo */ }
  return clean
}

/** Accordion transition for wire rows. A second article replaces the current
 * one; tapping the current article closes it. The input set stays untouched so
 * state updates remain referentially safe. */
export function toggleWireArticle(current, key) {
  return current?.has(key) ? new Set() : new Set([key])
}

// Port fragwire's own UI answers on. Only ever combined with the host the page
// is ALREADY being served from, so no internal hostname lives in this repo.
const WIRE_UI_PORT = 8459

/** Where the wire's own board lives, for a "open the source" link.
 *  Prefers the configured endpoint's origin — that IS the viewer's fragwire,
 *  whoever they are. The private tailnet build falls back to the wire port on
 *  the same tailnet host serving this page; the public build gets nothing,
 *  because a public origin has no business advertising someone's tailnet. */
export function fragwireHome() {
  const ep = wireUrl()
  if (ep) {
    try {
      return new URL(ep).origin
    } catch { /* malformed endpoint — fall through to the host guess */ }
  }
  if (!IS_PRIVATE_BUILD) return ''
  const host = typeof location === 'undefined' ? '' : location.hostname
  return host.endsWith('.ts.net') ? `https://${host}:${WIRE_UI_PORT}` : ''
}

/** Calendar-client subscription URL for the configured Fragwire service. */
export function calendarSubscriptionUrl() {
  const home = fragwireHome()
  if (!home) return ''
  const url = new URL('/calendar.ics', home)
  return url.href.replace(/^https?:/, 'webcal:')
}

// `newest` takes the TAIL of the archive. Without it a since_id=0 backfill
// returns the OLDEST rows in the store — the board opened on ancient events
// and a link to a fresh story landed on nothing (Jeff 2026-08-05).
export async function fetchEvents(base, { sinceId = 0, limit = 100, newest = false } = {}) {
  const resp = await fetch(
    `${base}/api/events?since_id=${sinceId}&limit=${limit}${newest ? '&newest=1' : ''}`)
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  return resp.json()
}

// Symbol-scoped tail for the research overview's wire strip. Persisted so a
// tab flip paints the last ten rows immediately and the fetch only ever
// replaces them (2026-08-10) — the panel is hidden when empty, so a cold miss
// used to make the whole strip pop in late.
const miniCache = createPCache('wire_mini_v1', { max: 40 })

export function peekSymbolWire(symbol) {
  return miniCache.peek(String(symbol).toUpperCase())?.value
}

export async function fetchSymbolWire(base, symbol, limit = 10) {
  const resp = await fetch(
    `${base.replace(/\/$/, '')}/api/events?symbols=${encodeURIComponent(symbol)}&limit=${limit}&newest=1`,
    { signal: AbortSignal.timeout(8_000) })
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  const value = (await resp.json()).events || []
  miniCache.set(String(symbol).toUpperCase(), { value, ts: Date.now() })
  return value
}

/** In-place revisions (primary-release facts arriving after the ERN tripwire). */
export async function fetchUpdates(base, since) {
  const resp = await fetch(`${base}/api/updates?since=${encodeURIComponent(since)}`)
  if (!resp.ok) throw new Error(`wire updates ${resp.status}`)
  return resp.json()
}

// ── demo wire ─────────────────────────────────────────────────────────────
// A written session rather than a template generator. The old version cycled
// six shapes over six tickers, so every sixth row repeated with a new symbol —
// it read as filler and made the page look unfinished.
//
// These are invented but internally consistent: the AAPL beat develops across
// release -> call -> reaction, the CPI print lines up with the Fed speaker
// after it, and two desks print the same M&A story so the clusterer has
// something real to fold. Generic large-caps on purpose — this page is
// public, so it must never echo a real book.
//
// Rows carry `zh` twins because the whole UI has a Chinese locale and a wire
// that only speaks English is half a demo (Jeff 2026-08-21). Long-form rows
// carry a `body`, so expanding one reads like an article instead of "the
// source wouldn't give up its text".
//
// Every row carries `demo: true`; the UI badges off that, so nothing here can
// be mistaken for a live print. No `url` anywhere: a fabricated link to a real
// publication would attribute invented copy to a real newsroom.
const DEMO_FEED = [
  { type: 'earnings_release', symbols: ['AAPL'], mins: 4,
    headline: 'AAPL Q3 EPS $2.31 vs $2.10 est · revenue $99.2B vs $96.4B est',
    zh: 'AAPL 第三季度 EPS 2.31 美元，预期 2.10 美元 · 营收 992 亿美元，预期 964 亿美元',
    body: 'Apple reported third-quarter earnings per share of $2.31 against a $2.10 consensus, on revenue of $99.2B versus $96.4B expected.\n\nServices carried the quarter at a 74.1% gross margin, its widest on record, while hardware revenue landed roughly in line. Greater China returned to growth after three declining quarters.\n\nManagement guided the full year to $412-418B, above the $404B the sell side carried into the print.',
    body_zh: '苹果公布第三季度每股收益 2.31 美元，高于市场预期的 2.10 美元；营收 992 亿美元，预期 964 亿美元。\n\n服务业务毛利率 74.1%，创历史新高，硬件收入基本符合预期。大中华区在连续三个季度下滑后恢复增长。\n\n管理层将全年指引上调至 4120-4180 亿美元，高于卖方此前的 4040 亿美元。' },
  { type: 'headline', symbols: ['AAPL'], mins: 11, source: 'wire',
    headline: 'Apple lifted to Buy at three desks after services beat',
    zh: '服务业务超预期后，三家券商将苹果上调至买入' },
  { type: 'macro_print', symbols: [], mins: 18,
    headline: 'CPI m/m +0.2% vs +0.3% est · core +0.19%, third cool print',
    zh: 'CPI 环比 +0.2%，预期 +0.3% · 核心 +0.19%，连续第三个月降温',
    body: 'Headline CPI rose 0.2% on the month against a 0.3% consensus. Core came in at 0.19%, the third consecutive print below the run-rate the committee has said it needs to see sustained.\n\nShelter decelerated for a fourth month. Core goods were outright negative. Services ex-shelter, the measure the chair has repeatedly pointed to, printed its softest month of the cycle.',
    body_zh: 'CPI 环比上涨 0.2%，低于市场预期的 0.3%。核心 CPI 为 0.19%，连续第三个月低于委员会所要求的持续性水平。\n\n房租分项连续第四个月放缓，核心商品为负值。主席多次强调的“除房租外核心服务”创本轮周期最低月度涨幅。' },
  { type: 'fed_speech', symbols: [], mins: 26,
    headline: 'Fed: "disinflation broadening, but we are not done" — no cut signalled',
    zh: '美联储：“反通胀正在扩散，但尚未结束” — 未释放降息信号' },
  { type: 'filing', symbols: ['MSFT'], mins: 33,
    headline: 'MSFT files 8-K — $60B buyback authorisation, dividend +10%',
    zh: 'MSFT 提交 8-K — 授权 600 亿美元回购，股息上调 10%' },
  { type: 'headline', symbols: ['UBER'], mins: 39, source: 'wire',
    headline: 'Uber said to be in talks for a European grocery delivery asset',
    zh: '据悉 Uber 正就收购一家欧洲生鲜配送资产进行谈判' },
  { type: 'headline', symbols: ['UBER'], mins: 41, source: 'desk',
    headline: 'Uber nearing deal for European grocery delivery business — people familiar',
    zh: '知情人士：Uber 接近达成收购欧洲生鲜配送业务的交易' },
  { type: 'earnings_release', symbols: ['GOOG'], mins: 48,
    headline: 'GOOG Q3 EPS $2.87 vs $2.71 est · cloud revenue +31% y/y',
    zh: 'GOOG 第三季度 EPS 2.87 美元，预期 2.71 美元 · 云收入同比 +31%',
    body: 'Alphabet earned $2.87 per share against $2.71 expected. Cloud revenue grew 31% year over year and posted its widest operating margin to date.\n\nSearch revenue grew high single digits, ahead of the mid-single-digit pace the market had modelled. Management raised the capital expenditure guide and characterised demand as running ahead of available capacity.',
    body_zh: 'Alphabet 每股收益 2.87 美元，高于预期的 2.71 美元。云业务收入同比增长 31%，经营利润率创历史新高。\n\n搜索收入实现高个位数增长，快于市场此前预计的中个位数。管理层上调资本开支指引，并称需求已超出可用产能。' },
  { type: 'headline', symbols: ['XOM'], mins: 55, source: 'wire',
    headline: 'XOM in advanced talks for Permian bolt-on, said to be ~$4B',
    zh: '据悉埃克森美孚就约 40 亿美元的二叠纪补强收购进入深入谈判' },
  { type: 'macro_print', symbols: [], mins: 62,
    headline: 'Initial claims 214k vs 220k est · 4-week average lowest since March',
    zh: '初请失业金 21.4 万人，预期 22.0 万 · 四周均值创 3 月以来新低' },
  { type: 'headline', symbols: ['LLY'], mins: 70, source: 'wire',
    headline: 'LLY obesity trial hits primary endpoint at 52 weeks',
    zh: '礼来减重试验在 52 周达到主要终点' },
  { type: 'filing', symbols: ['TSLA'], mins: 77,
    headline: 'TSLA files 8-K — CFO transition effective Q1, no change to guidance',
    zh: 'TSLA 提交 8-K — 首席财务官于第一季度交接，指引不变' },
  { type: 'headline', symbols: ['META'], mins: 84, source: 'desk',
    headline: 'META said to be trimming Reality Labs headcount, refocus on ads AI',
    zh: '据悉 Meta 削减 Reality Labs 人员，重心转向广告 AI' },
  { type: 'earnings_release', symbols: ['JPM'], mins: 92,
    headline: 'JPM Q3 EPS $4.92 vs $4.61 est · NII guide raised, credit costs flat',
    zh: 'JPM 第三季度 EPS 4.92 美元，预期 4.61 美元 · 上调净利息收入指引，信用成本持平',
    body: 'JPMorgan earned $4.92 per share against $4.61 expected. Net interest income guidance moved higher for the second consecutive quarter.\n\nCredit costs were flat sequentially; the reserve build management described as precautionary rather than a response to observed deterioration. Card charge-offs remain inside the range given at investor day.',
    body_zh: '摩根大通每股收益 4.92 美元，高于预期的 4.61 美元。净利息收入指引连续第二个季度上调。\n\n信用成本环比持平；管理层称拨备计提属预防性质，而非针对已观察到的恶化。信用卡核销率仍处于投资者日给出的区间内。' },
  { type: 'macro_print', symbols: [], mins: 100,
    headline: 'Retail sales +0.4% m/m vs +0.2% est · control group +0.6%',
    zh: '零售销售环比 +0.4%，预期 +0.2% · 核心控制组 +0.6%' },
  { type: 'headline', symbols: ['NVDA'], mins: 108, source: 'wire',
    headline: 'NVDA said to have secured additional packaging capacity for 2027',
    zh: '据悉英伟达已锁定 2027 年额外封装产能' },
  { type: 'filing', symbols: ['WMT'], mins: 116,
    headline: 'WMT files 8-K — completes $2.3B logistics acquisition',
    zh: 'WMT 提交 8-K — 完成 23 亿美元物流收购' },
  { type: 'fed_headline', symbols: [], mins: 124,
    headline: 'Fed minutes: "several" participants saw scope to slow balance-sheet runoff',
    zh: '美联储纪要：“数位”与会者认为有放缓缩表的空间' },
  { type: 'headline', symbols: ['BA'], mins: 132, source: 'wire',
    headline: 'BA lifts monthly narrowbody output to 47 after regulator sign-off',
    zh: '获监管批准后，波音将窄体机月产量提升至 47 架' },
  { type: 'earnings_release', symbols: ['COST'], mins: 141,
    headline: 'COST Q4 EPS $5.44 vs $5.29 est · comps +6.1%, traffic +3.8%',
    zh: 'COST 第四季度 EPS 5.44 美元，预期 5.29 美元 · 同店销售 +6.1%，客流 +3.8%' },
  { type: 'headline', symbols: ['NFLX'], mins: 149, source: 'desk',
    headline: 'NFLX ad tier said to have passed 100M monthly actives',
    zh: '据悉 Netflix 广告套餐月活跃用户已突破 1 亿' },
  { type: 'filing', symbols: ['GS'], mins: 158,
    headline: 'GS files 13F — no position changes above the disclosure floor',
    zh: 'GS 提交 13F — 无超过披露门槛的持仓变动' },
  { type: 'macro_print', symbols: [], mins: 167,
    headline: 'ISM services 54.1 vs 52.8 est · new orders strongest in 14 months',
    zh: 'ISM 服务业 54.1，预期 52.8 · 新订单创 14 个月新高' },
  { type: 'headline', symbols: ['UNH'], mins: 176, source: 'wire',
    headline: 'UNH guides medical loss ratio to the low end after utilisation cools',
    zh: '利用率降温后，联合健康将医疗赔付率指引至区间下限' },
  { type: 'earnings_release', symbols: ['CAT'], mins: 186,
    headline: 'CAT Q3 EPS $5.61 vs $5.28 est · dealer inventories drawn down',
    zh: 'CAT 第三季度 EPS 5.61 美元，预期 5.28 美元 · 经销商库存去化' },
  { type: 'headline', symbols: ['V', 'MA'], mins: 195, source: 'desk',
    headline: 'Card networks flag cross-border volume running above pre-2020 trend',
    zh: '卡组织称跨境交易量高于 2020 年前趋势水平' },
  { type: 'fed_speech', symbols: [], mins: 205,
    headline: 'Fed speaker: balance-sheet runoff to slow "in coming months"',
    zh: '美联储官员：缩表将在“未来几个月”放缓' },
  { type: 'filing', symbols: ['ORCL'], mins: 215,
    headline: 'ORCL files 8-K — $18B senior notes across four tranches',
    zh: 'ORCL 提交 8-K — 发行 180 亿美元优先票据，分四档' },
  { type: 'headline', symbols: ['DIS'], mins: 225, source: 'wire',
    headline: 'DIS streaming segment posts a second consecutive profitable quarter',
    zh: '迪士尼流媒体业务连续第二个季度盈利' },
  { type: 'macro_print', symbols: [], mins: 236,
    headline: 'PPI m/m +0.1% vs +0.2% est · core services ex-trade flat',
    zh: 'PPI 环比 +0.1%，预期 +0.2% · 除贸易外核心服务持平' },
  { type: 'earnings_release', symbols: ['KO'], mins: 247,
    headline: 'KO Q3 organic revenue +8% · price/mix +6, volume +2',
    zh: 'KO 第三季度有机收入 +8% · 价格/组合 +6，销量 +2' },
  { type: 'headline', symbols: ['AMZN'], mins: 258, source: 'desk',
    headline: 'AMZN said to be expanding same-day pharmacy to 20 more metros',
    zh: '据悉亚马逊将当日达药房服务扩展至另外 20 个都会区' },
  { type: 'filing', symbols: ['PG'], mins: 269,
    headline: 'PG files 8-K — restructuring charge of $1.1B over eight quarters',
    zh: 'PG 提交 8-K — 未来八个季度计提 11 亿美元重组费用' },
  { type: 'headline', symbols: ['CVX', 'XOM'], mins: 281, source: 'wire',
    headline: 'Majors hold capex flat into 2027 despite the strip backing up',
    zh: '尽管远期油价回升，石油巨头 2027 年资本开支维持不变' },
  { type: 'fed_headline', symbols: [], mins: 293,
    headline: 'Fed: reverse repo balances back under $150B, lowest since 2021',
    zh: '美联储：逆回购余额回落至 1500 亿美元下方，创 2021 年以来新低' },
  { type: 'headline', symbols: ['AMD'], mins: 305, source: 'wire',
    headline: 'AMD next-gen accelerator sampling ahead of schedule',
    zh: 'AMD 下一代加速器送样进度快于预期' },
  { type: 'earnings_release', symbols: ['MCD'], mins: 317,
    headline: 'MCD Q3 US comps +3.4% vs +2.6% est · value menu drove traffic',
    zh: 'MCD 第三季度美国同店 +3.4%，预期 +2.6% · 超值菜单带动客流' },
  { type: 'headline', symbols: ['JNJ'], mins: 330, source: 'desk',
    headline: 'JNJ wins appellate ruling narrowing talc liability exposure',
    zh: '强生在上诉中获胜，滑石粉相关责任敞口收窄' },
  { type: 'filing', symbols: ['HD'], mins: 343,
    headline: 'HD files 8-K — appoints new COO effective immediately',
    zh: 'HD 提交 8-K — 任命新任首席运营官，即刻生效' },
  { type: 'macro_print', symbols: [], mins: 356,
    headline: 'Nonfarm payrolls +168k vs +150k est · unemployment steady at 4.1%',
    zh: '非农就业 +16.8 万，预期 +15.0 万 · 失业率维持 4.1%' },
]

// Two written call sessions so the live-audio lane has something to render:
// one still capturing (its newest chunk lands inside the live window), one
// finished. `collapseSessions` folds each into a single card.
const DEMO_SESSIONS = [
  { sid: 'msft-q3', label: 'MSFT Q3 call', symbols: ['MSFT'], rows: [
    { type: 'digest', mins: 24, n: 1,
      body: 'Opening remarks: cloud revenue grew 29% in constant currency, the third quarter in a row above the guided range. Management framed capacity, not demand, as the binding constraint.',
      body_zh: '开场发言：云收入按固定汇率增长 29%，连续第三个季度高于指引区间。管理层称制约因素是产能而非需求。' },
    { type: 'digest', mins: 16, n: 2,
      body: 'Capex: full-year spend guided higher again, with the increase weighted to the back half. CFO declined to put a ceiling on the build and said returns are being underwritten deal by deal.',
      body_zh: '资本开支：全年支出指引再度上调，增量集中在下半年。首席财务官未给出建设上限，并表示回报按项目逐一测算。' },
    { type: 'digest', mins: 7, n: 3,
      body: 'Q&A: asked twice about margin dilution from the buildout. Answer both times was that operating margin should be roughly flat year over year, with depreciation absorbed inside the segment.',
      body_zh: '问答环节：两次被问及扩建带来的利润率稀释。两次回答均为经营利润率同比大致持平，折旧在分部内消化。' },
    { type: 'transcript_chunk', mins: 4,
      body: '"…so on the capacity question — we are bringing sites online as fast as we can energise them, and that is the gate, not the order book."',
      body_zh: '“……关于产能问题——我们在尽可能快地让站点通电上线，瓶颈在这里，而不在订单。”' },
    { type: 'transcript_chunk', mins: 3,
      body: '"We would rather be short capacity for another two quarters than build ahead of contracted demand."',
      body_zh: '“我们宁愿再缺两个季度的产能，也不愿超出已签约需求提前建设。”' },
    { type: 'transcript_chunk', mins: 2,
      body: '"On pricing — no change to list, and we have not needed to discount to fill the new regions."',
      body_zh: '“关于定价——标价没有变化，我们也无需通过折扣来填满新区域。”' },
    { type: 'transcript_chunk', mins: 1,
      body: '"Next question, operator." — call continues.',
      body_zh: '“接线员，下一个问题。”——电话会议继续。' },
  ] },
  { sid: 'jpm-q3', label: 'JPM Q3 call', symbols: ['JPM'], rows: [
    { type: 'digest', mins: 88, n: 1,
      body: 'Net interest income guidance raised for the second consecutive quarter. Deposit betas came in below the internal plan and management left the full-year rate assumption unchanged.',
      body_zh: '净利息收入指引连续第二个季度上调。存款贝塔低于内部计划，管理层维持全年利率假设不变。' },
    { type: 'digest', mins: 81, n: 2,
      body: 'Credit: the reserve build was described as precautionary. Card charge-offs remain inside the range given at investor day; commercial real estate marks were left alone this quarter.',
      body_zh: '信用：拨备计提被描述为预防性。信用卡核销率仍在投资者日给出的区间内；本季度商业地产估值未作调整。' },
    { type: 'transcript_chunk', mins: 79,
      body: '"Buyback pace is steady. We are not going to chase the stock and we are not going to sit on capital either."',
      body_zh: '“回购节奏保持稳定。我们既不会追高股价，也不会闲置资本。”' },
    { type: 'transcript_chunk', mins: 77,
      body: '"The reserve build is not a call on the consumer. It is a call on the distribution of outcomes."',
      body_zh: '“计提拨备不是对消费者的判断，而是对结果分布的判断。”' },
    { type: 'transcript_chunk', mins: 75,
      body: '"That concludes today’s call. Thank you all for joining."',
      body_zh: '“今天的电话会议到此结束，感谢各位参加。”' },
  ] },
]

// The session rows ride the same wrapping feed as everything else, so a call
// card appears in the backfill rather than only after 15 seconds of streaming.
const SESSION_ROWS = DEMO_SESSIONS.flatMap((s) => s.rows.map((r) => ({
  type: r.type, symbols: s.symbols, mins: r.mins,
  headline: `${s.symbols[0]} ${r.type === 'digest' ? `call digest #${r.n}` : 'call audio'}`,
  zh: `${s.symbols[0]} ${r.type === 'digest' ? `电话会摘要 #${r.n}` : '电话会音频'}`,
  body: r.body, body_zh: r.body_zh,
  session: s.sid, sessionLabel: s.label, digestN: r.n,
})))

// Interleaved by age so a call card is never stranded at the bottom of the
// first screen while its own earnings release sits at the top.
const FEED = [...DEMO_FEED, ...SESSION_ROWS].sort((a, b) => a.mins - b.mins)

/** One demo row. `agoIndex` is how far back in the feed this event sits —
 *  it defaults to `id - 1`, so a caller that only mints ids gets a walk back
 *  through the written session, and `demoBackfill` overrides it so the
 *  HIGHEST id is the NEWEST row. That ordering matters: the wire sorts by id
 *  descending, and with age rising alongside the id the backfill painted
 *  oldest-first — a wire whose top line was four hours stale. */
export function demoEvent(id, now = Date.now() / 1000, agoIndex = id - 1) {
  const idx = ((agoIndex % FEED.length) + FEED.length) % FEED.length
  const row = FEED[idx]
  // Rows older than one pass through the feed get pushed further back, so a
  // long scroll reads as history rather than the same timestamps repeating.
  const cycle = Math.floor(Math.max(0, agoIndex) / FEED.length)
  const ago = (row.mins + cycle * 420) * 60
  const meta = { headline_zh: row.zh }
  if (row.body_zh) meta.body_zh = row.body_zh
  if (row.session) {
    // The cycle rides the session id, or a long scroll would fold every
    // repeat of a call into one card claiming forty chunks.
    meta.session_id = cycle ? `${row.session}-${cycle}` : row.session
    meta.label = row.sessionLabel
    if (row.digestN) meta.digest_n = row.digestN
  }
  return {
    id,
    type: row.type,
    symbols: row.symbols,
    headline: row.headline,
    body: row.body || '',
    source: row.source || '',
    ts_event: now - ago,
    ts_seen: now - ago + 2,
    url: '',
    meta,
    demo: true,
  }
}

/** One full pass of the written session. Callers that want "the whole demo,
 *  once" ask for this rather than a magic number that silently truncates the
 *  session as it grows — 30 of 48 rows left the live-audio and filings tabs
 *  looking half-empty (Jeff 2026-08-21). */
export const DEMO_SESSION_ROWS = FEED.length

export function demoBackfill(count = DEMO_SESSION_ROWS, now = Date.now() / 1000) {
  // id ascends with recency: the newest written row gets the highest id.
  return Array.from({ length: count }, (_, i) => demoEvent(i + 1, now, count - 1 - i))
}

export const TYPE_CODE = {
  earnings_release: 'ERN', filing: 'FIL', headline: 'NWS',
  fed_speech: 'FED', fed_headline: 'FED', macro_print: 'ECO',
  transcript_chunk: 'LIV', digest: 'DIG', live_call: 'LIV',
}

export async function fetchToday(base) {
  const resp = await fetch(`${base}/api/today`)
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  return resp.json()
}


export async function fetchMeta(base) {
  const resp = await fetch(`${base}/api/meta`)
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  return resp.json()
}

// ── priority scorer (ported from the fragwire board): what it is × whether
// it's a watched name × freshness decay, ~25h half-life.
// Source credibility, fragwire's ladder verbatim: real wires and papers rank,
// SEO content mills sink. Matched on the article domain or the "— Source"
// suffix aggregators append to headlines. Unlisted sources ride at 1.0.
const SRC_CRED = [
  [/reuters|wsj\.com|bloomberg|ft\.com|apnews|federalreserve\.gov|sec\.gov/i, 1.3],
  [/cnbc|marketwatch|barrons|economist|asia\.nikkei|trendforce/i, 1.15],
  [/benzinga|businessinsider|yahoo|investing\.com|seekingalpha|fortune|axios/i, 1.0],
  [/thestreet|fool\.com|motley fool|zacks|investorplace|tipranks|gurufocus|insider monkey|247wallst|barchart/i, 0.45],
  [/simplywall|stocktwits|benzinga insights|quiver ?quant|marketbeat|defense world|americanbankingnews/i, 0.15],
]

export function srcCred(ev) {
  const hay = `${ev.url || ''} ${ev.headline || ''}`
  for (const [re, mult] of SRC_CRED) if (re.test(hay)) return mult
  return 1
}

// ── zh twins for fragwire's own output ────────────────────────────────────
// Briefs/wraps carry a server-side translation in meta (body_zh/headline_zh);
// templated machine messages (price moves) translate client-side because
// they're formulaic. External headlines stay in their source language.
const PX_MOVE = /^(\S+) ([+-][\d.]+%) on the day \(crossed ([+-][\d.]+%)\)$/
export function evHeadline(ev, locale) {
  if (locale !== 'zh') return ev.headline
  const zh = (ev.meta || {}).headline_zh
  if (zh) return zh
  const m = PX_MOVE.exec(ev.headline || '')
  if (m) return `${m[1]} 当日${m[2]}（越过${m[3]}）`
  return ev.headline
}
export function evBody(ev, locale) {
  if (locale !== 'zh') return ev.body
  return (ev.meta || {}).body_zh || ev.body
}

export const TYPE_WEIGHT = {
  earnings_release: 100, macro_print: 85, fed_headline: 75, fed_speech: 70,
  live_call: 90, digest: 60, filing: 55, headline: 40, transcript_chunk: 12,
}

export function scoreEvent(ev, watchset, now = Date.now() / 1000) {
  const base = TYPE_WEIGHT[ev.type] ?? 30
  const wl = (ev.symbols || []).some((s) => watchset.has(s)) ? 1.5 : 1
  const ageH = Math.max(0, now - ev.ts_event) / 3600
  return base * wl * Math.exp(-ageH / 36)
}

// TOP mode collapses live-transcript chatter to the newest chunk per session.
export function rankEvents(events, watchset, now = Date.now() / 1000) {
  const newestChunk = new Map()
  for (const ev of events) {
    if (ev.type !== 'transcript_chunk') continue
    const sid = ev.meta && ev.meta.session_id
    const cur = newestChunk.get(sid)
    if (!cur || ev.id > cur.id) newestChunk.set(sid, ev)
  }
  return events
    .filter((ev) => ev.type !== 'transcript_chunk'
      || newestChunk.get(ev.meta && ev.meta.session_id) === ev)
    .slice()
    .sort((a, b) => (b.is_live ? 1 : 0) - (a.is_live ? 1 : 0)
      || scoreEvent(b, watchset, now) - scoreEvent(a, watchset, now))
}

/**
 * Free-text feed filter. A symbol match is EXACT — "am" as a substring would
 * drag in half the tape via AMD/AMZN — while anything else falls through to a
 * headline substring, so a phrase like "capex" still works (2026-08-10).
 *
 * The filter has to search what the reader can SEE. On zh the rows paint
 * headline_zh/body_zh, so an English-only haystack meant typing the words on
 * screen returned nothing; the localized text joins the search, and the
 * original headline stays in it so a ticker-free English phrase still hits.
 */
export function matchesWireQuery(ev, query, locale) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  if ((ev.symbols || []).some((s) => String(s).toLowerCase() === q)) return true
  const hay = [ev.headline]
  if (locale && locale !== 'en') hay.push(evHeadline(ev, locale), evBody(ev, locale))
  return hay.some((s) => String(s || '').toLowerCase().includes(q))
}

// ── synthetic rail data for demo mode ──
export function demoToday(now = Date.now() / 1000) {
  return {
    calendar: [
      { id: 1, ts: now + 3.2 * 3600, symbol: 'AAPL', kind: 'earnings',
        label: 'AAPL earnings (demo · cons EPS $2.10, rev $96.4B)' },
    ],
    upcoming: [
      { id: 2, ts: now + 5 * 86400, symbol: '', kind: 'macro', label: 'Employment report (demo)' },
      { id: 3, ts: now + 9 * 86400, symbol: 'MSFT', kind: 'earnings', label: 'MSFT earnings (demo)' },
      { id: 4, ts: now + 13 * 86400, symbol: '', kind: 'fed', label: 'FOMC statement (demo)' },
    ],
    captured: { headline: 24, filing: 6, earnings_release: 2, digest: 5, transcript_chunk: 61 },
    sessions: [
      { id: 1, symbol: 'AAPL', status: 'capturing', label: 'AAPL earnings call (demo)' },
      { id: 2, symbol: 'TSLA', status: 'done', label: 'TSLA call replay (demo)' },
    ],
  }
}

export function demoQuotes() {
  return {
    AAPL: { change_pct: 1.2 }, MSFT: { change_pct: -0.4 },
    NVDA: { change_pct: 2.6 }, GOOG: { change_pct: 0.9 },
    AMZN: { change_pct: -1.8 }, TSLA: { change_pct: 3.5 },
  }
}

// ── session cards: a call is ONE line item, not a chunk every 20s. All of a
// session's transcript_chunk + digest events fold into one synthetic
// `live_call` row that updates as audio lands; expand for digests + the
// transcript tail. The wire API stays granular — this is presentation.
export function collapseSessions(events, now = Date.now() / 1000) {
  const bySession = new Map()
  const rest = []
  for (const ev of events) {
    const sid = ev.meta && ev.meta.session_id
    if (sid != null && (ev.type === 'transcript_chunk' || ev.type === 'digest')) {
      if (!bySession.has(sid)) bySession.set(sid, [])
      bySession.get(sid).push(ev)
    } else {
      rest.push(ev)
    }
  }
  for (const [sid, evs] of bySession) {
    const chunks = evs.filter((e) => e.type === 'transcript_chunk')
    const digests = evs.filter((e) => e.type === 'digest').sort((a, b) => a.id - b.id)
    const latest = evs.reduce((a, b) => (b.id > a.id ? b : a))
    const label = evs.map((e) => e.meta && e.meta.label).find(Boolean) || ''
    const latestChunk = chunks.length ? chunks.reduce((a, b) => (b.id > a.id ? b : a)) : null
    const live = latest.ts_seen > now - 120
    rest.push({
      is_live: live,
      id: latest.id, type: 'live_call', symbols: latest.symbols,
      ts_event: latest.ts_event, ts_seen: latest.ts_seen, url: '',
      headline: `${(latest.symbols || [])[0] || ''} call${label ? ' · ' + label : ''}`
        + `${live ? ' · LIVE' : ''} — ${chunks.length} chunks · ${digests.length} digests`
        + (latestChunk ? ` · latest: ${(latestChunk.body || '').slice(0, 60)}` : ''),
      live_call: { sid, digests, tail: chunks.slice(-4) },
      meta: { session_id: sid },
    })
  }
  return rest
}

// ── story clustering: the same story from N outlets is ONE row. Headlines
// normalize to significant-token sets; Jaccard >= 0.5 within a 48h window
// joins a cluster. The face of the cluster is the highest-tier source.
/** Proper publication names for the reader byline — the row's terse tag
 *  ("sa", "gnw") is a column width trick, but a byline that says "gnw"
 *  reads like a stock code, not a source (Jeff 2026-08-11). Keyed by
 *  hostname with www. stripped; anything unlisted gets its stem
 *  capitalized, which is right more often than not ("Stocktwits"). */
const PUB_NAMES = {
  'semafor.com': 'Semafor', 'ft.com': 'Financial Times',
  'reuters.com': 'Reuters', 'feeds.reuters.com': 'Reuters',
  'wsj.com': 'The Wall Street Journal', 'bloomberg.com': 'Bloomberg',
  'economist.com': 'The Economist', 'theinformation.com': 'The Information',
  'spectrum.ieee.org': 'IEEE Spectrum', 'taipeitimes.com': 'Taipei Times',
  'thelec.net': 'The Elec', 'nikkei.com': 'Nikkei', 'asia.nikkei.com': 'Nikkei Asia',
  'scmp.com': 'South China Morning Post', 'cnbc.com': 'CNBC',
  'barrons.com': "Barron's", 'marketwatch.com': 'MarketWatch',
  'seekingalpha.com': 'Seeking Alpha', 'fool.com': 'The Motley Fool',
  'investors.com': "Investor's Business Daily", 'finance.yahoo.com': 'Yahoo Finance',
  'prnewswire.com': 'PR Newswire', 'globenewswire.com': 'GlobeNewswire',
  'businesswire.com': 'Business Wire', 'benzinga.com': 'Benzinga',
  'thestreet.com': 'TheStreet', 'investing.com': 'Investing.com',
  'zacks.com': 'Zacks', 'morningstar.com': 'Morningstar',
  'techcrunch.com': 'TechCrunch', 'theverge.com': 'The Verge',
  'arstechnica.com': 'Ars Technica', 'tomshardware.com': "Tom's Hardware",
  'anandtech.com': 'AnandTech', 'digitimes.com': 'DigiTimes',
  'trendforce.com': 'TrendForce', 'sec.gov': 'SEC',
  'federalreserve.gov': 'Federal Reserve', 'apnews.com': 'Associated Press',
  'nytimes.com': 'The New York Times', 'theregister.com': 'The Register',
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')

export function pubDisplayName(ev) {
  try {
    const host = new URL(ev.url).hostname.replace(/^www\./, '')
    if (host === 'news.google.com') {
      // aggregator links carry the true source in the headline tail
      const m = (ev.headline || '').match(/ [-–] ([^-–]{2,40})$/)
      if (m) return m[1].trim()
    }
    if (PUB_NAMES[host]) return PUB_NAMES[host]
    return cap(host.split('.')[0])
  } catch {
    return cap(ev?.source || '')
  }
}

/** ~220 latin wpm, ~350 cjk chars/min — coarse on purpose, it's a glance
 *  figure. 0 means "nothing to read", the byline hides it. */
export function readMinutes(text) {
  if (!text) return 0
  const s = String(text)
  const cjk = (s.match(/[　-鿿]/g) || []).length
  const words = s.replace(/[　-鿿]/g, ' ').split(/\s+/).filter(Boolean).length
  const mins = words / 220 + cjk / 350
  return mins > 0 ? Math.max(1, Math.round(mins)) : 0
}

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and',
  'as', 'at', 'its', 'is', 'are', 'up', 'with', 'after', 'over', 'from',
  'by', 'says', 'say', 'said', 'new', 'reuters', 'bloomberg', 'wsj'])
export function storyTokens(headline) {
  return new Set((headline || '').toLowerCase()
    .replace(/[-—–]\s*[a-z0-9 .]+$/i, '')       // trailing "— Source" credit
    .replace(/[^a-z0-9$% ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w)))
}

const SRC_RANK = [
  [/reuters|wsj\.com|bloomberg|ft\.com|apnews/i, 5],
  [/cnbc|marketwatch|barrons|bbc|guardian/i, 4],
  [/benzinga|businessinsider|yahoo|investing\.com|seekingalpha|fortune/i, 3],
]
function srcRank(ev) {
  const hay = `${ev.url || ''} ${ev.headline || ''}`
  for (const [re, n] of SRC_RANK) if (re.test(hay)) return n
  return 1
}

// Reprints are not a headline-only problem: a wire, an aggregator and the
// filing agent all print the same 8-K, and the same CPI number arrives from
// three macro desks. Clustering runs PER TYPE — an ERN and the NWS write-up
// about it are different reads and must stay two rows.
const CLUSTER_TYPES = new Set(['headline', 'filing', 'macro_print', 'earnings_release'])

export function clusterStories(events, now = Date.now() / 1000) {
  const byType = new Map()
  const rest = []
  for (const ev of events) {
    if (!CLUSTER_TYPES.has(ev.type)) { rest.push(ev); continue }
    if (!byType.has(ev.type)) byType.set(ev.type, [])
    byType.get(ev.type).push(ev)
  }
  for (const group of byType.values()) rest.push(...clusterGroup(group))
  return rest
}

/** One type's worth of events, collapsed: singletons come back untouched
 *  (same object identity), reprints come back as one row carrying the rest. */
function clusterGroup(events) {
  const out = []
  const clusters = []          // [{tokens, members}]
  for (const ev of events) {
    const toks = storyTokens(ev.headline)
    let home = null
    if (toks.size >= 3) {
      for (const c of clusters) {
        if (Math.abs(c.members[0].ts_event - ev.ts_event) > 48 * 3600) continue
        let inter = 0
        for (const w of toks) if (c.tokens.has(w)) inter += 1
        // overlap coefficient (∩ / min size): robust to the cluster's token
        // set growing as members join, unlike Jaccard
        const denom = Math.min(c.tokens.size, toks.size)
        if (denom > 0 && inter / denom >= 0.6) { home = c; break }
      }
    }
    if (home) {
      home.members.push(ev)
      for (const w of toks) home.tokens.add(w)
    } else {
      clusters.push({ tokens: new Set(toks), members: [ev] })
    }
  }
  for (const c of clusters) {
    if (c.members.length === 1) {
      out.push(c.members[0])
      continue
    }
    // ties go to a DIRECT link over an aggregator redirect
    const direct = (e) => (/news\.google\./.test(e.url || '') ? 0 : 1)
    const face = c.members.slice().sort((a, b) =>
      srcRank(b) - srcRank(a) || direct(b) - direct(a) || b.id - a.id)[0]
    const latest = c.members.reduce((a, b) => (b.id > a.id ? b : a))
    out.push({
      ...face,
      id: latest.id,
      ts_event: latest.ts_event, ts_seen: latest.ts_seen,
      story_cluster: {
        count: c.members.length,
        members: c.members.slice().sort((a, b) => b.id - a.id),
      },
    })
  }
  return out
}

/**
 * Headlines worth interrupting a quote belt for: recent, and either flagged
 * thesis-critical by the wire's own triage or a price move it decided to
 * announce. Deliberately strict — the tape is glanceable only while it stays
 * mostly quotes.
 */
// Typed events earn a slot without a triage score: they arrive pre-classified
// (an 8-K is an 8-K), and their category is what makes the tape badge worth
// reading instead of stamping NEWS on everything.
const TAPE_TYPES = new Set(['price_move', 'earnings_release', 'filing',
                            'fed_headline', 'fed_speech', 'macro_print'])

export function tapeworthy(events, { now = Date.now() / 1000, maxAgeH = 6, limit = 6 } = {}) {
  return (events || [])
    .filter((e) => {
      if (!e.headline) return false
      if ((now - (e.ts_event || 0)) / 3600 > maxAgeH) return false
      // content mills never ride the banner — the wire list still carries
      // them with their red pip, but the belt is for real sources only
      // (Jeff 2026-08-09)
      if (srcCred(e) < 1) return false
      if (TAPE_TYPES.has(e.type)) return true
      return ((e.meta || {}).thesis || 0) >= 2
    })
    .sort((a, b) => (b.ts_event || 0) - (a.ts_event || 0))
    .slice(0, limit)
}
