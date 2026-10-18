import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lineup = vi.hoisted(() => ({ models: [], calls: 0, stream: null }))

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
 expect(button('regenerate').disabled).toBe(true)
 await act(async()=>{finish();await gate})
 await act(async()=>{})
 expect(root.textContent).toContain('Second paragraph.')
 expect(button('regenerate').disabled).toBe(false)
})
