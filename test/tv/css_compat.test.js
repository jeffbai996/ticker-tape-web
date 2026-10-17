// @vitest-environment node
import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import parser from 'postcss-selector-parser'
import { selectorSpecificity, compare } from '@csstools/selector-specificity'
import { downlevelCss, findUnsupported } from '../../tv/build/cssCompat.js'

/** Specificity of the first selector of the first rule whose selector
 *  contains `needle`, after the pass. */
function specificityOf(css, needle) {
  let found = null
  postcss.parse(css).walkRules((rule) => {
    if (found || !rule.selector.includes(needle)) return
    parser((root) => { found = selectorSpecificity(root.first) }).processSync(rule.selector)
  })
  if (!found) throw new Error(`no rule matching ${needle}`)
  return found
}

function decls(css, selector) {
  const out = {}
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector !== selector) return
    rule.walkDecls((d) => { out[d.prop] = d.value })
  })
  return out
}

describe('cascade layers on Chromium 85', () => {
  const css = `
    @layer theme, base, components, utilities;
    @layer base { input[type=text] { color: red } }
    @layer components { .card { color: green } }
    @layer utilities { .text-blue { color: blue } }
    .unlayered { color: black }
  `

  it('removes every @layer block', () => {
    expect(downlevelCss(css)).not.toMatch(/@layer/)
  })

  it('lets a later layer win over a more specific selector in an earlier layer', () => {
    const out = downlevelCss(css)
    expect(compare(specificityOf(out, '.text-blue'), specificityOf(out, 'input[type=text]'))).toBeGreaterThan(0)
    expect(compare(specificityOf(out, '.text-blue'), specificityOf(out, '.card'))).toBeGreaterThan(0)
  })

  it('lets unlayered rules win over every layer', () => {
    const out = downlevelCss(css)
    expect(compare(specificityOf(out, '.unlayered'), specificityOf(out, '.text-blue'))).toBeGreaterThan(0)
  })
})

describe('selectors Chromium 85 cannot parse', () => {
  it('expands :where() and :is() into plain selector lists', () => {
    const out = downlevelCss(':where(select:is([multiple],[size])) optgroup{font-weight:bolder}')
    expect(out).not.toMatch(/:where\(|:is\(/)
    expect(out).toContain('select[multiple] optgroup')
    expect(out).toContain('select[size] optgroup')
  })

  it('treats :focus-visible as :focus, since a remote only moves focus by key', () => {
    const out = downlevelCss('button:focus-visible{outline:1px solid red}')
    expect(out).toContain('button:focus{')
    expect(out).not.toContain('focus-visible')
  })
})

describe('properties Chromium 85 cannot apply', () => {
  it('rewrites individual transform properties to transform functions', () => {
    const out = downlevelCss(`
      .a{translate:var(--x) var(--y)}
      .b{translate:10px}
      .c{scale:var(--sx) var(--sy)}
      .d{rotate:-90deg}
    `)
    expect(decls(out, '.a')).toEqual({ transform: 'translate(var(--x),var(--y))' })
    expect(decls(out, '.b')).toEqual({ transform: 'translate(10px)' })
    expect(decls(out, '.c')).toEqual({ transform: 'scale(var(--sx),var(--sy))' })
    expect(decls(out, '.d')).toEqual({ transform: 'rotate(-90deg)' })
  })

  it('leaves custom properties that merely contain those names alone', () => {
    const out = downlevelCss('.a{--tw-translate-x:1px;--tw-inset-ring-color:red}')
    expect(decls(out, '.a')).toEqual({ '--tw-translate-x': '1px', '--tw-inset-ring-color': 'red' })
  })

  it('expands inset shorthands into physical offsets', () => {
    const out = downlevelCss(`
      .a{inset:calc(var(--spacing) * 0)}
      .b{inset:1px 2px}
      .c{inset-inline:0}
      .d{inset-block:4px}
    `)
    expect(decls(out, '.a')).toEqual({
      top: 'calc(var(--spacing) * 0)', right: 'calc(var(--spacing) * 0)',
      bottom: 'calc(var(--spacing) * 0)', left: 'calc(var(--spacing) * 0)',
    })
    expect(decls(out, '.b')).toEqual({ top: '1px', right: '2px', bottom: '1px', left: '2px' })
    expect(decls(out, '.c')).toEqual({ left: '0', right: '0' })
    expect(decls(out, '.d')).toEqual({ top: '4px', bottom: '4px' })
  })

  it('reads dynamic viewport units as plain vh', () => {
    const out = downlevelCss('.a{height:100dvh;top:calc(50svh - 1rem);min-height:10lvh}')
    expect(decls(out, '.a')).toEqual({ height: '100vh', top: 'calc(50vh - 1rem)', 'min-height': '10vh' })
  })
})

describe('the unsupported-construct gate', () => {
  it('passes the downlevelled output of a stylesheet that needed every rewrite', () => {
    const out = downlevelCss(`
      @layer base{:where(a){color:red}}
      @layer utilities{.x:focus-visible{translate:1px;inset:0;height:1dvh}}
    `)
    expect(findUnsupported(out)).toEqual([])
  })

  it('reports what Chromium 85 would drop', () => {
    const found = findUnsupported('@layer base{a{color:red}} .b:where(.c){x:1} .d:focus-visible{x:1} .e{translate:1px}')
    expect(found).toEqual(expect.arrayContaining(['@layer', ':where()', ':focus-visible', 'translate']))
  })

  it('ignores constructs behind a feature query and container queries', () => {
    const css = '@supports (color:color-mix(in lab, red, red)){.a{color:color-mix(in oklab, red 50%, blue)}} @container (width>=560px){.b{color:red}}'
    expect(findUnsupported(css)).toEqual([])
  })

  it('reports color-mix outside a feature query', () => {
    expect(findUnsupported('.a{color:color-mix(in oklab, red 50%, blue)}')).toEqual(['color-mix()'])
  })

  it('accepts a modern value that follows a supported fallback for the same property', () => {
    expect(findUnsupported('.a{border-color:#00c8ff80;border-color:lab(74% -28 -39/.5)}')).toEqual([])
  })

  it('reports a modern value with no fallback before it', () => {
    expect(findUnsupported('.a{border-color:lab(74% -28 -39/.5);border-color:#00c8ff80}')).toEqual(['lab()'])
  })
})
