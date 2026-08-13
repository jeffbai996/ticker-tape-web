import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reportModelLabel } from '../../src/lib/modelLabel.js'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('AI generation controls', () => {
  const report = source('src/components/AiReport.jsx')

  it('uses the same clickable effort tiers as the chat composer', () => {
    expect(report).not.toContain('<select value={effort}')
    expect(report).toContain("aria-label={`${tl('Thinking effort')}: ${level}`}")
    expect(report).toContain("effort === level")
    expect(report).toContain("'bg-accent text-black font-bold'")
  })

  it('shows concise report model names without provider families', () => {
    expect(reportModelLabel('Claude Opus 5')).toBe('Opus 5')
    expect(reportModelLabel('Gemini Flash 3.6')).toBe('Flash 3.6')
    expect(reportModelLabel('GPT 5.6 Sol')).toBe('GPT 5.6 Sol')
    expect(report).toContain('{reportModelLabel(m.label)}')
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
