import {PORTFOLIO_CCYS,fxPairSymbol} from './fx.js'
export const BRIEFING_FX=PORTFOLIO_CCYS.filter(ccy=>ccy!=='USD').map(fxPairSymbol)

/** Briefing lenses read saved data without changing any global selection. */
const unique = values => [...new Set(values || [])]
export function briefingSources({watchlist=[],lists=[],portfolios=[],held=[],tape=[]}={}) {
 return [
  {id:'current',kind:'current',name:'Current watchlist',symbols:unique(watchlist),held:unique(held),techUniverse:unique(tape)},
  ...lists.map(list=>({id:`watchlist:${list.id}`,kind:'watchlist',name:list.name,symbols:unique(list.symbols),held:[],techUniverse:unique(list.symbols)})),
  ...portfolios.map(book=>{const symbols=unique(book.holdings?.map(h=>h.symbol));return {id:`portfolio:${book.id}`,kind:'portfolio',name:book.name,symbols,held:symbols,techUniverse:symbols,portfolio:book}}),
 ]
}
export function resolveBriefingSource(id,options) {
 const sources=briefingSources(options)
 return sources.find(source=>source.id===id)||sources[0]
}
export function briefingSourceText(source,quotes={}) {
 const lines=[`SOURCE: ${source.kind} ${source.name}`,`SYMBOLS: ${source.symbols.join(', ')}`]
 lines.push('SOURCE QUOTES: '+JSON.stringify(source.symbols.map(symbol=>{const q=quotes[symbol]?.quote;return {symbol,price:q?.price??null,currency:q?.currency??null,pct:q?.pct??null,asOf:quotes[symbol]?.ts??null}})))
 if(source.portfolio){
  const {name,ccy,holdings,cash}=source.portfolio
  lines.push('PORTFOLIO: '+JSON.stringify({name,ccy,holdings,cash}))
  lines.push('FX: '+JSON.stringify(Object.fromEntries(BRIEFING_FX.filter(symbol=>Number.isFinite(quotes[symbol]?.quote?.price)&&quotes[symbol].quote.price>0).map(symbol=>[symbol,quotes[symbol].quote.price]))))
  lines.push('Use only supplied quotes and FX rates for valuation. Keep currencies separate when conversion data is missing.')
 }
 return lines.join('\n')
}

const SOURCE_KEY='briefing_source_v1'
export function loadBriefingSource(storage=globalThis.localStorage) {
 try { return storage?.getItem(SOURCE_KEY)||'current' } catch { return 'current' }
}
export function saveBriefingSource(id,storage=globalThis.localStorage) {
 try { storage?.setItem(SOURCE_KEY,id) } catch {}
}
