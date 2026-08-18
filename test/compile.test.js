// @vitest-environment node
//
// The suite's blind spot, found the hard way: a real syntax error inside a JSX
// file passed 1271 tests. Most files here are exercised as TEXT (source-string
// contracts) or not at all — only `npm run build` ever fed them to a parser,
// and nobody runs a build mid-lane.
//
// So: parse every source file on every test run. The parser is oxc, re-exported
// by Vite 8 as `parseSync` — the same front end the dev server and the build
// use, so anything it accepts is buildable and anything it rejects is not. It
// is native and non-emitting: the whole tree is ~40ms, cheap enough that the
// gate never becomes the reason someone skips the suite.
//
// Parsing alone would still miss the other way to ship a broken build — an
// import that no longer points at anything, or one naming a symbol the target
// stopped exporting. oxc hands back a module record with every static import
// and export for free, so the same pass checks those too.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SRC = resolve(ROOT, 'src')
const rel = (f) => relative(ROOT, f)

/** Every JS/JSX file the app ships, path-sorted. */
const sourceFiles = readdirSync(SRC, { recursive: true })
  .filter((f) => /\.jsx?$/.test(f))
  .map((f) => join(SRC, f))
  .sort()

// One parse per file, kept with its text (spans are how oxc reports both
// errors and the specifier of a dynamic import), reused by every check below.
const parsed = new Map(sourceFiles.map((file) => {
  const text = readFileSync(file, 'utf8')
  return [file, {
    text,
    result: parseSync(file, text, {
      sourceType: 'module',
      lang: file.endsWith('.jsx') ? 'jsx' : 'js',
    }),
  }]
}))

/** Relative specifier → absolute path; null for a bare package import. */
function targetOf(file, specifier) {
  return specifier.startsWith('.') ? resolve(dirname(file), specifier) : null
}

/** Every specifier a file names, static and dynamic. Dynamic imports come back
 *  as spans only, and one built from a variable has no literal to check. */
function specifiersOf(file) {
  const { text, result } = parsed.get(file)
  const out = result.module.staticImports.map((i) => i.moduleRequest.value)
  for (const e of result.module.staticExports) {
    for (const entry of e.entries) {
      if (entry.moduleRequest) out.push(entry.moduleRequest.value)
    }
  }
  for (const d of result.module.dynamicImports) {
    const raw = text.slice(d.moduleRequest.start, d.moduleRequest.end)
    if (/^(['"]).*\1$/s.test(raw)) out.push(raw.slice(1, -1))
  }
  return out
}

/** Every name a module offers, including `export { x } from './y.js'`. */
function exportedNames(result) {
  const names = new Set()
  for (const e of result.module.staticExports) {
    for (const entry of e.entries) {
      if (entry.exportName.kind === 'Name') names.add(entry.exportName.name)
      else if (entry.exportName.kind === 'Default') names.add('default')
    }
  }
  return names
}

describe('every source file compiles', () => {
  it('covers the whole shipped tree', () => {
    // a glob that quietly matched nothing would make this entire file green
    expect(sourceFiles.length).toBeGreaterThan(100)
    expect(sourceFiles.filter((f) => f.endsWith('.jsx')).length).toBeGreaterThan(20)
  })

  it('parses with the same front end the build uses', () => {
    const broken = []
    for (const [file, { result }] of parsed) {
      for (const err of result.errors) {
        // oxc's codeframe already carries file:line:col and the offending line
        broken.push(err.codeframe || `${rel(file)}: ${err.message}`)
      }
    }
    expect(broken.join('\n')).toBe('')
  })
})

describe('every import points at something real', () => {
  it('resolves every relative specifier to a file on disk', () => {
    // lazy routes are all dynamic imports (src/pages/index.jsx): a stale one
    // is a route that 404s at runtime and nowhere else
    const missing = []
    for (const file of parsed.keys()) {
      for (const spec of specifiersOf(file)) {
        const target = targetOf(file, spec)
        if (target && !existsSync(target)) missing.push(`${rel(file)} → ${spec}`)
      }
    }
    expect(missing.join('\n')).toBe('')
  })

  it('imports only names the target module still exports', () => {
    // the failure this catches: a symbol is renamed or deleted, its last
    // caller keeps importing it, and every source-string contract stays green
    // because the import LINE is still there
    const dead = []
    for (const [file, { result }] of parsed) {
      for (const imp of result.module.staticImports) {
        const target = targetOf(file, imp.moduleRequest.value)
        const targetParse = target && parsed.get(target)
        if (!targetParse) continue        // a package, or an asset import
        const offered = exportedNames(targetParse.result)
        for (const entry of imp.entries) {
          const kind = entry.importName.kind
          if (kind === 'NamespaceObject') continue
          const wanted = kind === 'Default' ? 'default' : entry.importName.name
          if (offered.has(wanted)) continue
          dead.push(`${rel(file)} imports { ${wanted} } from '${imp.moduleRequest.value}', which no longer exports it`)
        }
      }
    }
    expect(dead.join('\n')).toBe('')
  })
})
