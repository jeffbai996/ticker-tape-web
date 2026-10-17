// @vitest-environment node
import { expect, it } from 'vitest'
import { historySeries, nearestHistoryIndex, historyStats } from '../../src/lib/portfolioHistory.js'
const mark=(d,v,c='USD')=>({d,v,c})
it('sorts and deduplicates only valid marks in the selected currency',()=>{
  const out=historySeries([mark('2026-01-04',110),mark('2026-01-02',100),mark('2026-01-04',112),mark('2026-01-03',500,'CAD'),mark('2026-02-31',20),mark('2026-01-05',NaN)],'USD')
  expect(out.map(p=>[p.d,p.v])).toEqual([['2026-01-02',100],['2026-01-04',112]])
})
it('does not report a cash deposit as investment performance or a withdrawal as drawdown',()=>{
  const marks=[mark('2026-01-01',100),mark('2026-01-02',200),mark('2026-01-03',150)]
  const flows=[{id:'c1',d:'2026-01-02',kind:'deposit',ccy:'USD',amount:100},{id:'c2',d:'2026-01-03',kind:'withdrawal',ccy:'USD',amount:-50}]
  const points=historySeries(marks,'USD',flows)
  expect(points.map(p=>p.returnPct)).toEqual([0,0,0])
  expect(points.map(p=>p.drawdownPct)).toEqual([0,0,0])
  expect(points[2].change).toBe(-50)
})
it('records monetary changes to cents and calculates drawdown from the adjusted peak',()=>{
  const points=historySeries([mark('2026-01-01',0.1),mark('2026-01-02',0.3),mark('2026-01-03',0.2)],'USD')
  expect(points[1].change).toBe(0.2)
  expect(points[2].change).toBe(-0.1)
  expect(points[2].drawdownPct).toBeCloseTo(-33.3333)
  expect(historyStats(points).maxDrawdown).toBeCloseTo(-33.3333)
})
it('anchors ranges to the last recorded day and uses calendar time for pointer selection',()=>{
  const points=historySeries([mark('2026-01-01',100),mark('2026-02-01',110),mark('2026-02-09',120),mark('2026-02-10',130)],'USD',[],'1M')
  expect(points[0].d).toBe('2026-02-01')
  expect(nearestHistoryIndex(points,.5)).toBe(1)
  expect(nearestHistoryIndex(points,-1)).toBe(0)
  expect(nearestHistoryIndex(points,2)).toBe(2)
})
it('handles one point, zero-value origins and an empty history without invented returns',()=>{
  expect(historyStats([])).toBeNull()
  expect(nearestHistoryIndex([],0)).toBeNull()
  expect(historySeries([mark('2026-01-01',0)],'USD')[0].returnPct).toBeNull()
  expect(historySeries([mark('2026-01-01',100)],'USD')[0].change).toBeNull()
})
it('does not invent performance when an external cash flow lacks a book-currency conversion',()=>{
  const points=historySeries([mark('2026-01-01',100),mark('2026-01-02',200)],'USD',
    [{id:'c1',d:'2026-01-02',kind:'deposit',ccy:'CAD',amount:100}])
  expect(points[1].returnPct).toBeNull()
  expect(points[1].drawdownPct).toBeNull()
  expect(points[1].v).toBe(200)
  expect(historyStats(points).maxDrawdown).toBeNull()
})
