/** Explicit account preferences; transient navigation and credentials stay local. */
export const PREFERENCE_KEYS=[
 'dashboard_landing_pin_v1','locale_v1','tape_locale_v1','ttw_high_contrast_v1',
 'ttw_market_color_order_v1','tape_lists_v1','my_portfolio_cards_v1','dash_widgets_v1',
 'tape-wire-order-v2','tape-wire-rail','tape-wire-zh-sources',
]
const keys=new Set(PREFERENCE_KEYS),edits=new Set(),applied=new Set()
export function preferenceChanged(){for(const fn of edits)fn()}
export function onPreferenceChange(fn){edits.add(fn);return()=>edits.delete(fn)}
export function preferencesApplied(){for(const fn of applied)fn()}
export function onPreferencesApplied(fn){applied.add(fn);fn();return()=>applied.delete(fn)}
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)
function validValue(key,value){
 if(value===null)return true
 if(typeof value!=='string'||value.length>8192)return false
 if(key==='dashboard_landing_pin_v1')return /^[a-z0-9-]{1,40}$/.test(value)
 if(key==='locale_v1')return ['en','zh'].includes(value)
 if(key==='tape_locale_v1')return ['auto','en','zh'].includes(value)
 if(key==='ttw_market_color_order_v1')return ['cn','global'].includes(value)
 if(key==='tape-wire-order-v2')return ['wire','top'].includes(value)
 if(['ttw_high_contrast_v1','tape-wire-rail','tape-wire-zh-sources'].includes(key))return ['0','1'].includes(value)
 let items;try{items=JSON.parse(value)}catch{return false}
 if(!Array.isArray(items)||items.length>64)return false
 if(key!=='dash_widgets_v1')return items.every(v=>typeof v==='string'&&/^[a-z0-9_-]{1,40}$/.test(v))
 return items.every(v=>object(v)&&Object.keys(v).every(k=>['id','type','symbol'].includes(k))
  &&(Number.isSafeInteger(v.id)||typeof v.id==='string'&&v.id.length<=40)
  &&['pulse','markets','earnings','calendar','movers','heat','alerts','range','risk','chart'].includes(v.type)
  &&(v.symbol===undefined||typeof v.symbol==='string'&&/^[A-Z0-9.^=-]{1,12}$/.test(v.symbol)))
}
export function validateSettingsDocument(doc){
 const valid=object(doc)&&Object.keys(doc).every(k=>k==='entries')&&object(doc.entries)
  &&Object.entries(doc.entries).every(([key,e])=>keys.has(key)&&object(e)
   &&Object.keys(e).every(k=>['value','stamp'].includes(k))
   &&Number.isSafeInteger(e.stamp)&&e.stamp>=0&&validValue(key,e.value))
 return valid?{ok:true}:{ok:false,error:'invalid settings document'}
}

let syncState='local'
const statusListeners=new Set()
export function settingsSyncStatus(){return syncState}
export function onSettingsSyncStatus(fn){statusListeners.add(fn);fn(syncState);return()=>statusListeners.delete(fn)}
export function setSettingsSyncStatus(value){syncState=value;for(const fn of statusListeners)fn(value)}
