const NOTE_TOOLS=new Set(['memory_add','memory_edit','memory_delete','journal_add','journal_search'])
const APP_TOPICS=['watchlists','alerts','screens']
export const TEMPORARY_CHAT_PROMPT='INCOGNITO CHAT: This conversation is temporary and is not saved in ticker-tape chat history. Do not read or update persistent memories or journal entries. Memory tags are disabled. Market, portfolio and research tools remain available.'
export const temporaryToolError=()=>JSON.stringify({error:'Memories and journal entries are unavailable in incognito chats.'})

/** Enforce privacy at execution too; a model can request unadvertised tools. */
export function temporaryToolAllowed(name,args={}) {
 return !NOTE_TOOLS.has(name) && (name!=='get_app_data' || APP_TOPICS.includes(args?.topic))
}
export function temporaryTools(defs) {
 return defs.filter(def=>!NOTE_TOOLS.has(def.name)).map(def=>def.name==='get_app_data' ? {
  ...def,description:'Read named watchlists, alerts or saved screens.',
  parameters:{...def.parameters,properties:{...def.parameters.properties,topic:{type:'string',enum:APP_TOPICS}},required:[...new Set([...(def.parameters.required || []),'topic'])]},
 } : def)
}
