// YouTube can reattach its default caption track when playback starts.
// Clear the track before unloading so that the next module load stays off.
export function applyCaptionPreference(player, enabled) {
 const loaded=player.getOptions?.()?.includes('captions')
 if(enabled){
  if(!loaded)player.loadModule?.('captions')
  else if(!player.getOption?.('captions','track')?.languageCode)player.setOption?.('captions','track',{languageCode:'en'})
 }else if(loaded){
  player.setOption?.('captions','track',{})
  player.unloadModule?.('captions')
 }
}
