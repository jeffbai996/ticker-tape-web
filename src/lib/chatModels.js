/** Picker preferences are scoped to the private build; router model keys stay stable. */
export function pickerModels(models,privateBuild=false) {
  return privateBuild?models.filter(m=>!['agy-flash','gpt-terra'].includes(m.key)):models
}

export function modelGroups(models,privateBuild=false) {
  if(!privateBuild)return [{name:'',items:models}]
  const groups=[]
  for(const model of models){
    const name=({'Claude Code':'claude',Codex:'codex',Antigravity:'gem'}[model.group]
      ||(model.group||'models').toLowerCase())
    let group=groups.find(g=>g.name===name)
    if(!group){group={name,items:[]};groups.push(group)}
    group.items.push(model)
  }
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
