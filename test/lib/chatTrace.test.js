// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { plainTraceText } from '../../src/lib/chatTrace.js'

describe('plainTraceText', () => {
  it('removes markdown emphasis from compact status copy', () => {
    expect(plainTraceText('**Planning data fetching strategy**'))
      .toBe('Planning data fetching strategy')
    expect(plainTraceText('__Checking the tape__')).toBe('Checking the tape')
  })
})

it('hides a legacy tool list when that turn has an execution trace',async()=>{
  const { hasTurnActivity }=await import('../../src/lib/chatTrace.js')
  const history=[{role:'user'},{role:'assistant',toolCalls:[{id:'one'}]},{role:'tool'},
    {role:'assistant',content:'Answer',trace:[{kind:'tool'}]},{role:'user'},{role:'assistant',toolCalls:[{id:'two'}]}]
  expect(hasTurnActivity(history,1,[])).toBe(true)
  expect(hasTurnActivity(history,5,[])).toBe(false)
  expect(hasTurnActivity(history,5,[{kind:'model'}])).toBe(true)
})

it('groups tools under the model round that requested them',async()=>{
  const { activityGroups }=await import('../../src/lib/chatTrace.js')
  const steps=[{key:'m1',kind:'model'},{key:'t1',kind:'tool'},{key:'t2',kind:'tool'},
    {key:'m2',kind:'model'},{key:'t3',kind:'tool'}]
  const groups=activityGroups(steps)
  expect(groups.map(g=>g.tools.map(t=>t.key))).toEqual([['t1','t2'],['t3']])
  expect(groups.map(g=>g.model.key)).toEqual(['m1','m2'])
})
