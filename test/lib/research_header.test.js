import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const research = readFileSync(resolve(process.cwd(), 'src/pages/research.jsx'), 'utf8')

describe('research overview header', () => {
  it('renders the top-left ticker as Anthropic Sans rather than mono data', () => {
    expect(research).toContain('<h1 class="font-tick font-bold text-lg text-ink">{symbol}</h1>')
    expect(research).not.toContain('<h1 class="font-mono font-bold text-lg text-ink">{symbol}</h1>')
  })

  it('bounds the primary chart controls while leaving indicators scrollable', () => {
    expect(research).toContain('class="flex items-center gap-1 px-1 pb-1 select-none flex-nowrap w-full max-w-full overflow-x-auto no-scrollbar"')
    expect(research).toContain('class="inline-flex items-center gap-1 flex-nowrap shrink-0"')
    expect(research).toContain('<span class="w-0.5 shrink-0" />\n                <button onClick={() => onExt?.(!ext)}')
    expect(research).not.toContain('<span class="w-2 shrink-0" />\n                <button onClick={() => onExt?.(!ext)}')
    expect(research).toContain("ext ? 'border-accent/70 text-accent bg-surface-3' : 'border-line-2/70 bg-surface-3 text-ink-2 hover:text-ink'")
    expect(research).toContain('class="flex gap-1 px-1 pb-1.5 select-none flex-nowrap overflow-x-auto no-scrollbar"')
  })
})
