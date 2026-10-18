// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { chatMetrics, metricDuration, mergeTurnUsage } from '../../src/lib/chatMetrics.js'

describe('chat response footer', () => {
  it('distinguishes missing telemetry from measured zero', () => {
    expect(chatMetrics({}).output).toBeNull()
    expect(chatMetrics({ usage: { in: 0, out: 0, decode_seconds: 1, decode_tokens: 0 }, startedAt: 1000, now: 2000 }).rate).toBe(0)
    expect(chatMetrics({ usage: { out: NaN } }).output).toBeNull()
  })
  it('freezes completed timing on history reload and uses reported decode timing independently of turn time', () => {
    const m = chatMetrics({ usage: { in: 100, out: 4977, decode_seconds: 80, decode_tokens: 4977 }, startedAt: 1000, endedAt: 189000, now: 999999 })
    expect(m.elapsed).toBe(188)
    expect(m.rate).toBeCloseTo(62.2125, 4)
    expect(metricDuration(m.elapsed)).toBe('3m 8s')
  })
  it('avoids infinity, negative durations and fabricated rates', () => {
    expect(chatMetrics({ usage: { out: 100 }, startedAt: 1000, now: 1000 }).rate).toBeNull()
    expect(chatMetrics({ startedAt: 2000, now: 1000 }).elapsed).toBe(0)
    expect(chatMetrics({ startedAt: 1000, now: 5000 }).rate).toBeNull()
    expect(metricDuration(null)).toBe('—')
    expect(metricDuration(3661)).toBe('1h 1m')
  })
})

it('replaces cumulative round counters and preserves unknown telemetry',()=>{
 let u=mergeTurnUsage(null,0,{in:100,out:5})
 u=mergeTurnUsage(u,0,{in:100,out:8})
 u=mergeTurnUsage(u,1,{in:120,out:3})
 expect(u.in).toBe(120);expect(u.out).toBe(11)
 expect(mergeTurnUsage(null,0,{}).out).toBeUndefined()
 expect(mergeTurnUsage(null,0,{out:0}).out).toBe(0)
})

it('does not turn prompt processing and tool waiting into a decode rate',()=>{
 expect(chatMetrics({usage:{out:20},startedAt:1000,now:11000}).rate).toBeNull()
 let u=mergeTurnUsage(null,0,{out:60,decode_seconds:1})
 u=mergeTurnUsage(u,0,{out:120,decode_seconds:2})
 u=mergeTurnUsage(u,1,{out:30,decode_seconds:1})
 expect(chatMetrics({usage:u}).rate).toBe(50)
 u=mergeTurnUsage(u,2,{out:100})
 expect(chatMetrics({usage:u}).rate).toBe(50)
})

it('uses milliseconds for sub-second work instead of rounding it down to zero',()=>{
 expect(metricDuration(0.042)).toBe('42ms')
 expect(metricDuration(0)).toBe('0ms')
 expect(metricDuration(0.999)).toBe('999ms')
 expect(metricDuration(1)).toBe('1s')
})

it('uses provider inference time without treating it as decoder telemetry',()=>{
 const usage=mergeTurnUsage(null,1,{in:100,out:80,inference_seconds:2})
 expect(chatMetrics({usage}).rate).toBe(40)
 expect(chatMetrics({usage}).rateSource).toBe('inference')
 expect(usage.decode_seconds).toBeUndefined()
 const mixed=mergeTurnUsage(usage,2,{in:120,out:20,decode_seconds:1})
 expect(chatMetrics({usage:mixed}).rate).toBeCloseTo(100/3)
 expect(chatMetrics({usage:mixed}).rateSource).toBe('inference')
})


it('ignores legacy arrival-speed counters that could be inflated by buffering',()=>{
 expect(chatMetrics({usage:{out:300,stream_tokens:300,stream_seconds:.001}}).rate).toBeNull()
})
