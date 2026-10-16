import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { parseCLI } from 'vitest/node'

const message = 'Select explicit test files for Vitest; directory and full-suite runs are disabled.'
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/

export function assertFocusedVitest(args, root = process.cwd()) {
  const { filter, options } = parseCLI(['vitest', ...args])
  if (!options.run || options.watch || options.related || options.changed || options.ui || !filter.length) {
    throw new Error(message)
  }
  const base = realpathSync(root)
  const testRoot = resolve(base, options.root || '.')
  for (const filename of filter) {
    if (!testFile.test(filename) || /[*?\[\]]/.test(filename)) throw new Error(message)
    try {
      const file = realpathSync(resolve(testRoot, filename))
      const fromRoot = relative(base, file)
      if (isAbsolute(fromRoot) || fromRoot.startsWith('..') || !statSync(file).isFile()) throw new Error(message)
    } catch {
      throw new Error(message)
    }
  }
  return filter
}
