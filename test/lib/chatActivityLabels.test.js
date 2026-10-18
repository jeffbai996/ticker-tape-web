// @vitest-environment node
import {expect,it} from 'vitest'
import {activityLabel,TOOL_GERUNDS} from '../../src/lib/chatActivityLabels.js'
import {setLocale,tl} from '../../src/lib/i18n.js'
it('translates saved activity labels without changing symbol and argument suffixes',()=>{
 setLocale('zh')
 expect(activityLabel('Reading portfolios',tl)).toBe('读取投资组合')
 expect(activityLabel('Reading the calendar',tl)).toBe('查看财经日历')
 expect(activityLabel('Reading quotes AAPL, MSFT',tl)).toBe('读取行情 AAPL, MSFT')
 expect(activityLabel('Checking AAPL earnings',tl)).toBe('查看财报 AAPL')
 expect(activityLabel('Stopped thinking',tl)).toBe('已停止：思考中')
 expect(activityLabel('Read the tape for',tl)).toBe('市场研读耗时')
 for(const label of Object.values(TOOL_GERUNDS))expect(activityLabel(label,tl)).not.toBe(label)
 setLocale('en');expect(activityLabel('Reading portfolios',tl)).toBe('Reading portfolios')
})
