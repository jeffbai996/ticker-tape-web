import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(`${process.cwd()}/src/pages/chat.jsx`, 'utf8')

describe('chat session UI failures', () => {
  it('hydrates the active server session during boot', () => {
    expect(source).toContain('hydrateActiveThread')
    expect(source).toMatch(/await hydrateActiveThread\(\)/)
  })

  it('surfaces session failures instead of swallowing them', () => {
    expect(source).toContain("tl('session sync failed')")
    expect(source).not.toMatch(/catch \{ \/\* thread gone/)
  })
})
