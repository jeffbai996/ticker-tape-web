// Samsung's 2021 sets run Tizen 6.5, whose web engine is Chromium 85. The
// shared data layer calls AbortSignal.timeout (Chrome 103) on every fetch, so
// without this shim every quote request throws before it is sent. Syntax is
// downlevelled by the build target; runtime APIs have to be provided here.

export function installPolyfills(target = globalThis) {
  const Signal = target.AbortSignal
  if (Signal && typeof Signal.timeout !== 'function' && target.AbortController) {
    const Controller = target.AbortController
    Signal.timeout = (ms) => {
      const controller = new Controller()
      setTimeout(() => controller.abort(), ms)
      return controller.signal
    }
  }

  const arrayProto = target.Array?.prototype
  if (arrayProto && typeof arrayProto.at !== 'function') {
    arrayProto.at = function at(index) {
      const n = Math.trunc(index) || 0
      const i = n < 0 ? this.length + n : n
      return i >= 0 && i < this.length ? this[i] : undefined
    }
  }

  const cryptoApi = target.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID !== 'function'
      && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.randomUUID = () => {
      const b = cryptoApi.getRandomValues(new Uint8Array(16))
      b[6] = (b[6] & 0x0f) | 0x40 // version 4
      b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
  }

  if (target.Object && typeof target.Object.hasOwn !== 'function') {
    target.Object.hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
  }
}
