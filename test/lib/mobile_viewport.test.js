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

  it('never inflates a control on focus — maximum-scale=1 already stops the iOS zoom', () => {
    // The focus-time 16px floor made the tapped control visibly grow (the
    // SYM field, 2026-08-22). The viewport meta pins maximum-scale=1, which
    // is what actually stops iOS magnifying on focus, so no font floor —
    // focused or always-on — is allowed back in.
    expect(html).toContain('maximum-scale=1')
    expect(css).not.toMatch(/#app :is\(input, textarea, select\)(:focus)?\s*\{/)
  })
})
