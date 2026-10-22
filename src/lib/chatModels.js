/** Picker preferences are scoped to the private build; router model keys stay stable. */
export function pickerModels(models,privateBuild=false) {
  return privateBuild ? models.filter(m=>!['agy-flash','gpt-terra'].includes(m.key))
    .map(model=>model.key==='agy-argon' ? {...model,default_effort:'low'} : model) : models
}

export function modelGroups(models,privateBuild=false) {
  const groups=[]
  for(const model of models){
    const name=(!privateBuild && modelProvider(model.label||model.key)) || ({'Claude Code':'claude',Codex:'codex',Antigravity:'gem'}[model.group]
      ||(model.group||'models').toLowerCase())
    let group=groups.find(g=>g.name===name)
    if(!group){group={name,items:[]};groups.push(group)}
    group.items.push(model)
  }
  if(!privateBuild)for(const group of groups)if(group.name==='claude')group.items.sort((a,b)=>Number(!/opus/i.test(a.label||a.key))-Number(!/opus/i.test(b.label||b.key)))
  return groups
}

/** Match model families, independent of the account or runtime serving them. */
export function modelProvider(model) {
  const name=String(model||'')
  if(/claude|sonnet|opus|haiku/i.test(name))return 'claude'
  if(/qwen/i.test(name))return 'qwen'
  if(/gemini|flash|argon/i.test(name))return 'gemini'
  if(/gpt|codex|openai/i.test(name))return 'openai'
  return null
}

export function fullModelName(model) {
 const name=String(model||'')
 if(/^(claude|gemini)\b/i.test(name))return name
 const provider=modelProvider(name)
 return provider==='claude'?`Claude ${name}`:provider==='gemini'?`Gemini ${name}`:name
}

export function preferredModel(models, saved, privateBuild = false) {
  return models.find(model => model.key === saved)
    || (privateBuild && models.find(model => ['agy-argon', 'argon'].includes(model.key)))
    || models[0]
}

// Cache names only: availability and effort choices must come from the live router.
export function cachedModelLabel(key, storage = globalThis.localStorage) {
  try {
    const label = JSON.parse(storage.getItem('chat_model_labels_v1') || '{}')?.[key]
    return typeof label === 'string' ? label : ''
  } catch { return '' }
}

export function cacheModelLabels(models, storage = globalThis.localStorage) {
  try {
    const labels = Object.fromEntries(models.filter(m => typeof m.key === 'string' && typeof m.label === 'string').map(m => [m.key, m.label]))
    storage.setItem('chat_model_labels_v1', JSON.stringify(labels))
  } catch { /* the picker still works when storage is blocked */ }
}

// Apply the private default change once; later manual selections still win.
export function migratePrivateModelDefaults(privateBuild, storage) {
  if (!privateBuild) return
  try {
    const prefs = storage || globalThis.localStorage
    const marker = 'private_argon_default_v1'
    if (prefs.getItem(marker)) return
    for (const [key, model] of [
      ['chat_wire_model', 'agy-argon'], ['chat_model', 'argon'], ['report_model', 'agy-argon'],
    ]) {
      const prior = prefs.getItem(key)
      if (!prior || /^qwen(?:-|$)/i.test(prior)) {
        prefs.setItem(key, model)
        if (key === 'report_model' && prior) prefs.removeItem('report_effort')
      }
    }
    prefs.setItem(marker, '1')
  } catch { /* blocked storage leaves the in-memory fallback available */ }
}
