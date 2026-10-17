import { expect, it } from 'vitest'
import { clusterStories, filterWireLanguage } from '../../src/lib/wire.js'

it('selects Chinese sources exclusively when the Chinese filter is active', () => {
  const english = { id: 1, headline: 'Market update', meta: { headline_zh: '市场动态' } }
  const chinese = { id: 2, headline: '市场动态', meta: { language: 'zh' } }
  const mirror = { id: 3, headline: '经济数据', language: 'zh' }
  expect(filterWireLanguage([english, chinese, mirror], true)).toEqual([chinese, mirror])
  expect(filterWireLanguage([english, chinese, mirror], false)).toEqual([english])
})

it('filters source members before choosing a clustered story face', () => {
  const common = { type: 'headline', ts_event: 1000, headline: 'AAPL revenue profit guidance earnings update' }
  const chinese = { ...common, id: 1, source: 'newswire', language: 'zh' }
  const english = { ...common, id: 2, source: 'reuters', language: 'en' }
  const stories = clusterStories(filterWireLanguage([chinese, english], true), 1000)
  expect(stories).toEqual([chinese])
})
