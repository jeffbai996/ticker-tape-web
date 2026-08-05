import { afterEach, describe, expect, it } from 'vitest'
import { formatBriefTechnicalNote, setLocale, t, tl } from '../src/lib/i18n.js'

afterEach(() => setLocale('en'))

describe('recent interface translations', () => {
  it('translates dashboard and watchlist controls added in recent passes', () => {
    setLocale('zh')
    expect(tl('Watchlists')).toBe('自选股')
    expect(tl('All')).toBe('全部')
    expect(tl('Sort')).toBe('排序')
    expect(t('watchlists.empty')).toBe('暂无股票。打开这组自选股即可添加。')
  })

  it('translates the new chat workspace chrome', () => {
    setLocale('zh')
    expect(tl('moving now')).toBe('正在异动')
    expect(tl('saved chat sessions')).toBe('已保存的对话')
    expect(t('chat.context_line')).toContain('实时行情')
  })

  it('translates dynamic chat actions and briefing technical notes', () => {
    setLocale('zh')
    expect(t('chat.action_mover', { symbol: 'AMD', direction: tl('down'), pct: '7.0' }))
      .toBe('AMD 今日下跌 7.0%，原因是什么？')
    expect(formatBriefTechnicalNote('2.8x avg volume')).toBe('2.8倍均量')
    expect(formatBriefTechnicalNote('below 200d · RS -19pp')).toBe('低于200日线 · 相对强弱 -19个百分点')
  })

  it('translates the remaining research and wire chrome', () => {
    setLocale('zh')
    expect(tl('full workbench — overlays, RSI/MACD panes, compare mode')).toContain('完整图表')
    expect(tl('macro + fed')).toBe('宏观 + 美联储')
    expect(tl('push watchlist → wire')).toBe('同步自选股 → 快讯')
  })
})
