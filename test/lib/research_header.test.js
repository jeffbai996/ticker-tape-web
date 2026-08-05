import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const research = readFileSync(resolve(process.cwd(), 'src/pages/research.jsx'), 'utf8')

describe('research overview header', () => {
  it('renders the top-left ticker as Anthropic Sans rather than mono data', () => {
    expect(research).toContain('<h1 class="font-tick font-bold text-lg text-ink">{symbol}</h1>')
    expect(research).not.toContain('<h1 class="font-mono font-bold text-lg text-ink">{symbol}</h1>')
  })
})
