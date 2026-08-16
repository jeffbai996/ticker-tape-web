import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = fs.readFileSync('src/pages/dashboard.jsx', 'utf8')

describe('watchlist row: touch identity', () => {
  it('keeps the ticker passive so the first tap follows the row link', () => {
    expect(src).toContain(
      '<span class="tui-company-symbol shrink-0">{symbol}</span>')
    expect(src).not.toContain('onIdentityTap')
    expect(src).not.toContain('onReveal?.(symbol)')
  })

  it('hides the name until the container has spare width', () => {
    expect(src).toContain(
      'data-inline-name class="hidden @min-[545px]:block @min-[820px]:hidden min-w-0"')
    expect(src).not.toContain('tui-company-name-swap')
  })
})
