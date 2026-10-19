// @vitest-environment node
import {expect,it} from 'vitest'
import {pickerModels,modelGroups,fullModelName} from '../../src/lib/chatModels.js'
const models=[
 {key:'qwen-local',label:'Local',group:'Local'},
 {key:'agy-argon',label:'Argon',group:'Antigravity'},
 {key:'agy-flash',label:'Flash',group:'Antigravity'},
 {key:'claude-sonnet',label:'Sonnet',group:'Claude Code'},
 {key:'claude-opus',label:'Opus',group:'Claude Code'},
 {key:'agy-opus',label:'Opus',group:'Antigravity',fixed_effort:'low'},
 {key:'gpt-astra',label:'Astra',group:'Codex'},
 {key:'gpt-terra',label:'Terra',group:'Codex'},
 {key:'gpt-sol',label:'Sol',group:'Codex'},
]
it('gives the private picker one gem group with Argon then Opus and removes retired choices',()=>{
 const visible=pickerModels(models,true),groups=modelGroups(visible,true)
 expect(visible.some(m=>['agy-flash','gpt-terra'].includes(m.key))).toBe(false)
 expect(groups.map(g=>g.name)).toEqual(['local','gem','claude','codex'])
 expect(groups.find(g=>g.name==='gem').items.map(m=>m.key)).toEqual(['agy-argon','agy-opus'])
 expect(groups.find(g=>g.name==='gem').items[1].fixed_effort).toBe('low')
})
it('groups the family picker by provider with Opus before Sonnet without changing registry order',()=>{
 const family=[{key:'family-sonnet',label:'Sonnet 5.5'},{key:'family-opus',label:'Opus 5.5'},{key:'family-flash',label:'Flash 3.8'}]
 const groups=modelGroups(family,false)
 expect(groups.map(g=>g.name)).toEqual(['claude','gemini'])
 expect(groups[0].items.map(m=>m.key)).toEqual(['family-opus','family-sonnet'])
 expect(groups[1].items.map(m=>m.key)).toEqual(['family-flash'])
 expect(family[0].key).toBe('family-sonnet')
})
it('recognizes model providers while leaving unknown models generic',async()=>{
 const {modelProvider}=await import('../../src/lib/chatModels.js')
 for(const [name,provider] of [['Qwen 3.8-27B','qwen'],['Gemini 4 Argon','gemini'],['GPT 6.1 Sol','openai'],['Claude Opus 5.5','claude']])expect(modelProvider(name)).toBe(provider)
 expect(modelProvider('Example local model')).toBeNull()
})

it('expands compact provider names without duplicating a full name',()=>{
 expect(fullModelName('4 Argon')).toBe('Gemini 4 Argon')
 expect(fullModelName('Opus 5.5')).toBe('Claude Opus 5.5')
 expect(fullModelName('Sonnet 5.5')).toBe('Claude Sonnet 5.5')
 expect(fullModelName('Claude Opus 5.5')).toBe('Claude Opus 5.5')
 expect(fullModelName('Qwen 3.8-27B')).toBe('Qwen 3.8-27B')
})

it('defaults private Argon to low without changing other model effort settings',()=>{
 const models=[{key:'agy-argon',default_effort:'medium'},{key:'other',default_effort:'high'}]
 expect(pickerModels(models,true).map(m=>m.default_effort)).toEqual(['low','high'])
 expect(models[0].default_effort).toBe('medium')
})
