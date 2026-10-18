// Read-only projections of the same saved state and data providers used by the UI.
import {loadPortfolios,portfolioValues} from './myPortfolios.js'
import {getCached} from './feed.js'
import {holdingCurrency,fxSymbolsFor,ratesFromQuotes} from './fx.js'
import {cashJournal} from './cashLedger.js'
import {positionsFromTxns} from './lots.js'
import {fetchPortfolioHistory,mergeHistory} from './portfolioData.js'
import {historySeries,historyStats} from './portfolioHistory.js'
import {loadWatchlists} from './watchlists.js'
import {getWatchlist} from './watchlist.js'
import {loadAlerts} from './alerts.js'
import {loadMemories} from './chatMemory.js'
import {loadJournal} from './journal.js'
import {loadScreens} from './screens.js'
import {getLocale} from './i18n.js'
import {portfolioSyncStatus,onPortfolioSyncStatus} from './portfolioSync.js'
import {zhName} from './zhNames.js'

const selectedId=()=>{try{return localStorage.getItem('my_portfolio_sel_v1')||''}catch{return ''}}
const identity=p=>({id:p.id,name:p.name,currency:p.ccy})

/** Row and byte bounds keep every tool reply valid JSON rather than slicing it. */
export function chatPage(rows,{offset=0,limit=25}={}) {
 const start=Math.max(0,Math.trunc(Number(offset)||0)),size=Math.max(1,Math.min(50,Math.trunc(Number(limit)||25)))
 const out=[];let bytes=0
 for(const row of rows.slice(start,start+size)){
  const length=JSON.stringify(row).length
  if(out.length&&bytes+length>12000)break
  out.push(row);bytes+=length
 }
 const next=start+out.length
 return {total:rows.length,offset:start,rows:out,next_offset:next<rows.length?next:null}
}

export function listChatPortfolios() {
 const books=loadPortfolios(),stored=selectedId(),selected=books.some(p=>p.id===stored)?stored:books[0]?.id||null
 return {source:'saved user portfolios',selected_id:selected,
  sync:{state:portfolioSyncStatus().state,at:portfolioSyncStatus().at},portfolios:books.map(p=>({...identity(p),selected:p.id===selected,
   holding_count:p.holdings.length,trade_count:p.txns.length,cash:p.cash,
   local_history_count:p.snapshots.length,last_saved_mark:p.snapshots.at(-1)||null}))}
}

export function findChatPortfolio(selector) {
 const books=loadPortfolios()
 if(!selector)return {book:books.find(p=>p.id===selectedId())||books[0]}
 const term=String(selector).trim().toLowerCase()
 const exact=books.filter(p=>p.id.toLowerCase()===term||p.name.toLowerCase()===term)
 const matches=exact.length?exact:books.filter(p=>p.name.toLowerCase().includes(term))
 if(matches.length===1)return {book:matches[0]}
 return {error:matches.length?'ambiguous portfolio name; use an id':'portfolio not found',choices:books.map(identity)}
}

async function priceBook(book,fetchQuotes) {
 const currencies=[book.ccy,...book.holdings.map(h=>holdingCurrency(h.symbol)),...book.cash.map(c=>c.ccy)]
 const symbols=[...new Set([...book.holdings.map(h=>h.symbol),...fxSymbolsFor(currencies)])]
 const entries=Object.fromEntries(symbols.map(s=>[s,getCached(s)]).filter(([,v])=>v?.quote))
 const failed=[]
 if(fetchQuotes){
  const missing=symbols.filter(s=>!entries[s]||Date.now()-(entries[s].ts||0)>90000)
  for(let i=0;i<missing.length;i+=15){
   const batch=missing.slice(i,i+15)
   try{for(const quote of await fetchQuotes(batch))entries[quote.symbol]={quote,ts:Date.now()}}
   catch{failed.push(...batch)}
  }
 }
 const extraFx=fxSymbolsFor(book.holdings.map(h=>holdingCurrency(h.symbol,entries[h.symbol]?.quote))).filter(s=>!entries[s])
 if(fetchQuotes&&extraFx.length){
  try{for(const quote of await fetchQuotes(extraFx))entries[quote.symbol]={quote,ts:Date.now()}}
  catch{failed.push(...extraFx)}
 }
 const quotes=Object.fromEntries(Object.entries(entries).map(([s,v])=>[s,v.quote]))
 const valued=portfolioValues(book.holdings,quotes,ratesFromQuotes(entries),book.ccy,book.cash)
 const times=book.holdings.map(h=>quotes[h.symbol]?.extMarketTime||quotes[h.symbol]?.marketTime).filter(Number.isFinite)
 return {...valued,quotes,fx_rates:ratesFromQuotes(entries),as_of:times.length?Math.min(...times):null,stale:symbols.filter(s=>entries[s]&&Date.now()-(entries[s].ts||0)>90000),failed}
}

export async function readChatPortfolio(args={},services={}) {
 await waitForChatPortfolioSync()
 const found=findChatPortfolio(args.portfolio)
 if(found.error)return found
 const p=found.book
 if(!p)return {error:'no saved portfolios available'}
 const base={portfolio:identity(p),source:'saved user-entered portfolio; not broker-synced'}
 const filter=rows=>rows.filter(r=>(!args.symbol||String(r.symbol||r.sym||'').toUpperCase()===String(args.symbol).toUpperCase())
  &&(!args.from||String(r.d||r.date||'')>=args.from)&&(!args.through||String(r.d||r.date||'')<=args.through))
 const section=args.section||'summary'
 if(section==='cash')return {...base,balances:p.cash,...chatPage(filter(cashJournal(p)).reverse(),args)}
 if(section==='trades')return {...base,...chatPage(filter(p.txns).reverse(),args)}
 if(section==='lots')return {...base,...chatPage(Object.entries(positionsFromTxns(p.txns)).map(([symbol,data])=>({symbol,...data})),args)}
 if(section==='history'){
  let remote=null,warning=null
  try{remote=await (services.fetchHistory||fetchPortfolioHistory)(p.id,{signal:AbortSignal.timeout(12000)})}
  catch{warning='History service unavailable; local saved marks only'}
  const marks=mergeHistory(p.snapshots,remote?.marks||[]),series=historySeries(marks,p.ccy,p.cashTxns)
  return {...base,history_source:remote?'collected history plus local marks':'local saved marks',warning,
   metric_definitions:{value:'raw account value in portfolio currency',returnPct:'cash-flow-adjusted return index from the first mark',drawdownPct:'cash-flow-adjusted return index relative to its prior peak',high_low:'raw account-value marks, including external cash flows'},
   capture_notes:'Marks are calendar-day captures, not necessarily trading sessions. Repeated values can reflect unchanged last-known quotes. Raw balance drawdown and flow-adjusted drawdown measure different things.',
   stats:historyStats(series),...chatPage(filter(series).reverse(),args)}
 }
 if(!['summary','holdings'].includes(section))return {error:'unknown portfolio section'}
 const value=await priceBook(p,services.fetchQuotes)
 const valuation={...value.total,value:value.missing.length?null:value.total.value,priced_value:value.total.value,
  complete:!value.missing.length,missing:value.missing,currency:p.ccy,price_as_of:value.as_of,
  fx_rates_to_usd:value.fx_rates,stale_symbols:value.stale,failed_quotes:value.failed}
 if(section==='summary')return {...base,holding_count:p.holdings.length,cash:p.cash,valuation,
  trade_count:p.txns.length,local_history_count:p.snapshots.length,latest_saved_mark:p.snapshots.at(-1)||null,
  sections:['holdings','cash','trades','lots','history']}
 const rows=value.rows.filter(r=>r.kind==='equity').map(r=>({...r,name:zhName(r.symbol)||value.quotes[r.symbol]?.name||r.symbol,
  quote_time:value.quotes[r.symbol]?.marketTime||null}))
 return {...base,valuation,...chatPage(filter(rows),args)}
}

/** Explicit entity allowlist: credentials, endpoints and arbitrary storage never enter tool output. */
export function readChatAppData(args={}) {
 const topic=args.topic||'overview'
 if(topic==='overview')return {locale:getLocale(),portfolios:listChatPortfolios(),watchlist:getWatchlist(),
  counts:{watchlists:loadWatchlists().length,alerts:loadAlerts().length,memories:loadMemories().length,journal:loadJournal().length},
  available:['portfolios','portfolio holdings, cash, trades, lots, history','watchlists','alerts','memories','journal','saved screens','quotes and technicals','fundamentals, profile, analysts, insiders, holders','earnings, dividends, corporate dates','price history and options','news and article reading','calendar']}
 if(topic==='watchlists')return {current:getWatchlist(),...chatPage(loadWatchlists(),args)}
 if(topic==='alerts')return chatPage(loadAlerts().map(a=>({id:a.id,symbol:a.symbol,type:a.type,operator:a.operator,value:a.value,triggered:a.triggered,current:a.current,created:a.created})),args)
 if(topic==='screens')return chatPage(loadScreens(),args)
 if(!['memories','journal'].includes(topic))return {error:'unknown app data topic'}
 const rows=topic==='memories'?loadMemories():loadJournal()
 if(args.id!=null){
  const entry=rows.find(r=>String(r.id)===String(args.id))
  if(!entry)return {error:'entry not found'}
  const offset=Math.max(0,Math.trunc(Number(args.offset)||0)),text=entry.text.slice(offset,offset+6000)
  return {id:entry.id,offset,text,next_offset:offset+text.length<entry.text.length?offset+text.length:null}
 }
 const term=String(args.query||'').toLowerCase()
 return chatPage(rows.filter(r=>!term||r.text.toLowerCase().includes(term)).slice().reverse()
  .map(r=>({id:r.id,date:r.ts,symbols:r.symbols,text:r.text.slice(0,500),full_text_available:r.text.length>500})),args)
}

/** Wait for an already-running UI sync; never initiate a second pull or write. */
export function waitForChatPortfolioSync(timeout=6000) {
 if(portfolioSyncStatus().state!=='syncing')return Promise.resolve()
 return new Promise(resolve=>{
  let done=false,timer,off=()=>{}
  const finish=()=>{done=true;off();clearTimeout(timer);resolve()}
  off=onPortfolioSyncStatus(s=>{if(s.state!=='syncing')finish()})
  if(done){off();return}
  timer=setTimeout(finish,timeout)
 })
}
