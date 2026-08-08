import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(`${process.cwd()}/src/pages/chat.jsx`, 'utf8')

describe('chat context rail', () => {
  it('appears at the screenshot-sized desktop viewport below xl', () => {
    expect(source).toContain('chat-context-rail hidden min-[1160px]:flex')
    expect(source).not.toContain('<aside class="hidden xl:flex')
  })
})
