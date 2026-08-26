import { describe, expect, it } from 'vitest'
import { privateFontHtml } from '../../vite.config.js'

describe('private UI font build contract', () => {
  it('keeps the licensed face entirely out of the public document', () => {
    expect(privateFontHtml(false)).toBe('')
  })

  it('adds a relative face and UI override only to private-family documents', () => {
    const html = privateFontHtml(true)

    expect(html).toContain('@font-face')
    expect(html).toContain('font-family: "Anthropic Sans"')
    expect(html).toContain('url("./fonts/AnthropicSansVariable-TextRegular.woff2")')
    expect(html).toContain('--font-sans: "Anthropic Sans"')
  })
})
