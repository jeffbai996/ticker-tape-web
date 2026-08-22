import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync('index.html', 'utf8')
const css = readFileSync('src/styles/main.css', 'utf8')

describe('mobile viewport zoom guard', () => {
  it('disables page pinch zoom while preserving one-finger panning', () => {
    expect(html).toContain('initial-scale=1')
    expect(html).toContain('minimum-scale=1')
    expect(html).toContain('maximum-scale=1')
    expect(html).toContain('user-scalable=no')
    expect(html).toContain('viewport-fit=cover')
    expect(css).toMatch(/html, body\s*\{[\s\S]*touch-action:\s*pan-x pan-y;/)
  })

  it('pins the app to the visual viewport instead of allowing a wider canvas', () => {
    expect(css).toMatch(/html, body\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/)
    expect(css).toMatch(/html\s*\{[\s\S]*-webkit-text-size-adjust:\s*100%;[\s\S]*text-size-adjust:\s*100%;/)
    expect(css).toMatch(/#app\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;/)
  })

  it('keeps form controls above the iOS focus-zoom threshold — at focus, not always', () => {
    // iOS decides the zoom when a control TAKES focus, so the floor only
    // needs to hold then. The always-on form of this rule blew every input
    // and select up to 16px on the phone (2026-08-22); the guard now pins the
    // focus-scoped rule and refuses the always-on one.
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*#app :is\(input, textarea, select\):focus\s*\{[\s\S]*font-size:\s*16px !important;/)
    expect(css).not.toMatch(/#app :is\(input, textarea, select\)\s*\{/)
  })
})
