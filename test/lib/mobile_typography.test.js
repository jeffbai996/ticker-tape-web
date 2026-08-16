import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/styles/main.css', 'utf8')

describe('mobile typography floor', () => {
  it('raises only the compact text scale below the mobile breakpoint', () => {
    const start = css.indexOf('/* Mobile legibility floor')
    const rules = css.slice(start)
    expect(start).toBeGreaterThan(0)
    expect(rules).toContain('@media (max-width: 640px)')
    expect(rules).toContain('#app [class*="text-[7px]"] { font-size: 8.5px; }')
    expect(rules).toContain('#app [class*="text-[9px]"] { font-size: 10px; }')
    expect(rules).toContain('#app [class*="text-[10px]"] { font-size: 11px; }')
    expect(rules).toContain('#app [class*="text-[12px]"] { font-size: 13px; }')
    expect(rules).not.toContain('text-[13px]')
    expect(rules).not.toContain('min-width: 641px')
  })
})
