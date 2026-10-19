// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  LANES, PAD_SIZE, activeLanes, canRefresh, dynamicActions, visibleActions,
} from '../../src/lib/launchpad.js'

/**
 * Every live branch in dynamicActions keys off market activity — a print
 * today, a 3% mover, an RSI extreme. On a closed weekend none of them fire
 * and the static tail is the whole pad, which is how it came to look
 * half-built (Jeff 2026-08-09). Pin the floor.
 */
describe('launchpad quick actions', () => {
  const dead = {
    watchlist: ['AAPL', 'MSFT'],
    quotes: {},          // market shut: no pct, no tech badges
    earnDays: {},        // nothing reporting
    nextEvent: null,
    book: false,
    journal: [],
  }

  it('fills the pad even with no live market data at all', () => {
    expect(visibleActions(dynamicActions(dead)).length).toBe(PAD_SIZE)
  })

  it('keeps more prompts in the pool than fit on the pad, so refresh has somewhere to go', () => {
    const pool = dynamicActions(dead)
    expect(pool.length).toBeGreaterThan(PAD_SIZE)
    expect(canRefresh(pool)).toBe(true)
  })

  it('never repeats a prompt', () => {
    const pool = dynamicActions(dead)
    expect(new Set(pool.map((a) => a.t)).size).toBe(pool.length)
  })

  it('skips symbol prompts rather than showing a placeholder', () => {
    const pool = dynamicActions({ ...dead, watchlist: [] })
    expect(pool.every((a) => !/\{symbol\}|undefined/.test(a.t))).toBe(true)
  })

  it('tags every prompt with a known lane', () => {
    const known = new Set(LANES.map((l) => l.k))
    for (const a of dynamicActions(dead)) expect(known.has(a.k)).toBe(true)
  })
})

describe('pad windowing', () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({ t: `q${i}`, k: i % 2 ? 'mkt' : 'idea' }))

  it('shows a different set after a refresh', () => {
    const first = visibleActions(pool, { page: 0 }).map((a) => a.t)
    const second = visibleActions(pool, { page: 1 }).map((a) => a.t)
    expect(second).not.toEqual(first)
  })

  it('wraps rather than running off the end', () => {
    const pages = Math.ceil(pool.length / PAD_SIZE)
    expect(visibleActions(pool, { page: pages * pool.length }).length).toBe(PAD_SIZE)
    expect(visibleActions(pool, { page: 0 })).toEqual(visibleActions(pool, { page: pool.length }))
  })

  it('filters to one lane', () => {
    const only = visibleActions(pool, { lane: 'idea' })
    expect(only.length).toBeGreaterThan(0)
    expect(only.every((a) => a.k === 'idea')).toBe(true)
  })

  it('returns everything when a lane has fewer than a padful', () => {
    const thin = [{ t: 'a', k: 'book' }, { t: 'b', k: 'book' }]
    expect(visibleActions(thin, { lane: 'book' }).length).toBe(2)
    expect(canRefresh(thin, { lane: 'book' })).toBe(false)
  })

  it('only offers lanes that are actually populated', () => {
    const lanes = activeLanes([{ t: 'a', k: 'book' }, { t: 'b', k: 'mkt' }])
    expect(lanes.map((l) => l.k)).toEqual(['mkt', 'book'])
  })
})

it('uses Chinese company names only in display labels and preserves precise prompts',async()=>{
  const { promptLabel }=await import('../../src/lib/launchpad.js')
  const prompt='AAPL 的技术面如何？与 MSFT 相比？'
  expect(promptLabel(prompt,{AAPL:'苹果',MSFT:'微软'})).toBe('苹果的技术面如何？与微软相比？')
  expect(prompt).toBe('AAPL 的技术面如何？与 MSFT 相比？')
  expect(promptLabel('AAPLX 不是 AAPL',{AAPL:'苹果'})).toBe('AAPLX 不是苹果')
})

 it('offers multiple followed companies even when markets are closed',()=>{
  const pool=dynamicActions({watchlist:['AAPL','MSFT','GOOGL'],quotes:{},earnDays:{AAPL:1,MSFT:4},book:true,journal:[]})
  expect(pool.filter(a=>['chat.action_earnings_preview','chat.action_earnings_expectations'].includes(a.family)).length).toBe(2)
  for(const symbol of ['AAPL','MSFT','GOOGL'])expect(pool.some(a=>a.t.includes(symbol))).toBe(true)
  expect(new Set(pool.map(a=>a.t)).size).toBe(pool.length)
 })

it('rotates a swipeable full pool without dropping its available prompts',()=>{
 const pool=Array.from({length:25},(_,i)=>({t:`q${i}`,k:'mkt'}))
 const first=visibleActions(pool,{size:60,rotate:true})
 const next=visibleActions(pool,{page:1,size:60,rotate:true})
 expect(next[0]).not.toEqual(first[0])
 expect(new Set(next.map(a=>a.t))).toEqual(new Set(first.map(a=>a.t)))
})

it('balances the first screen even with many movers and upcoming reports',()=>{
 const watchlist=Array.from({length:30},(_,i)=>`SYM${i}`)
 const pool=dynamicActions({watchlist,quotes:Object.fromEntries(watchlist.map(s=>[s,{quote:{pct:-5,price:100}}])),earnDays:Object.fromEntries(watchlist.map(s=>[s,2])),book:true,journal:[]})
 const first=visibleActions(pool)
 expect(new Set(first.map(a=>a.k)).size).toBe(6)
 expect(Math.max(...LANES.map(l=>first.filter(a=>a.k===l.k).length))).toBeLessThanOrEqual(3)
 const families=pool.reduce((m,a)=>(m[a.family]=(m[a.family]||0)+1,m),{})
 expect(Math.max(...Object.values(families))).toBeLessThanOrEqual(2)
 expect(Math.max(...LANES.map(l=>pool.filter(a=>a.k===l.k).length))).toBeLessThanOrEqual(6)
})

it('mixes topics within each moving row and preserves every prompt',async()=>{
 const {actionRows}=await import('../../src/lib/launchpad.js')
 const pool=dynamicActions({watchlist:['AAPL','MSFT','GOOGL'],quotes:{},earnDays:{AAPL:1,MSFT:4},book:true,journal:[]})
 const rows=actionRows(visibleActions(pool,{size:40}))
 expect(rows).toHaveLength(4)
 expect(rows.every(row=>new Set(row.map(a=>a.k)).size>=4)).toBe(true)
 expect(rows.flat()).toEqual(visibleActions(pool,{size:40}))
 expect(actionRows([{t:'Only',k:'app'}])).toEqual([[{t:'Only',k:'app'}]])
})

it('varies the wording of the same question between batches',()=>{
 const context={watchlist:['AAPL'],quotes:{},earnDays:{AAPL:2},book:true,journal:[]}
 const wording=edition=>dynamicActions({...context,edition}).find(a=>a.family==='chat.action_technical').t
 expect(new Set([0,1,2].map(wording)).size).toBe(3)
 expect([0,1,2].map(wording).every(t=>t.includes('AAPL'))).toBe(true)
})


it('closes Chinese word boundaries around substituted names while preserving Latin spacing',async()=>{
 const {promptLabel}=await import('../../src/lib/launchpad.js')
 expect(promptLabel('在 AAPL 到达 200 时设置提醒',{AAPL:'苹果'})).toBe('在苹果到达 200 时设置提醒')
 expect(promptLabel('在 MSFT 到达 200 时设置提醒',{MSFT:'Microsoft'})).toBe('在 Microsoft 到达 200 时设置提醒')
})

it('states the listing currency in alert thresholds in both locales',async()=>{
 const {setLocale}=await import('../../src/lib/i18n.js')
 const context={watchlist:['AAPL'],quotes:{AAPL:{quote:{price:100,pct:4,currency:'HKD'}}},earnDays:{},journal:[]}
 setLocale('zh')
 expect(dynamicActions(context).find(a=>a.family==='chat.action_alert').t).toContain('港元')
 setLocale('en')
 expect(dynamicActions(context).find(a=>a.family==='chat.action_alert').t).toContain('HKD')
})

describe('relative-strength prompt', () => {
  const base = { watchlist: ['AAPL'], earnDays: {}, nextEvent: null, book: false, journal: [] }
  it('calls a laggard behind the market, never ahead by a negative number', () => {
    const pool = dynamicActions({ ...base, quotes: { AAPL: { tech: { rs: -29.6 } } } })
    const prompt = pool.find((a) => /20d|20 日/.test(a.t))
    expect(prompt.t).toContain('behind')
    expect(prompt.t).toContain('29.6')
    expect(prompt.t).not.toContain('-29.6')
  })
  it('keeps the leader wording for a positive spread', () => {
    const pool = dynamicActions({ ...base, quotes: { AAPL: { tech: { rs: 12.4 } } } })
    expect(pool.find((a) => /20d/.test(a.t)).t).toContain('ahead')
  })
})
