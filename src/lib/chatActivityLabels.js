/** Stable source labels remain in saved traces; localize only their chrome. */
export const TOOL_GERUNDS = {
  get_portfolios:'Reading portfolios',get_portfolio:'Reading portfolio',get_app_data:'Reading app data',get_research:'Reading research',get_news:'Reading news',read_article:'Reading article',
  get_quotes: 'Reading quotes',
  get_technicals: 'Reading technicals',
  get_earnings: 'Checking earnings',
  get_market_pulse: 'Reading the tape',
  get_watchlist: 'Reading the watchlist',
  watch: 'Adding to the watchlist',
  unwatch: 'Removing from the watchlist',
  set_alert: 'Arming an alert',
  get_calendar: 'Reading the calendar',
  add_catalyst: 'Adding a catalyst',
  memory_add: 'Remembering',
  memory_edit: 'Revising a memory',
  memory_delete: 'Forgetting',
  journal_add: 'Writing to the journal',
  journal_search: 'Searching the journal',
  navigate: 'Opening',
}

const PHRASES=[...new Set([...Object.values(TOOL_GERUNDS),'Working','Thinking','Reasoned','Answered','Stopped after','Worked for','Read the tape for','Analyzed for','Reviewed for'])].sort((a,b)=>b.length-a.length)
export function activityLabel(value,translate=label=>label) {
 const label=String(value||'')
 if(/^Stopped /i.test(label) && !/^Stopped after$/i.test(label)){
  const stopped=translate('Stopped')
  return stopped==='Stopped'?label:`${stopped}：${activityLabel(label.slice(8),translate)}`
 }
 const earnings=label.match(/^Checking (.+) earnings$/i)
 if(earnings && translate('Checking earnings')!=='Checking earnings')return `${translate('Checking earnings')} ${earnings[1]}`
 const prefix=PHRASES.find(phrase=>label.toLowerCase()===phrase.toLowerCase()||label.toLowerCase().startsWith(phrase.toLowerCase()+' '))
 if(!prefix || translate(prefix)===prefix)return label
 const suffix=label.slice(prefix.length).trim()
 return translate(prefix)+(suffix?' '+translate(suffix):'')
}
