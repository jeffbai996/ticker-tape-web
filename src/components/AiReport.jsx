import { useState } from 'preact/hooks'
import { streamChat } from '../lib/chatClient.js'
import { tl } from '../lib/i18n.js'

// One-click AI synthesis panel: build a prompt, stream the answer, offer
// copy/download. Hardwired to the cheapest model — reports are volume, not
// frontier reasoning; the chat page has the full model picker.
const REPORT_MODEL = 'flash'

// Markdown-lite: headers + bold + bullets, enough to render a model's memo
// without a parser dependency. Anything fancier falls through as plain text.
export function MdLite({ text }) {
  return text.split('\n').map((line, i) => {
    const h = line.match(/^#{1,4}\s+(.*)/)
    const parts = (s) =>
      s.split(/(\*\*[^*]+\*\*)/).map((seg, j) =>
        seg.startsWith('**') && seg.endsWith('**')
          ? <b key={j} class="text-ink font-semibold">{seg.slice(2, -2)}</b>
          : seg)
    if (h) return <div key={i} class="font-mono font-bold text-accent text-[12px] pt-2 pb-0.5">{parts(h[1])}</div>
    if (/^\s*[-*]\s+/.test(line)) {
      return <div key={i} class="pl-4 relative"><span class="absolute left-1 text-muted">·</span>{parts(line.replace(/^\s*[-*]\s+/, ''))}</div>
    }
    if (/^\s*---+\s*$/.test(line)) return <hr key={i} class="border-line my-1.5" />
    return <div key={i} class="min-h-[0.6em]">{parts(line)}</div>
  })
}

/**
 * props:
 *  buildPrompt: async () => ({system, prompt}) — assembled at click time so
 *    the report always reflects the data currently on screen
 *  filename: download name for the .md
 *  label: button text (defaults to "AI report")
 */
export function AiReport({ buildPrompt, filename = 'report.md', label = 'AI report' }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setText('')
    try {
      const { system, prompt } = await buildPrompt()
      let acc = ''
      await streamChat({
        model: REPORT_MODEL,
        system,
        messages: [{ role: 'user', content: prompt }],
        onDelta: (d) => {
          acc += d
          setText(acc)
        },
      })
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard needs a secure context */ }
  }

  const download = () => {
    const blob = new Blob([text], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="flex items-center gap-2 px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">✨ {tl(label)}</h2>
        <div class="ml-auto flex items-center gap-2">
          {text && !busy && (
            <>
              <button onClick={copy} class="font-mono text-[10px] text-muted hover:text-ink">
                {copied ? '✓' : tl('copy')}
              </button>
              <button onClick={download} class="font-mono text-[10px] text-muted hover:text-ink">.md</button>
            </>
          )}
          <button
            onClick={generate}
            disabled={busy}
            class="font-mono text-[10px] px-2.5 py-0.5 rounded border border-accent text-accent bg-accent-soft hover:bg-accent hover:text-black disabled:opacity-40"
          >
            {busy ? '…' : text ? tl('regenerate') : tl('generate')}
          </button>
        </div>
      </header>
      {(text || error) && (
        <div class="px-3 py-2 text-[13px] leading-relaxed select-text text-ink-2">
          {error ? <span class="font-mono text-[11px] text-down">{error}</span> : <MdLite text={text} />}
          {busy && <span class="text-accent">▌</span>}
        </div>
      )}
    </section>
  )
}
