// Yahoo's public price streamer sends JSON envelopes whose `message` field is
// a base64-encoded protobuf. Keeping this tiny decoder in-tree avoids shipping
// a protobuf runtime for one stable message shape.

const STREAM_URL = 'wss://streamer.finance.yahoo.com/?version=2'

const STRING_FIELDS = new Map([
  [1, 'symbol'], [4, 'currency'], [5, 'exchange'], [13, 'shortName'],
])
const FLOAT_FIELDS = new Map([
  [2, 'price'], [8, 'changePercent'], [10, 'dayHigh'], [11, 'dayLow'],
  [12, 'change'], [23, 'bid'], [25, 'ask'],
])
const INTEGER_FIELDS = new Map([
  [6, 'quoteType'], [7, 'marketHours'], [9, 'dayVolume'], [22, 'lastSize'],
  [24, 'bidSize'], [26, 'askSize'], [27, 'priceHint'],
])

function bytesFromBase64(value) {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function readVarint(bytes, cursor) {
  let value = 0n
  let shift = 0n
  while (cursor.i < bytes.length && shift <= 63n) {
    const byte = bytes[cursor.i++]
    value |= BigInt(byte & 0x7f) << shift
    if (!(byte & 0x80)) return value
    shift += 7n
  }
  throw new Error('truncated protobuf varint')
}

function zigZag(value) {
  return Number((value >> 1n) ^ (-(value & 1n)))
}

/** Decode one WebSocket message into the fields the quote cache consumes. */
export function decodePricingMessage(raw) {
  try {
    const envelope = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (envelope?.type !== 'pricing' || !envelope.message) return null

    const bytes = bytesFromBase64(envelope.message)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const cursor = { i: 0 }
    const tick = {}

    while (cursor.i < bytes.length) {
      const tag = Number(readVarint(bytes, cursor))
      const field = tag >> 3
      const wire = tag & 7

      if (wire === 0) {
        const value = readVarint(bytes, cursor)
        if (field === 3) tick.time = zigZag(value)
        else if (INTEGER_FIELDS.has(field)) tick[INTEGER_FIELDS.get(field)] = Number(value)
      } else if (wire === 2) {
        const length = Number(readVarint(bytes, cursor))
        if (length < 0 || cursor.i + length > bytes.length) throw new Error('bad protobuf length')
        if (STRING_FIELDS.has(field)) {
          tick[STRING_FIELDS.get(field)] = new TextDecoder().decode(bytes.subarray(cursor.i, cursor.i + length))
        }
        cursor.i += length
      } else if (wire === 5) {
        if (cursor.i + 4 > bytes.length) throw new Error('truncated protobuf float')
        if (FLOAT_FIELDS.has(field)) tick[FLOAT_FIELDS.get(field)] = view.getFloat32(cursor.i, true)
        cursor.i += 4
      } else if (wire === 1) {
        if (cursor.i + 8 > bytes.length) throw new Error('truncated protobuf double')
        cursor.i += 8
      } else {
        throw new Error(`unsupported protobuf wire type ${wire}`)
      }
    }

    return tick.symbol && tick.price != null ? tick : null
  } catch {
    return null
  }
}

/**
 * One reconnecting socket for the app. `setSymbols` diffs subscriptions while
 * open and becomes the complete resubscribe set after a reconnect.
 */
export function createYahooStream({
  WebSocketImpl = globalThis.WebSocket,
  onTick,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  random = Math.random,
} = {}) {
  let socket = null
  let reconnectTimer = null
  let reconnectAttempt = 0
  let stopped = false
  let wanted = new Set()
  let subscribed = new Set()

  const send = (kind, symbols) => {
    if (socket?.readyState !== 1 || !symbols.length) return
    socket.send(JSON.stringify({ [kind]: symbols }))
  }

  const connect = () => {
    if (stopped || !WebSocketImpl || !wanted.size || socket) return
    socket = new WebSocketImpl(STREAM_URL)

    socket.onopen = () => {
      reconnectAttempt = 0
      subscribed = new Set(wanted)
      send('subscribe', [...subscribed])
    }
    socket.onmessage = (event) => {
      const tick = decodePricingMessage(event.data)
      if (tick && wanted.has(tick.symbol)) onTick?.(tick)
    }
    socket.onerror = () => socket?.close()
    socket.onclose = () => {
      socket = null
      subscribed.clear()
      if (stopped || !wanted.size || reconnectTimer != null) return
      const delay = Math.min(1_000 * (2 ** reconnectAttempt), 30_000) + Math.floor(random() * 500)
      reconnectAttempt += 1
      reconnectTimer = setTimer(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }
  }

  return {
    /** Connection state for the shell's feed indicator — read-only, and
     *  deliberately not a subscription: the status chrome already ticks. */
    isConnected() {
      return socket?.readyState === 1
    },

    setSymbols(symbols) {
      const next = new Set((symbols || []).filter(Boolean))
      const added = [...next].filter((symbol) => !subscribed.has(symbol))
      const removed = [...subscribed].filter((symbol) => !next.has(symbol))
      wanted = next

      if (socket?.readyState === 1) {
        send('unsubscribe', removed)
        send('subscribe', added)
        subscribed = new Set(next)
      } else if (!socket && wanted.size) {
        connect()
      }
    },

    stop() {
      stopped = true
      if (reconnectTimer != null) clearTimer(reconnectTimer)
      reconnectTimer = null
      const active = socket
      socket = null
      subscribed.clear()
      active?.close()
    },
  }
}
