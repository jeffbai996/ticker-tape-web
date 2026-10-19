// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { plainTraceText, tracePrintout } from '../../src/lib/chatTrace.js'

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

it('gives portfolio calendar and market tools distinct glyphs while keeping reasoning separate',async()=>{
 const {traceIcon,completionLabel}=await import('../../src/lib/chatTrace.js')
 expect(traceIcon({kind:'tool',name:'get_portfolios'})).toBe('portfolio')
 expect(traceIcon({kind:'tool',label:'Reading the calendar'})).toBe('calendar')
 expect(traceIcon({kind:'tool',label:'Reading the tape'})).toBe('market')
 expect(traceIcon({kind:'model',label:'Reasoned'})).toBe('thinking')
 expect(completionLabel([{kind:'tool',name:'get_market_pulse'}])).toBe('Read the tape for')
 expect(completionLabel([{kind:'tool',name:'get_technicals'}])).toBe('Analyzed for')
 expect(completionLabel([{kind:'tool',name:'get_portfolios'}])).toBe('Reviewed for')
 expect(completionLabel([])).toBe('Worked for')
})

it('formats tool JSON for inspection while preserving non-JSON output literally', () => {
 expect(tracePrintout('{"symbol":"AAPL","eps":2}')).toBe('{\n  "symbol": "AAPL",\n  "eps": 2\n}')
 expect(tracePrintout('**Output**\n<script>example</script>')).toBe('**Output**\n<script>example</script>')
 expect(tracePrintout(null)).toBe('')
 expect(tracePrintout(0)).toBe('0')
})
it('bounds saved trace printouts without truncating the tool result sent to the model', () => {
 const result='x'.repeat(20000)
 expect(tracePrintout(result)).toHaveLength(16002)
 expect(tracePrintout(result).endsWith('\n…')).toBe(true)
 expect(result).toHaveLength(20000)
})

it('recovers saved tool results from the matching turn without crossing reused call ids', async () => {
 const { traceToolDetails } = await import('../../src/lib/chatTrace.js')
 const steps=[{key:'tool-w0',kind:'tool'}]
 const history=[{role:'user',content:'Earlier question'},
 {role:'assistant',toolCalls:[{id:'w0',args:{symbol:'MSFT'}}]},
 {role:'tool',id:'w0',content:'old result'},{role:'assistant',content:'Earlier answer'},
 {role:'user',content:'New question'},
 {role:'assistant',toolCalls:[{id:'w0',args:{symbol:'AAPL'}}]},
 {role:'tool',id:'w0',content:'{"eps":2}'},{role:'assistant',trace:steps}]
 const enriched=traceToolDetails(steps,history,7)[0]
 expect(enriched.input).toContain('AAPL')
 expect(enriched.output).toBe('{\n  "eps": 2\n}')
 expect(traceToolDetails(steps,history,3)[0].output).toBe('old result')
 expect(steps[0]).toEqual({key:'tool-w0',kind:'tool'})
})
