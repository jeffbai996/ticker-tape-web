// vitest.config.js applies this guard before importing any test modules.
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertFocusedVitest } from '../scripts/testScope.mjs'

const created = []
afterEach(() => { for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true }) })
function project() {
  const root = mkdtempSync(join(tmpdir(), 'focused-vitest-'))
  created.push(root)
  mkdirSync(join(root, 'test'))
  writeFileSync(join(root, 'test/example.test.js'), '')
  return root
}

describe('Vitest collection scope', () => {
  it.each([[], ['run'], ['run', 'test'], ['run', 'example'], ['run', 'test/*.test.js']])(
    'refuses default, directory and substring collection: %j', (...args) => {
      expect(() => assertFocusedVitest(args, project())).toThrow(/explicit test files/)
    },
  )
  it('uses the runner parser so option values cannot masquerade as filenames', () => {
    const root = project()
    expect(assertFocusedVitest(['run', '--maxWorkers', '2', '-t', 'example', 'test/example.test.js'], root))
      .toEqual(['test/example.test.js'])
    expect(() => assertFocusedVitest(['run', '--config', 'test/example.test.js'], root)).toThrow(/explicit test files/)
  })
  it('refuses directories with test filename extensions', () => {
    const root = project()
    mkdirSync(join(root, 'test/directory.test.js'))
    expect(() => assertFocusedVitest(['run', 'test/directory.test.js'], root)).toThrow(/explicit test files/)
  })
  it('refuses symlinks escaping the project', () => {
    const root = project(), outside = project()
    symlinkSync(join(outside, 'test/example.test.js'), join(root, 'test/link.test.js'))
    expect(() => assertFocusedVitest(['run', 'test/link.test.js'], root)).toThrow(/explicit test files/)
  })
  it('refuses watch and related modes even when a file is supplied', () => {
    const root = project()
    for (const command of ['watch', 'related']) {
      expect(() => assertFocusedVitest([command, 'test/example.test.js'], root)).toThrow(/explicit test files/)
    }
  })
})
