import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lineup = vi.hoisted(() => ({ models: [], calls: 0, stream: null, complete: null }))

vi.mock('../../src/lib/nav.js', async (importOriginal) => ({
  ...await importOriginal(),
  IS_PRIVATE_BUILD: true,
  IS_TV_BUILD: false,
}))
vi.mock('../../src/lib/wire.js', async (importOriginal) => ({
  ...await importOriginal(),
  wireUrl: () => 'http://wire.test',
}))
vi.mock('../../src/lib/wirechat.js', async (importOriginal) => ({
  ...await importOriginal(),
  fetchWireChatModels: async () => {
    lineup.calls += 1
    return lineup.models.map((m) => ({ ...m }))
  },
  wireStream: async (options) => { if(lineup.stream)return lineup.stream(options);options.onDelta('**Setup**\nFlat.') },
  wireComplete: async (options) => lineup.complete(options),
}))

const { AiReport } = await import('../../src/components/AiReport.jsx')

const LOCAL = { key: 'local', label: 'Local 27B', fixed_effort: 'high' }
const CLOUD = { key: 'cloud', label: 'Cloud Flash', efforts: ['low', 'medium', 'high'], default_effort: 'high' }

let root
// jsdom has no element scrolling; the card follows the stream's tail with it
Element.prototype.scrollTo ||= () => {}
beforeEach(() => {
  localStorage.clear()
  lineup.calls = 0
  lineup.stream = null
  lineup.complete = null
  root = document.createElement('div')
  document.body.append(root)
})
afterEach(() => {
  render(null, root)
  root.remove()
})

async function mountCard() {
  await act(async () => {
    render(h(AiReport, { buildPrompt: async () => ({ system: 's', prompt: 'p' }) }), root)
  })
  await act(async () => {})
  return root
}

const button = (name) => [...root.querySelectorAll('button')]
  .find((b) => b.textContent.trim() === name || b.getAttribute('aria-label') === name)

describe('report card', () => {
  it('greys out and disables a model the wire marks busy', async () => {
    lineup.models = [{ ...LOCAL, busy: true }, CLOUD]
    localStorage.setItem('report_model', 'cloud')
    await mountCard()
    await act(async () => { button('Report model').click() })
    await act(async () => {})
    const local = [...root.querySelectorAll('[data-model-menu] button')]
      .find((b) => b.textContent.includes('Local 27B'))
    expect(local.disabled).toBe(true)
    expect(local.textContent).not.toContain('busy')
    expect(local.title).toBe('Busy with another request')
  })

  it('rechecks the lineup each time the model menu opens', async () => {
    lineup.models = [LOCAL, CLOUD]
    await mountCard()
    const before = lineup.calls
    await act(async () => { button('Report model').click() })
    expect(lineup.calls).toBe(before + 1)
  })

  it('does not start a report on a busy selected model', async () => {
    lineup.models = [{ ...LOCAL, busy: true }, CLOUD]
    localStorage.setItem('report_model', 'local')
    await mountCard()
    expect(button('generate').disabled).toBe(true)
  })

  it('puts copy and download under the finished report, not in the header', async () => {
    lineup.models = [CLOUD]
    await mountCard()
    expect(button('copy')).toBeUndefined()
    await act(async () => { button('generate').click() })
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(button('copy')).toBeDefined()
    }, { timeout: 3000 })
    for (const name of ['copy', '.md']) {
      expect(button(name)).toBeDefined()
      expect(button(name).closest('header')).toBeNull()
    }
  })

  it('shows a fixed effort as text rather than a button', async () => {
    lineup.models = [LOCAL]
    await mountCard()
    expect(button('high')).toBeUndefined()
    expect(root.querySelector('[title="Fixed model effort"]').textContent).toBe('thinking')
  })

  it('opens a style panel with tiers, tone chips in whole rows, a switch, and no caption', async () => {
    lineup.models = [CLOUD]
    await mountCard()
    await act(async () => { button('Style & analysis').click() })
    const tone = root.querySelector('[role="radiogroup"][aria-label="tone"]')
    expect(tone.className).toContain('grid-cols-3')
    expect(tone.querySelectorAll('button')).toHaveLength(6)
    const counter = root.querySelector('[role="switch"]')
    expect(counter.getAttribute('aria-checked')).toBe('false')
    await act(async () => { counter.click() })
    expect(root.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('true')
    expect(root.textContent).not.toContain('Controls the shape')
    expect(root.querySelector('textarea').rows).toBe(1)
  })
})


it('paints report deltas while generation is still running',async()=>{
 lineup.models=[CLOUD]
 let finish,startedResolve
 const started=new Promise(resolve=>{startedResolve=resolve})
 const gate=new Promise(resolve=>{finish=resolve})
 lineup.stream=async({onDelta})=>{onDelta('First paragraph.');startedResolve();await gate;onDelta(' Second paragraph.')}
 await mountCard()
 await act(async()=>{button('generate').click();await started})
 expect(root.textContent).toContain('First paragraph.')
 expect(root.querySelector('[data-stream-cursor]').parentElement.textContent).toBe('First paragraph.▌')
 expect(button('regenerate').disabled).toBe(true)
 await act(async()=>{finish();await gate})
 await act(async()=>{})
 expect(root.textContent).toContain('Second paragraph.')
 expect(root.querySelector('[data-stream-cursor]')).toBeNull()
 expect(button('regenerate').disabled).toBe(false)
})

it('starts private reports on Argon instead of the old Qwen default',async()=>{
 lineup.models=[{key:'qwen-local',label:'Qwen 3.8-27B',fixed_effort:'high'},
   {key:'agy-argon',label:'Gemini 4 Argon',efforts:['low','medium','high'],default_effort:'medium'}]
 localStorage.setItem('report_model','qwen-local')
 await mountCard()
 expect(localStorage.getItem('report_model')).toBe('agy-argon')
 expect(localStorage.getItem('report_effort')).toBe('low')
})

it('shows live statistics before text and retains them after completion',async()=>{
 lineup.models=[CLOUD]
 let callbacks,finish,startedResolve
 const started=new Promise(resolve=>{startedResolve=resolve})
 const gate=new Promise(resolve=>{finish=resolve})
 lineup.stream=async(options)=>{callbacks=options;startedResolve();await gate}
 await mountCard()
 expect(root.querySelector('[data-report-observability]')).toBeNull()
 await act(async()=>{button('generate').click();await started})
 const stats=root.querySelector('[data-report-observability]')
 expect(stats).not.toBeNull()
 expect(stats.closest('header')).toBeNull()
 expect(stats.querySelector('[data-live]')).not.toBeNull()
 expect(stats.querySelector('.chat-token-input').textContent).toBe('↑—')
 expect(stats.querySelector('.chat-token-output').textContent).toBe('↓—')
 await act(async()=>{
  callbacks.onModel({key:'agy-argon',label:'Gemini 4 Argon',effort:'low'})
  callbacks.onUsage({in:1200,out:20,decode_seconds:1})
  callbacks.onUsage({in:1200,out:50,decode_seconds:2})
  callbacks.onDelta('Report text.')
 })
 expect(stats.querySelector('.chat-token-model').title).toBe('Gemini 4 Argon · low')
 expect(stats.querySelector('.chat-token-input').textContent).toBe('↑1,200')
 expect(stats.querySelector('.chat-token-output').textContent).toBe('↓50')
 expect(stats.textContent).toContain('25.0 tok/s')
 expect(root.querySelector('[data-stream-cursor]').className).toContain('ai-report-cursor')
 await act(async()=>{finish();await gate})
 await act(async()=>{})
 expect(root.querySelector('[data-report-observability]')).toBe(stats)
 expect(stats.querySelector('[data-live]')).toBeNull()
 expect(stats.querySelector('.chat-token-input').textContent).toBe('↑1,200')
 expect(stats.querySelector('.chat-token-output').textContent).toBe('↓50')
 expect(stats.textContent).toContain('25.0 tok/s')
 expect(root.querySelector('[data-stream-cursor]')).toBeNull()
})

it('retains the usage returned by one-shot fallback',async()=>{
 lineup.models=[CLOUD]
 let finish,startedResolve
 const started=new Promise(resolve=>{startedResolve=resolve})
 const gate=new Promise(resolve=>{finish=resolve})
 lineup.stream=async({onUsage})=>{onUsage({in:100,out:0});throw new Error('empty stream')}
 lineup.complete=async()=>{startedResolve();await gate;return {text:'Recovered.',usage:{in:200,out:30,inference_seconds:2}}}
 await mountCard()
 await act(async()=>{button('generate').click();await started})
 expect(root.querySelector('[data-report-observability]')).not.toBeNull()
 await act(async()=>{finish();await gate})
 await vi.waitFor(async()=>{await act(async()=>{});expect(root.textContent).toContain('Recovered.')})
 const stats=root.querySelector('[data-report-observability]')
 expect(stats.querySelector('[data-live]')).toBeNull()
 expect(stats.querySelector('.chat-token-input').textContent).toBe('↑200')
 expect(stats.querySelector('.chat-token-output').textContent).toBe('↓30')
 expect(stats.textContent).toContain('15.0 tok/s')
 expect(button('regenerate').disabled).toBe(false)
})

it('shows terminal-only Qwen usage and freezes the completed elapsed time',async()=>{
 lineup.models=[{key:'qwen-local',label:'Qwen 3.8-27B',fixed_effort:'high'}]
 let finish,startedResolve
 const started=new Promise(resolve=>{startedResolve=resolve})
 const gate=new Promise(resolve=>{finish=resolve})
 const clock=vi.spyOn(Date,'now').mockReturnValue(10000)
 try {
  lineup.stream=async({onDelta,onUsage})=>{
   onDelta('Report.');startedResolve();await gate
   onUsage({in:2048,out:320,decode_seconds:8})
  }
  await mountCard()
  await act(async()=>{button('generate').click();await started})
  expect(root.querySelector('.chat-token-input').textContent).toBe('↑—')
  clock.mockReturnValue(22000)
  await act(async()=>{finish();await gate})
  await act(async()=>{})
  const stats=root.querySelector('[data-report-observability]')
  expect(stats.querySelector('.chat-token-input').textContent).toBe('↑2,048')
  expect(stats.querySelector('.chat-token-output').textContent).toBe('↓320')
  expect(stats.textContent).toContain('40.0 tok/s')
  expect(stats.textContent).toContain('12s')
  expect(stats.querySelector('.chat-token-model').title).toBe('Qwen 3.8-27B · high')
  clock.mockReturnValue(42000)
  await act(async()=>{button('Style & analysis').click()})
  expect(stats.textContent).toContain('12s')
  expect(stats.querySelector('[data-live]')).toBeNull()
 } finally { clock.mockRestore() }
})
