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
