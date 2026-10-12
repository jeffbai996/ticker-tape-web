// Lower the web app's stylesheet to what Chromium 85 (Tizen 6.5) can apply.
// Build-time only; nothing here ships to the TV.
//
// Tailwind v4 emits CSS for Chromium 111+. Most of it already degrades: every
// color-mix() sits behind an @supports query with a static fallback, and
// @property landed in 85. What does not degrade is rewritten here, in order:
//   1. selectors and declarations the old parser drops outright
//   2. :is() expanded into plain selector lists
//   3. @layer replaced by specificity, so layer order still decides the cascade
// findUnsupported() is the gate: the TV build fails if anything is left.

import postcss from 'postcss'
import cascadeLayers from '@csstools/postcss-cascade-layers'
import isPseudoClass from '@csstools/postcss-is-pseudo-class'

/** Split a value on whitespace that is not inside parentheses. */
function splitTopLevel(value) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of value.trim()) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (/\s/.test(ch) && depth === 0) {
      if (current) parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) parts.push(current)
  return parts
}

const TRANSFORM_PROPS = new Set(['translate', 'scale', 'rotate'])

function insetLonghands(prop, value) {
  const v = splitTopLevel(value)
  if (prop === 'inset-inline') return [['left', v[0]], ['right', v[1] ?? v[0]]]
  if (prop === 'inset-block') return [['top', v[0]], ['bottom', v[1] ?? v[0]]]
  // CSS box shorthand: 1–4 values, clockwise from top
  const [top, right = top, bottom = top, left = right] = v
  return [['top', top], ['right', right], ['bottom', bottom], ['left', left]]
}

const compatibility = {
  postcssPlugin: 'ttw-tv-compat',
  Rule(rule) {
    // :where() has no Chromium 85 equivalent; :is() does once expanded. The
    // lost zero-specificity is recovered by the layer pass that follows.
    if (rule.selector.includes(':where(') || rule.selector.includes(':focus-visible')) {
      rule.selector = rule.selector
        .replaceAll(':where(', ':is(')
        .replaceAll(':focus-visible', ':focus')
    }
  },
  Declaration(decl) {
    if (TRANSFORM_PROPS.has(decl.prop)) {
      decl.replaceWith(decl.clone({
        prop: 'transform',
        value: `${decl.prop}(${splitTopLevel(decl.value).join(',')})`,
      }))
      return
    }
    if (decl.prop === 'inset' || decl.prop === 'inset-inline' || decl.prop === 'inset-block') {
      decl.replaceWith(insetLonghands(decl.prop, decl.value)
        .map(([prop, value]) => decl.clone({ prop, value })))
      return
    }
    if (/\d[dsl]vh\b/.test(decl.value)) {
      // A TV has no collapsing browser chrome, so every viewport height is vh.
      decl.value = decl.value.replace(/(\d)[dsl]vh\b/g, '$1vh')
    }
  },
}

export function downlevelCss(css) {
  const first = postcss([compatibility]).process(css, { from: undefined }).css
  const second = postcss([isPseudoClass()]).process(first, { from: undefined }).css
  return postcss([cascadeLayers()]).process(second, { from: undefined }).css
}

const SELECTOR_CHECKS = [
  [':where(', ':where()'],
  [':is(', ':is()'],
  [':has(', ':has()'],
  [':focus-visible', ':focus-visible'],
]

const VALUE_CHECKS = [
  [/color-mix\(/, 'color-mix()'],
  [/\boklch\(/, 'oklch()'],
  [/\boklab\(/, 'oklab()'],
  [/(?<![\w-])lab\(/, 'lab()'],
  [/\d[dsl]vh\b/, 'dvh'],
]

function unsupportedValue(value) {
  const hit = VALUE_CHECKS.find(([re]) => re.test(value))
  return hit ? hit[1] : null
}

/** `a{color:#f00a;color:lab(…)}` is the fallback pattern Lightning CSS
 *  emits: the old parser drops the second declaration and keeps the first. */
function hasFallbackBefore(decl) {
  for (let prev = decl.prev(); prev; prev = prev.prev()) {
    if (prev.type === 'decl' && prev.prop === decl.prop && !unsupportedValue(prev.value)) return true
  }
  return false
}

/** Constructs Chromium 85 would drop, outside @supports and @container. */
export function findUnsupported(css) {
  const found = new Set()
  const guarded = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (p.type === 'atrule' && (p.name === 'supports' || p.name === 'container')) return true
    }
    return false
  }
  postcss.parse(css).walk((node) => {
    if (guarded(node)) return
    if (node.type === 'atrule' && node.name === 'layer') found.add('@layer')
    if (node.type === 'rule') {
      for (const [needle, label] of SELECTOR_CHECKS) {
        if (node.selector.includes(needle)) found.add(label)
      }
    }
    if (node.type === 'decl') {
      if (TRANSFORM_PROPS.has(node.prop)) found.add(node.prop)
      if (node.prop.startsWith('inset')) found.add('inset')
      const label = unsupportedValue(node.value)
      if (label && !hasFallbackBefore(node)) found.add(label)
    }
  })
  return [...found]
}
