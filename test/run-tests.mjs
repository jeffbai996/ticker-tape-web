import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parseCLI } from 'vitest/node'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const mode = args[0] === '--full' ? 'full' : args[0] === '--fast' ? 'fast' : null
if (mode) args.shift()
const { filter, options } = parseCLI(['vitest', 'run', ...args])
const fast = mode !== 'full'
// Explicit paths preserve the collection guard; new suites join the full gate.
const files = filter.length ? [] : readdirSync(resolve(root, 'test'), { recursive: true })
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => `test/${file}`)
  .sort()
  .filter((file) => !fast || readFileSync(resolve(root, file), 'utf8').includes('@vitest-environment node'))
if (!files.length && !filter.length) throw new Error('No test files selected')
// Bound worker admission on development machines that also run other workloads.
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'),
  'run', ...files, '--maxWorkers=2',
  ...(!options.pool ? ['--pool=forks'] : []), ...args], { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
