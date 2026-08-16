import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/StatusBar.jsx', 'utf8')

describe('status bar responsive labels', () => {
  it('shows S&P only on mobile and retains S&P 500 on desktop', () => {
    expect(source).toContain("label === 'S&P 500'")
    expect(source).toContain('class="md:hidden">S&P</span>')
    expect(source).toContain('class="max-md:hidden">{tl(label)}</span>')
  })
})
