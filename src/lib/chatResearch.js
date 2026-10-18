// The assistant reads through UI providers; it cannot fetch arbitrary URLs.
import {fetchFundamentals,fetchProfile,fetchAnalysts,fetchInsider,fetchHolders} from './fundamentals.js'
import {fetchHistory,fetchDividends} from './history.js'
import {fetchOptions} from './options.js'
import {fetchSymbolEventsCached} from './cnEvents.js'
import {loadPortfolioWire,loadCompanyNews,portfolioStories} from './portfolioNews.js'
import {wireUrl,fetchWireArticle,pubDisplayName,matchesWireQuery} from './wire.js'
import {SYMBOL_ANY_CASE_RE} from './symbols.js'
import {zhName,loadZhTable} from './zhNames.js'
import {getLocale} from './i18n.js'
import {chatPage,findChatPortfolio} from './chatAppData.js'

const articles=new Map()
const symbolArg=value=>typeof value==='string'&&SYMBOL_ANY_CASE_RE.test(value.trim())?value.trim().toUpperCase():null
const remember=(event,base)=>{
 const id=event.id!=null?String(event.id):event.url
 if(id)articles.set(id,{event,base})
 while(articles.size>1000)articles.delete(articles.keys().next().value)
 return id
}

export async function readChatResearch(args={}) {
 const symbol=symbolArg(args.symbol)
 if(!symbol)return {error:'valid symbol required'}
 const section=args.section||'fundamentals'
 const functions={fundamentals:fetchFundamentals,profile:fetchProfile,analysts:fetchAnalysts,insiders:fetchInsider,holders:fetchHolders,events:fetchSymbolEventsCached}
 if(functions[section]){
  const data=await functions[section](symbol),json=JSON.stringify(data)
  if(json.length<=12000)return {symbol,section,data}
  const offset=Math.max(0,Math.trunc(Number(args.offset)||0)),text=json.slice(offset,offset+6000)
  return {symbol,section,encoding:'json',offset,text,next_offset:offset+text.length<json.length?offset+text.length:null}
 }
 if(section==='dividends')return {symbol,...chatPage(await fetchDividends(symbol),args)}
 if(section==='history'){
  const range=['1M','3M','6M','1Y','2Y','5Y','MAX'].includes(args.range)?args.range:'1Y'
  const out=await fetchHistory(symbol,range)
  return {symbol,range,...chatPage([...(out.bars||[])].reverse(),args)}
 }
 if(section==='options'){
  const expiration=Number(args.expiration)>0?Math.trunc(Number(args.expiration)):undefined
  const out=await fetchOptions(symbol,expiration)
  const rows=[...(args.side!=='puts'?(out.calls||[]).map(c=>({side:'call',...c})):[]),
   ...(args.side!=='calls'?(out.puts||[]).map(c=>({side:'put',...c})):[])]
  return {symbol,spot:out.spot,expiration:out.expiration,expirations:out.expirations,...chatPage(rows,args)}
 }
 return {error:'unknown research section'}
}

export async function readChatNews(args={}) {
 const base=wireUrl(),symbol=args.symbol?symbolArg(args.symbol):null
 if(args.symbol&&!symbol)return {error:'valid symbol required'}
 let holdings=symbol?[{symbol}]:[]
 if(args.portfolio){const found=findChatPortfolio(args.portfolio);if(found.error)return found;holdings=found.book?.holdings||[]}
 await loadZhTable()
 const sources=await Promise.allSettled([loadPortfolioWire(base),holdings.length?loadCompanyNews(holdings.map(h=>({...h,names:[zhName(h.symbol)].filter(Boolean)}))):Promise.resolve({events:[]})])
 let events=[...(sources[0].status==='fulfilled'?sources[0].value:[]),...(sources[1].status==='fulfilled'?sources[1].value.events:[])]
 if(holdings.length)events=portfolioStories(events,holdings.map(h=>({...h,names:[zhName(h.symbol)].filter(Boolean)})),base)
  .map(n=>({id:n.wireId,url:n.link,headline:n.title,body:n.summary,publisher:n.publisher,ts_event:n.time/1000,symbols:n.symbols,language:n.language}))
 const seen=new Set(),rows=[]
 for(const event of events.sort((a,b)=>(b.ts_event||0)-(a.ts_event||0))){
  if(args.q&&!matchesWireQuery(event,args.q,getLocale()))continue
  if(!event.url||seen.has(event.url))continue
  seen.add(event.url)
  rows.push({id:remember(event,base),title:event.headline,summary:event.body||'',publisher:pubDisplayName(event),url:event.url,
   time:event.ts_event,symbols:event.symbols||[],language:event.language})
 }
 return {sources_unavailable:sources.flatMap((r,i)=>r.status==='rejected'?[i?'company news':'wire']:[]),...chatPage(rows,args)}
}

export async function readChatArticle(args={}) {
 let hit=articles.get(String(args.id))
 if(!hit){await readChatNews({symbol:args.symbol,portfolio:args.portfolio});hit=articles.get(String(args.id))}
 if(!hit)return {error:'article not found; use an id returned by get_news'}
 const out=await fetchWireArticle(hit.base,hit.event)
 if(!out.ok||!out.text)return {error:'article text unavailable'}
 const offset=Math.max(0,Math.trunc(Number(args.offset)||0)),text=out.text.slice(offset,offset+6000)
 return {id:String(args.id),title:out.title||hit.event.headline,source:out.source||pubDisplayName(hit.event),
  offset,text,next_offset:offset+text.length<out.text.length?offset+text.length:null,truncated:!!out.truncated}
}
