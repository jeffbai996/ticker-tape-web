import { afterEach, describe, expect, it } from 'vitest'
import { setLocale, t, tl } from '../src/lib/i18n.js'

afterEach(() => setLocale('en'))

describe('recent interface translations', () => {
  it('translates dashboard and watchlist controls added in recent passes', () => {
    setLocale('zh')
    expect(tl('Watchlists')).toBe('自选列表')
    expect(tl('All')).toBe('全部')
    expect(tl('Sort')).toBe('排序')
    expect(t('watchlists.empty')).toBe('还没有股票。打开这个列表开始添加。')
  })

  it('translates the new chat workspace chrome', () => {
    setLocale('zh')
    expect(tl('moving now')).toBe('正在异动')
    expect(tl('saved chat sessions')).toBe('已保存的对话')
    expect(t('chat.context_line')).toContain('实时行情')
  })
})
