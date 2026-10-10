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

  if (target.Object && typeof target.Object.hasOwn !== 'function') {
    target.Object.hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
  }
}
