import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('AI generation controls', () => {
  const report = source('src/components/AiReport.jsx')

  it('uses the same clickable effort tiers as the chat composer', () => {
    expect(report).not.toContain('<select value={effort}')
    expect(report).toContain("aria-label={`${tl('Thinking effort')}: ${level}`}")
    expect(report).toContain("effort === level")
    expect(report).toContain("'bg-accent text-black font-bold'")
  })
})

describe('chat composer shortcuts', () => {
  const chat = source('src/pages/chat.jsx')

  it('shows spaced key chords plus prompt recall and command hints', () => {
    expect(chat).toContain('composer-shortcuts')
    expect(chat).toContain('<kbd class="text-ink-2">⇧</kbd>')
    expect(chat).toContain('<span aria-hidden="true">+</span>')
    expect(chat).toContain("tl('recall')")
    expect(chat).toContain("tl('commands')")
  })
})
