import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync('index.html', 'utf8')
const css = readFileSync('src/styles/main.css', 'utf8')

describe('mobile viewport zoom guard', () => {
  it('disables page pinch zoom while preserving one-finger panning', () => {
    expect(html).toContain('maximum-scale=1')
    expect(html).toContain('user-scalable=no')
    expect(html).toContain('viewport-fit=cover')
    expect(css).toMatch(/html, body\s*\{[\s\S]*touch-action:\s*pan-x pan-y;/)
  })

  it('keeps form controls above the iOS focus-zoom threshold', () => {
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*#app :is\(input, textarea, select\)\s*\{[\s\S]*font-size:\s*16px !important;/)
  })
})
