import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { parseCLI } from 'vitest/node'

const message = 'Select explicit test files for Vitest; directory and full-suite runs are disabled.'
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const nativeFiles = new Set([
  'test/lib/private_font_build.test.js',
  'test/worker/security_log.test.js',
])

// These suites exercise native module loading or WebCrypto across realm edges.
export function focusedVitestPool(files, root = process.cwd()) {
  const base = realpathSync(root)
  return files.some((file) => nativeFiles.has(
    relative(base, realpathSync(resolve(root, file))).replaceAll('\\', '/'),
  )) ? 'forks' : 'vmThreads'
}

export function assertFocusedVitest(args, root = process.cwd()) {
  const { filter, options } = parseCLI(['vitest', ...args])
  if (!options.run || options.watch || options.related || options.changed || options.ui || !filter.length) {
    throw new Error(message)
  }
  const base = realpathSync(root)
  const testRoot = resolve(base, options.root || '.')
  const files = []
  for (const filename of filter) {
    if (!testFile.test(filename) || /[*?\[\]]/.test(filename)) throw new Error(message)
    try {
      const file = realpathSync(resolve(testRoot, filename))
      const fromRoot = relative(base, file)
      if (isAbsolute(fromRoot) || fromRoot.startsWith('..') || !statSync(file).isFile()) throw new Error(message)
      files.push(file)
    } catch {
      throw new Error(message)
    }
  }
  return files
}
