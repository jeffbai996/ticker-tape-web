import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('public demo surface parity', () => {
  const nav = source('src/lib/nav.js')
  const pages = source('src/pages/index.jsx')
  const preview = source('src/pages/chatPreview.jsx')
  const report = source('src/components/AiReport.jsx')
  const wire = source('src/lib/wire.js')

  it('keeps AI chat in the public information architecture as a preview', () => {
    expect(nav).toContain('const CHAT_SECTION = {')
    expect(nav).toContain("id: 'chat', label: 'AI Chat'")
    expect(nav).toContain('CHAT_SECTION,')
    expect(nav).not.toContain('if (PRIVATE_BUILD) NAV.push(CHAT_SECTION)')
    expect(pages).toContain('IS_PRIVATE_BUILD ? <Chat /> : <ChatPreview />')
  })

  it('renders a complete but inert chat composer without service calls', () => {
    expect(preview).toContain('data-ai-preview')
    expect(preview).toContain('data-service-state="disabled"')
    expect(preview).toContain('<textarea')
    expect(preview).toContain('disabled')
    expect(preview).toContain('data-model-preview')
    expect(preview).toContain('data-effort-preview')
    expect(preview).not.toContain('fetch(')
    expect(preview).not.toContain('wireUrl')
  })

  it('shows disabled AI report controls instead of removing the panels', () => {
    expect(report).toContain('const serviceAvailable = IS_PRIVATE_BUILD')
    expect(report).toContain('if (!IS_PRIVATE_BUILD || !wireUrl()) return')
    expect(report).not.toContain('if (!IS_PRIVATE_BUILD && !wireUrl()) return null')
    expect(report).toContain('data-ai-service-state={serviceAvailable ? \'ready\' : \'disabled\'}')
    expect(report).toContain('disabled={!serviceAvailable || busy}')
  })

  it('keeps Fragwire synthetic by default instead of shipping a private URL', () => {
    expect(wire).toContain("const KEY = 'tape-wire-url'")
    expect(wire).toContain("return ''")
    expect(wire).toContain('const DEMO_FEED = [')
    expect(wire).not.toContain('VITE_PUBLIC_WIRE')
  })
})
