/** Picker preferences are scoped to the private build; router model keys stay stable. */
export function pickerModels(models,privateBuild=false) {
  return privateBuild?models.filter(m=>!['agy-flash','gpt-terra'].includes(m.key)):models
}

export function modelGroups(models,privateBuild=false) {
  const groups=[]
  for(const model of models){
    const name=({'Claude Code':'claude',Codex:'codex',Antigravity:privateBuild?'gem':'jeffbai996'}[model.group]
      ||(model.group||'models').toLowerCase())
    let group=groups.find(g=>g.name===name)
    if(!group){group={name,items:[]};groups.push(group)}
    group.items.push(model)
  }
  return groups
}
