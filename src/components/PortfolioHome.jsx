import {dataTime} from './PortfolioFreshness.jsx'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { portfolioValues, localDate } from '../lib/myPortfolios.js'
import { loadPortfolioWire, peekPortfolioWire, loadCompanyNews, portfolioStories } from '../lib/portfolioNews.js'
import { wireUrl } from '../lib/wire.js'
import { loadZhTable, zhName } from '../lib/zhNames.js'
import { fetchSymbolEventsCached } from '../lib/cnEvents.js'
import { dailyMovers, upcomingPortfolioDates, loadPortfolioCalendar } from '../lib/portfolioOverview.js'
import { fmtCcy } from '../lib/fx.js'
import { fmtPct } from '../lib/format.js'
import { getLocale, tl } from '../lib/i18n.js'
import { Overlay } from './Overlay.jsx'
import { PortfolioArticleReader } from './PortfolioArticleReader.jsx'
import { AskAI } from './AskAI.jsx'

const text=(en,zh)=>getLocale()==='zh' ? zh : en
const eventNames={results:['Results','财报'], 'ex-dividend':['Ex-dividend','除息'],payment:['Dividend payment','派息']}
const signed=(v,ccy)=>`${v>=0 ? '+' : '−'}${fmtCcy(Math.abs(v),ccy)}`

/** Same daily workspace for manual and broker books; only its data differs. */
export function PortfolioHome({portfolio,quotes={},valuedRows}) {
  const base=wireUrl(),today=localDate(),key=(portfolio.holdings || []).map(h=>h.symbol).join(',')
  const [wire,setWire]=useState(()=>peekPortfolioWire(base)?.events || [])
  const [company,setCompany]=useState([]),[calendar,setCalendar]=useState({})
  const [newsPending,setNewsPending]=useState(true),[datesPending,setDatesPending]=useState(true)
  const [newsError,setNewsError]=useState(false),[datesPartial,setDatesPartial]=useState(false)
  const [refresh,setRefresh]=useState(0),[open,setOpen]=useState(null),[namesReady,setNamesReady]=useState(0)
  useEffect(()=>{
    let live=true
    setOpen(null);setCalendar({});setCompany([]);setDatesPending(true);setNewsPending(true);setNewsError(false);setDatesPartial(false)
    const names=loadZhTable().then(()=>{if(live)setNamesReady(n=>n+1)})
    const broad=loadPortfolioWire(base,{refresh:refresh>0}).then(rows=>{if(live)setWire(rows)}).catch(()=>{if(live)setNewsError(true)})
    const targeted=names.then(()=>{if(!live)return {events:[],failed:[]};return loadCompanyNews((portfolio.holdings || []).map(h=>({...h,names:[zhName(h.symbol),h.name,quotes[h.symbol]?.name].filter(Boolean)})),{refresh:refresh>0})})
      .then(out=>{if(live){setCompany(out.events);if(out.failed.length)setNewsError(true)}}).catch(()=>{if(live)setNewsError(true)})
    Promise.allSettled([broad,targeted]).then(()=>{if(live)setNewsPending(false)})
    const signal=AbortSignal.timeout(12000)
    loadPortfolioCalendar(portfolio.holdings || [],{today,signal,fetchEvents:fetchSymbolEventsCached,onResult:rows=>{if(live)setCalendar(rows)}})
      .then(out=>{if(live){setCalendar(out.calendar);setDatesPartial(out.incomplete || out.failed>0)}})
      .catch(()=>{if(live)setDatesPartial(true)}).finally(()=>{if(live)setDatesPending(false)})
    return ()=>{live=false}
  },[portfolio.id,key,base,today,refresh])
  const rows=valuedRows || portfolioValues(portfolio.holdings || [],quotes,{},portfolio.ccy,portfolio.cash).rows
  const movers=dailyMovers(rows)
  const holdings=useMemo(()=>(portfolio.holdings || []).map(h=>({...h,names:[zhName(h.symbol),zhName(h.symbol,{traditional:true}),h.name,quotes[h.symbol]?.name].filter(Boolean)})),[key,quotes,namesReady])
  const news=useMemo(()=>portfolioStories([...wire,...company],holdings,base).slice(0,5),[wire,company,holdings,base])
  const dates=upcomingPortfolioDates(portfolio.holdings || [],calendar,today).slice(0,5)
  const name=symbol=>(getLocale()==='zh' && zhName(symbol)) || quotes[symbol]?.name || symbol
  const context={kind:'portfolio',portfolio_id:portfolio.id,portfolio:portfolio.name,currency:portfolio.ccy,preparedAt:new Date().toISOString(),contributors:movers}
  const header=(title,href)=><div class="mb-2 flex items-center justify-between gap-2"><h3 class="font-anth text-[11px] font-semibold text-ink">{title}</h3><a href={href} class="font-anth text-[10px] text-muted hover:text-accent">{text('View all','查看全部')} ↗</a></div>
  return <section data-portfolio-home class="rounded-xl border border-line bg-surface-1">
    <header class="flex items-center gap-2 border-b border-line px-3 py-2.5">
      <h2 class="min-w-0 flex-1 font-anth text-[12px] font-semibold text-ink">{text('Your portfolio today','今日组合')}</h2>
      <AskAI label={text('Explain moves','解读涨跌')} question={text(`Explain the latest moves in the “${portfolio.name}” portfolio and their main drivers.`,`解读「${portfolio.name}」组合最新的涨跌及主要原因。`)} context={{label:portfolio.name,data:context}} />
      <AskAI label={text('Check risks','检查风险')} question={text(`Review concentration, common exposures and upcoming catalysts in the “${portfolio.name}” portfolio. Explain the three main risks using current holdings and data.`,`检查「${portfolio.name}」组合的集中度、共同风险敞口和近期催化因素。结合最新持仓和数据说明三个主要风险。`)} context={{label:portfolio.name,data:context}} />
      <button type="button" data-home-refresh aria-label={tl('Refresh')} onClick={()=>setRefresh(n=>n+1)} class="rounded px-1.5 py-1 text-muted hover:text-accent">↻</button>
    </header>
    <div class="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
      <div class="min-w-0 p-3" data-home-movers>
        {header(text('Daily contributors','涨跌贡献'),'#/portfolio')}
        <div class="space-y-2.5">{movers.map(m=><div key={m.symbol} class="flex items-center gap-2">
          <a href={`#/research/${m.symbol.toLowerCase()}`} class="min-w-0 flex-1"><span class="block truncate font-anth text-[12px] text-ink-2">{name(m.symbol)}</span><span class="font-mono text-[9px] text-muted">{m.symbol}</span></a>
          <span class={`text-right font-mono text-[11px] ${m.pnl>=0 ? 'text-up' : 'text-down'}`}><span class="block">{signed(m.pnl,portfolio.ccy)}</span><span class="text-[9px]">{m.dayPct==null ? '—' : fmtPct(m.dayPct)}</span></span>
          <AskAI label={text('Explain','解读')} question={text(`Explain ${m.symbol}'s move and its effect on the “${portfolio.name}” portfolio.`,`解读 ${m.symbol} 的涨跌及其对「${portfolio.name}」组合的影响。`)} context={{label:`${portfolio.name} · ${name(m.symbol)}`,data:{...context,contributors:[m],symbol:m.symbol}}} />
        </div>)}{!movers.length && <p class="py-2 font-anth text-[11px] text-muted">{text('No price movements available.','暂无涨跌数据。')}</p>}</div>
      </div>
      <div class="min-w-0 p-3" data-home-news>
        {header(text('News for your holdings','持仓新闻'),'#/portfolio/news')}
        <div class="space-y-2.5">{news.map(n=><button key={n.link} type="button" onClick={()=>setOpen({...n,portfolioName:portfolio.name})} class="block w-full text-left">
          <span class="line-clamp-2 font-anth text-[12px] leading-snug text-ink-2 hover:text-accent">{n.title}</span>
          <span class="mt-1 block font-mono text-[9px] text-muted">{name(n.symbol)} · {n.publisher} · {dataTime(new Date(n.time).getTime()/1000)}</span>
        </button>)}{!news.length && <p class="py-2 font-anth text-[11px] text-muted">{newsPending ? tl('loading')+'…' : newsError ? text('News unavailable. Please refresh.','新闻暂不可用，请刷新。') : tl('No matching headlines.')}</p>}</div>
      </div>
      <div class="min-w-0 p-3" data-home-dates>
        {header(text('Upcoming dates','近期日程'),'#/portfolio/events')}
        <div class="space-y-2.5">{dates.map(d=><a key={`${d.symbol}-${d.date}-${d.kind}`} href={`#/research/${d.symbol.toLowerCase()}`} class="flex items-center gap-3">
          <span class="rounded border border-line-2 bg-surface-2 px-1.5 py-1 font-mono text-[10px] text-accent">{d.date.slice(5)}</span>
          <span class="min-w-0"><span class="block truncate font-anth text-[12px] text-ink-2">{name(d.symbol)}</span><span class="block font-anth text-[10px] text-muted">{text(...eventNames[d.kind])}</span></span>
        </a>)}{!dates.length && <p class="py-2 font-anth text-[11px] text-muted">{datesPending ? tl('loading')+'…' : text('No upcoming dates available.','暂无可用的近期日程。')}</p>}</div>
        {!datesPending && datesPartial && <p class="mt-2 font-anth text-[9px] text-muted">{text('Some dates are unavailable.','部分日程暂不可用。')}</p>}
      </div>
    </div>
    {open && <Overlay onClose={()=>setOpen(null)} label={tl('News')} class="h-[min(85dvh,850px)] w-full max-w-3xl overflow-hidden rounded-xl border border-line bg-surface-1"><PortfolioArticleReader portfolio={portfolio} item={open} onClose={()=>setOpen(null)} dialog /></Overlay>}
  </section>
}
