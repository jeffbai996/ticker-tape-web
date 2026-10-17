/** Capacitor injects the bridge before the bundled application starts. */
export function isNativeApp(runtime = globalThis.Capacitor) {
  return import.meta.env.VITE_IOS === '1' || runtime?.isNativePlatform?.() === true
}

export function configureNativeShell({ root = document.documentElement, native = isNativeApp() } = {}) {
  if (native) root.dataset.nativeApp = 'true'
}
