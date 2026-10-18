import {SettingsSync} from './settingsSync.js'
import {onPreferenceChange,preferencesApplied,setSettingsSyncStatus} from './preferences.js'
import {wireServiceUrl} from './wire.js'
import {watchlistSyncEndpoint,watchlistSyncHeaders} from './watchlistSync.js'
import {onSyncStatus} from './cloudsave.js'
import {setLocale} from './i18n.js'
import {applyHighContrast,getHighContrast} from './contrast.js'
import {initMarketColorOrder} from './marketColors.js'
import {setTapeLocaleSetting,getTapeLocaleSetting} from './tapeLocale.js'
import {refreshCardPreferences} from './bookCards.js'
import {refreshWidgetPreferences} from './widgets.js'
import {refreshTapePreferences} from './tapeLists.js'
import {IS_FAMILY_BUILD} from './nav.js'
let started=false
export function startSettingsSync(){
 if(started)return
 started=true
 let applying=false,timer
 const endpoint=()=>{
  const wire=wireServiceUrl()
  return wire?`${wire.replace(/\/$/,'')}/api/saves/ttw-settings`:watchlistSyncEndpoint().replace(/\/watchlists$/,'/settings')
 }
 if(!endpoint())return
 const sync=new SettingsSync({endpoint,headers:()=>wireServiceUrl()?{}:watchlistSyncHeaders(),onApply:()=>{
  applying=true
  try{
   setLocale(localStorage.getItem('locale_v1')||(IS_FAMILY_BUILD?'zh':'en'))
   applyHighContrast(getHighContrast());initMarketColorOrder()
   setTapeLocaleSetting(getTapeLocaleSetting())
   refreshCardPreferences();refreshWidgetPreferences();refreshTapePreferences()
   preferencesApplied()
  }finally{applying=false}
 }})
 const run=()=>{setSettingsSyncStatus('syncing');return sync.sync().then(()=>setSettingsSyncStatus('synced')).catch(()=>setSettingsSyncStatus('offline'))}
 onPreferenceChange(()=>{
  if(applying)return
  sync.capture();setSettingsSyncStatus('syncing');clearTimeout(timer);timer=setTimeout(run,500)
 })
 const visible=()=>{if(!document.hidden)run()}
 window.addEventListener('focus',visible)
 document.addEventListener('visibilitychange',visible)
 // Reuse the watchlist refresh rather than adding another periodic timer.
 onSyncStatus(status=>{if(status.state==='synced')run()})
 run()
}
