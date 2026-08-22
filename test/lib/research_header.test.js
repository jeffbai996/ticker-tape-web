import { describe, expect, it } from 'vitest'
import { researchSource } from './researchSource.js'

// the page is a directory now — the contract follows the markup, not the path
const research = researchSource()

describe('research overview header', () => {
  it('renders the top-left ticker as Anthropic Sans rather than mono data', () => {
    expect(research).toContain('<h1 class="font-tick font-bold text-lg text-ink shrink-0">{symbol}</h1>')
    expect(research).not.toContain('<h1 class="font-mono font-bold text-lg text-ink">{symbol}</h1>')
  })

  it('scrolls the full mobile identity while pinning the live quote lane', () => {
    expect(research).toContain('data-research-header')
    expect(research).toContain('data-research-identity-scroll')
    expect(research).toContain('overflow-x-auto no-scrollbar')
    expect(research).toContain('data-research-company-name')
    // the company line renders the display name — the exchange's Chinese
    // name for an HK / mainland listing in zh, the provider's otherwise
    expect(research).toContain('text={displayName}')
    expect(research).toContain('data-research-quote-cluster')
    expect(research).toContain('shrink-0 whitespace-nowrap')
    expect(research).toContain('max-sm:hidden price-grouped"><FlashMetric value={q.change}')
    expect(research).not.toContain('hidden @min-[1180px]:block @min-[1180px]:flex-1')
  })

  it('bounds the primary chart controls while leaving indicators scrollable', () => {
    expect(research).toContain('class="flex items-center gap-1 px-1 pb-1 select-none flex-nowrap w-full max-w-full overflow-x-auto no-scrollbar"')
    expect(research).toContain('class="inline-flex items-center gap-1 flex-nowrap shrink-0"')
    expect(research).toContain('<span class="w-0.5 shrink-0" />\n                <button onClick={() => onExt?.(!ext)}')
    expect(research).not.toContain('<span class="w-2 shrink-0" />\n                <button onClick={() => onExt?.(!ext)}')
    expect(research).toContain("ext ? 'border-accent/70 text-accent bg-surface-3' : 'border-line-2/70 bg-surface-3 text-ink-2 hover:text-ink'")
    expect(research).toContain('class="flex gap-1 px-1 pb-1.5 select-none flex-nowrap overflow-x-auto no-scrollbar"')
  })

  it('renders the numbered research tabs as bordered buttons', () => {
    expect(research).toContain('px-2.5 py-1 rounded-md border')
    expect(research).toContain('border-accent-2 text-accent-2 bg-accent-2-soft')
    expect(research).toContain('border-white/25 text-muted hover:text-ink hover:bg-surface-3')
    expect(research).not.toContain('border-b-2 border-accent text-accent')
  })
})
