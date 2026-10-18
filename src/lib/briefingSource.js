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
export function briefingSourceText(source) {
 const lines=[`SOURCE: ${source.kind} ${source.name}`,`SYMBOLS: ${source.symbols.join(', ')}`]
 if(source.portfolio){
  const {name,ccy,holdings,cash}=source.portfolio
  lines.push('PORTFOLIO: '+JSON.stringify({name,ccy,holdings,cash}))
 }
 return lines.join('\n')
}
