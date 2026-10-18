// @vitest-environment node
import {expect,it} from 'vitest'
import {pickerModels,modelGroups} from '../../src/lib/chatModels.js'
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
it('preserves the family account label and its full allowed selection',()=>{
 expect(pickerModels(models,false)).toEqual(models)
 expect(modelGroups(models,false).find(g=>g.name==='jeffbai996').items.map(m=>m.key)).toEqual(['agy-argon','agy-flash','agy-opus'])
})
it('recognizes model providers while leaving unknown models generic',async()=>{
 const {modelProvider}=await import('../../src/lib/chatModels.js')
 for(const [name,provider] of [['Qwen 3.8-27B','qwen'],['Gemini 4 Argon','gemini'],['GPT 6.1 Sol','openai'],['Claude Opus 5.5','claude']])expect(modelProvider(name)).toBe(provider)
 expect(modelProvider('Example local model')).toBeNull()
})
