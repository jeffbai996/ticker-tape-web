import { useState } from 'preact/hooks'
import { streamChat } from '../lib/chatClient.js'
import { wireUrl } from '../lib/wire.js'
import { saveReport } from '../lib/archive.js'
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
    const num = line.match(/^\s*(\d+)\.\s+(.*)/)
    if (num) {
      return <div key={i} class="pl-5 relative"><span class="absolute left-1 text-muted font-mono text-[11px]">{num[1]}.</span>{parts(num[2])}</div>
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
 *  archive: optional {kind: 'briefing'|'memo', symbol?, title} — when set,
 *    every completed generation auto-saves to the report archive
 */
export function AiReport({ buildPrompt, filename = 'report.md', label = 'AI report', hint = '', archive = null }) {
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
      const wire = wireUrl()
      if (wire) {
        // tailnet: the fragwire router writes it — claude subscription →
        // local model → metered API last. $0 marginal, telemetered.
        const resp = await fetch(`${wire.replace(/\/$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system, prompt,
            purpose: (archive?.kind || 'ttw-report') }),
          signal: AbortSignal.timeout(240_000),
        })
        const out = await resp.json()
        if (!out.ok) throw new Error(out.error || 'wire generation failed')
        acc = out.text
        setText(acc)
      } else {
        await streamChat({
          model: REPORT_MODEL,
          system,
          messages: [{ role: 'user', content: prompt }],
          onDelta: (d) => {
            acc += d
            setText(acc)
          },
        })
      }
      if (archive) saveReport({ ...archive, text: acc })
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
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase flex items-center gap-1.5"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="3.5"/></svg>{tl(label)}</h2>
        {hint && <span class="font-mono text-[9.5px] text-muted normal-case tracking-normal">{hint}</span>}
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
