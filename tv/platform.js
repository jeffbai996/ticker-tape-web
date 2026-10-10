// Samsung platform calls. Each is guarded so the same bundle runs in a
// desktop browser, where `tizen` and `webapis` do not exist.
import { REGISTERED_KEYS } from './lib/keys.js'

export function registerRemoteKeys() {
  const device = globalThis.tizen?.tvinputdevice
  if (!device) return
  for (const name of REGISTERED_KEYS) {
    try { device.registerKey(name) } catch { /* key absent on this remote */ }
  }
}

/** A market wall is meant to stay up; the set's screensaver would cover it. */
export function keepScreenOn() {
  const common = globalThis.webapis?.appcommon
  if (!common) return
  try {
    common.setScreenSaver(common.AppCommonScreenSaverState.SCREEN_SAVER_OFF)
  } catch { /* older firmware without appcommon */ }
}

export function exitApp() {
  const app = globalThis.tizen?.application
  if (app) {
    try { app.getCurrentApplication().exit() } catch { /* already closing */ }
  }
}

export const isTizen = () => !!globalThis.tizen
