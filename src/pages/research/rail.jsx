import { useEffect, useState } from 'preact/hooks'
import { getLocale, tl, t as tt } from '../../lib/i18n.js'
import { fetchHistory, fetchNews, peekHistory } from '../../lib/history.js'
import { alignedReturns, regressStats } from '../../lib/regress.js'
import { fetchFundamentals, peekFundamentals } from '../../lib/fundamentals.js'
import { fetchAnalysts } from '../../lib/fundamentals.js'
import { fetchEarningsDate } from '../../lib/fundamentals.js'
import { sma, rsi, macd, bollinger } from '../../lib/indicators.js'
import { fmtPrice, fmtBig, fmtRatio, fmtFracPct } from '../../lib/format.js'
import { Loading } from '../../components/Loading.jsx'
import { getCached } from '../../lib/feed.js'
import { memoPrompt, BRIEFING_SYSTEM } from '../../lib/briefing.js'
import { AiReport } from '../../components/AiReport.jsx'
import { Stat, ratingTone } from './shared.jsx'
import { useRailModules } from './useRailModules.js'

/** Snapshot whatever the page already knows about a symbol into a memo
 *  prompt. Fetches are cache-first, so this is cheap at click time. */
async function buildMemoPrompt(symbol) {
  const cached = getCached(symbol)
  const [earn, analysts] = await Promise.all([
    fetchEarningsDate(symbol).catch(() => null),
    fetchAnalysts(symbol).catch(() => null),
  ])
  const earnDays = earn?.date != null
    ? Math.max(0, Math.round((earn.date - Date.now()) / 86_400_000))
    : null
  return {
    system: BRIEFING_SYSTEM,
    prompt: memoPrompt(symbol, {
      quote: cached?.quote,
      tech: cached?.tech,
      analysts: analysts?.targets,
      earnDays,
    }),
  }
}

function Technicals({ symbol }) {
  const [daily, setDaily] = useState(() => peekHistory(symbol, '1Y') ?? null)

  useEffect(() => {
    setDaily(peekHistory(symbol, '1Y') ?? null)
    fetchHistory(symbol, '1Y').then(setDaily).catch(() => setDaily({ bars: [] }))
  }, [symbol])

  const closes = daily?.bars?.map((b) => b.close) || []
  const price = closes[closes.length - 1]
  const r = rsi(closes, 14)
  const m = macd(closes)
  const bb = bollinger(closes, 20, 2)
  const smaCls = (n) => {
    const v = sma(closes, n)
    return v == null || price == null ? 'text-ink' : price >= v ? 'text-up' : 'text-down'
  }
  const rsiCls = r == null ? 'text-ink' : r >= 70 ? 'text-down' : r <= 30 ? 'text-up' : 'text-ink'

  // measured beta/corr vs the bench, from the same 1Y closes — Bloomberg HRA
  // in three rows (Jeff picked it from the 2026-08-05 sweep)
  const [bench, setBench] = useState(null)
  useEffect(() => {
    fetchHistory('QQQ', '1Y').then(setBench).catch(() => setBench({ bars: [] }))
  }, [])
  const reg = (() => {
    if (!daily?.bars?.length || !bench?.bars?.length) return null
    const shape = (bars) => bars.map((b) => ({ t: b.time, c: b.close }))
    return regressStats(alignedReturns(shape(daily.bars), shape(bench.bars)))
  })()

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Technicals — daily')}</h2>
      </header>
      <Stat label="SMA 20" value={fmtPrice(sma(closes, 20))} cls={smaCls(20)} />
      <Stat label="SMA 50" value={fmtPrice(sma(closes, 50))} cls={smaCls(50)} />
      <Stat label="SMA 200" value={fmtPrice(sma(closes, 200))} cls={smaCls(200)} />
      <Stat label={tl('RSI 14')} value={r == null ? null : r.toFixed(1)} cls={rsiCls} />
      <Stat
        label={tl('MACD hist')}
        value={m == null ? null : m.hist.toFixed(2)}
        cls={m == null ? 'text-ink' : m.hist >= 0 ? 'text-up' : 'text-down'}
      />
      <Stat label={tl('Bollinger up')} value={bb && fmtPrice(bb.upper)} />
      <Stat label={tl('Bollinger mid')} value={bb && fmtPrice(bb.mid)} />
      <Stat label={tl('Bollinger low')} value={bb && fmtPrice(bb.lower)} />
      <Stat label={tl('Beta 1Y (QQQ)')} value={reg && reg.beta.toFixed(2)}
        cls={reg ? (reg.beta > 1.2 ? 'text-accent' : 'text-ink') : 'text-ink'} />
      <Stat label={tl('Corr QQQ')} value={reg && reg.corr.toFixed(2)} />
      <Stat label={tl('Up / down capt')}
        value={reg && reg.upCapture != null && reg.downCapture != null
          ? `${Math.round(reg.upCapture)}% / ${Math.round(reg.downCapture)}%` : null}
        cls={reg && reg.upCapture > (reg.downCapture ?? 0) ? 'text-up' : 'text-ink'} />
    </section>
  )
}

function Fundamentals({ symbol }) {
  const [f, setF] = useState(() => peekFundamentals(symbol) ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setF(peekFundamentals(symbol) ?? null)
    setFailed(false)
    fetchFundamentals(symbol).then(setF).catch(() => setFailed(true))
  }, [symbol])

  // Indices/futures/crypto have no fundamentals — hide the card quietly.
  if (failed) return null

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2 flex items-center gap-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Fundamentals')}</h2>
        {f?.recommendationKey && (
          <span class={`font-mono leading-none uppercase tracking-wide rounded border ${ratingTone(f.recommendationKey)} ${
            f.recommendationKey === 'strong_buy' ? 'border-up/60 bg-up/10 px-2 py-1 text-[11px]' : 'border-line px-1.5 py-0.5 text-[10px]'
          }`}>{f.recommendationKey.replace('_', ' ')}</span>
        )}
      </header>
      {!f && <Loading label={tt('common.loading')} minH={345} />}
      {f && (
        <>
          <Stat label="Mkt cap" value={fmtBig(f.marketCap)} />
          <Stat label={tl('P/E ttm / fwd')} value={`${fmtRatio(f.trailingPE)} / ${fmtRatio(f.forwardPE)}`} />
          <Stat label={tl('P/S ttm')} value={fmtRatio(f.priceToSalesTrailing12Months)} />
          <Stat label="PEG" value={fmtRatio(f.pegRatio)} />
          <Stat label="EV/EBITDA" value={fmtRatio(f.enterpriseToEbitda)} />
          <Stat label="Gross margin" value={fmtFracPct(f.grossMargins)} />
          <Stat label={tl('Op margin')} value={fmtFracPct(f.operatingMargins)} />
          <Stat label="Net margin" value={fmtFracPct(f.profitMargins)} />
          <Stat label="ROE" value={fmtFracPct(f.returnOnEquity)} />
          <Stat label={tl('Rev growth yoy')} value={fmtFracPct(f.revenueGrowth)}
            cls={f.revenueGrowth == null ? 'text-ink' : f.revenueGrowth >= 0 ? 'text-up' : 'text-down'} />
          <Stat label={tl('FCF ttm')} value={fmtBig(f.freeCashflow)} />
          <Stat label={tl('Div yield')} value={fmtFracPct(f.dividendYield)} />
          <Stat label={tl('Beta')} value={fmtRatio(f.beta)} />
          <Stat label={tl('Short % float')} value={fmtFracPct(f.shortPercentOfFloat)} />
          <Stat label={tl('Target (mean)')} value={fmtPrice(f.targetMeanPrice)} />
        </>
      )}
    </section>
  )
}

function News({ symbol }) {
  const [items, setItems] = useState(null)

  useEffect(() => {
    setItems(null)
    fetchNews(symbol).then(setItems).catch(() => setItems([]))
  }, [symbol])

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('News feed')}</h2>
      </header>
      {items == null && <Loading label={tt('common.loading')} minH={240} />}
      {items?.length === 0 && <div class="px-3 py-3 text-[11px] text-muted font-mono">{tl('no headlines')}</div>}
      {items?.map((n) => (
        <a
          key={n.link}
          href={n.link}
          target="_blank"
          rel="noopener noreferrer"
          class="block px-3 py-2 border-b border-line last:border-0 hover:bg-surface-3"
        >
          <div class="font-anth text-[12px] text-ink leading-snug">{n.title}</div>
          <div class="font-mono text-[10px] text-muted mt-0.5">
            {n.publisher}
            {n.time && ` · ${new Date(n.time).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}`}
          </div>
        </a>
      ))}
    </section>
  )
}

const REORDER_BTN = 'font-mono text-[9px] leading-none px-1 py-0.5 rounded border border-line-2 bg-surface-1/90 text-muted hover:text-ink disabled:opacity-30 disabled:pointer-events-none'

/** Right rail: AI report, technicals, fundamentals, and the news feed, in
 *  task order by default — synthesize first, confirm what it leaned on,
 *  catch up on headlines last. Reorderable with plain buttons, no DnD
 *  dependency; the chosen order persists via useRailModules. */
export function RailModules({ symbol }) {
  const { order, move: onMove } = useRailModules()
  const MODULES = {
    report: (
      <AiReport
        label="AI report"
        filename={`${symbol.toLowerCase()}-report.md`}
        buildPrompt={() => buildMemoPrompt(symbol)}
        archive={{ kind: 'memo', symbol, title: `${symbol} memo` }}
      />
    ),
    technicals: <Technicals symbol={symbol} />,
    fundamentals: <Fundamentals symbol={symbol} />,
    news: <News symbol={symbol} />,
  }
  return (
    <div data-research-rail-modules class="flex flex-col gap-3 min-w-0 lg:sticky lg:top-3 lg:max-h-[calc(100vh-1.5rem)] lg:overflow-y-auto">
      {order.map((id, i) => (
        <div key={id} class="relative">
          <div class="absolute right-1.5 top-1.5 z-10 flex flex-col gap-0.5">
            <button onClick={() => onMove(id, -1)} disabled={i === 0} title={tl('move up')} class={REORDER_BTN}>▲</button>
            <button onClick={() => onMove(id, 1)} disabled={i === order.length - 1} title={tl('move down')} class={REORDER_BTN}>▼</button>
          </div>
          {MODULES[id]}
        </div>
      ))}
    </div>
  )
}
