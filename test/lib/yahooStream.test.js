import { describe, expect, it, vi } from 'vitest'
import { createYahooStream, decodePricingMessage } from '../../src/lib/yahooStream.js'

// Captured from Yahoo's public streamer for AAPL. Keeping the binary fixture
// catches protobuf field/wire regressions without putting network in the suite.
const AAPL_FRAME = JSON.stringify({
  type: 'pricing',
  message: 'CgRBQVBMFZqZmUMY8PTPovpnKgNOTVMwCDgBRc9iNL9I9PGVBWUAhQvAsAFi2AEE',
})

describe('decodePricingMessage', () => {
  it('decodes one Yahoo pricing frame into a live tick', () => {
    expect(decodePricingMessage(AAPL_FRAME)).toMatchObject({
      symbol: 'AAPL',
      price: 307.20001220703125,
      time: 1_785_937_395_000,
      exchange: 'NMS',
      quoteType: 8,
      marketHours: 1,
      changePercent: -0.7046326994895935,
      dayVolume: 10_844_404,
      change: -2.17999267578125,
      lastSize: 98,
      priceHint: 4,
    })
  })

  it('ignores malformed and non-pricing frames', () => {
    expect(decodePricingMessage('{"type":"heartbeat"}')).toBeNull()
    expect(decodePricingMessage('not json')).toBeNull()
  })
})

class FakeSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    FakeSocket.instances.push(this)
  }

  open() {
    this.readyState = 1
    this.onopen?.()
  }

  message(data) {
    this.onmessage?.({ data })
  }

  disconnect() {
    this.readyState = 3
    this.onclose?.()
  }

  send(data) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.readyState = 3
  }
}

describe('createYahooStream', () => {
  it('subscribes incrementally and emits decoded ticks', () => {
    FakeSocket.instances = []
    const onTick = vi.fn()
    const stream = createYahooStream({ WebSocketImpl: FakeSocket, onTick })

    stream.setSymbols(['AAPL'])
    stream.setSymbols(['AAPL'])
    expect(FakeSocket.instances).toHaveLength(1)

    const socket = FakeSocket.instances[0]
    socket.open()
    expect(socket.sent).toEqual([{ subscribe: ['AAPL'] }])

    stream.setSymbols(['AAPL', 'MSFT'])
    expect(socket.sent.at(-1)).toEqual({ subscribe: ['MSFT'] })

    socket.message(AAPL_FRAME)
    expect(onTick).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'AAPL' }))
    stream.stop()
  })

  it('reconnects once and resubscribes the current symbol set', () => {
    FakeSocket.instances = []
    const reconnects = []
    const stream = createYahooStream({
      WebSocketImpl: FakeSocket,
      onTick: vi.fn(),
      setTimer: (fn) => { reconnects.push(fn); return reconnects.length },
      clearTimer: vi.fn(),
      random: () => 0,
    })

    stream.setSymbols(['AAPL', 'MSFT'])
    FakeSocket.instances[0].open()
    FakeSocket.instances[0].disconnect()
    expect(reconnects).toHaveLength(1)

    reconnects.shift()()
    expect(FakeSocket.instances).toHaveLength(2)
    FakeSocket.instances[1].open()
    expect(FakeSocket.instances[1].sent).toEqual([
      { subscribe: ['AAPL', 'MSFT'] },
    ])
    stream.stop()
  })
})

describe('nudge — reconnect now when the page comes back', () => {
  it('cancels the pending backoff and reconnects immediately when the socket is dead', () => {
    FakeSocket.instances = []
    const reconnects = []
    const cleared = []
    const stream = createYahooStream({
      WebSocketImpl: FakeSocket,
      onTick: vi.fn(),
      setTimer: (fn) => { reconnects.push(fn); return reconnects.length },
      clearTimer: (id) => cleared.push(id),
      random: () => 0,
    })
    stream.setSymbols(['AAPL'])
    FakeSocket.instances[0].open()
    FakeSocket.instances[0].disconnect()      // backoff timer armed, socket gone
    expect(reconnects).toHaveLength(1)
    stream.nudge()                             // tab came back: don't wait for it
    expect(cleared).toEqual([1])
    expect(FakeSocket.instances).toHaveLength(2)
    FakeSocket.instances[1].open()
    expect(FakeSocket.instances[1].sent).toEqual([{ subscribe: ['AAPL'] }])
    stream.stop()
  })

  it('leaves a live or connecting socket alone and is a no-op after stop', () => {
    FakeSocket.instances = []
    const stream = createYahooStream({ WebSocketImpl: FakeSocket, onTick: vi.fn(), random: () => 0 })
    stream.setSymbols(['AAPL'])
    stream.nudge()                             // connecting (readyState 0)
    expect(FakeSocket.instances).toHaveLength(1)
    FakeSocket.instances[0].open()
    stream.nudge()                             // live
    expect(FakeSocket.instances).toHaveLength(1)
    stream.stop()
    stream.nudge()
    expect(FakeSocket.instances).toHaveLength(1)
  })
})
