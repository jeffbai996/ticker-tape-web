import { useEffect, useRef, useState } from 'preact/hooks'
import { streamChat } from '../lib/chatClient.js'
import { fetchWireChatModels, wireStream } from '../lib/wirechat.js'
import { wireUrl } from '../lib/wire.js'
import { IS_PRIVATE_BUILD } from '../lib/nav.js'
import { saveReport } from '../lib/archive.js'
import { tl } from '../lib/i18n.js'

// One-click AI synthesis panel: build a prompt, stream the answer, offer
// copy/download. On a wire build the writer is picked from the subscription
// lineup (localStorage-sticky); the keyless public path keeps the cheapest
// worker model.
const REPORT_MODEL = 'flash'
const WRITER_KEY = 'report_model'

// Markdown-lite: headers + bold + bullets, enough to render a model's memo
// without a parser dependency. Anything fancier falls through as plain text.
export function MdLite({ text }) {
  // inline pass: **bold**, `code`, [label](url) — split order matters, bold
  // first so a bold segment can still carry code inside it is NOT supported
  // (flat, single-level — models rarely nest these in chat answers)
  const parts = (s) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/).map((seg, j) => {
      if (seg.startsWith('**') && seg.endsWith('**')) {
        return <b key={j} class="text-ink font-semibold">{seg.slice(2, -2)}</b>
      }
      if (seg.startsWith('`') && seg.endsWith('`')) {
        return <code key={j} class="font-mono text-[0.92em] text-accent-2 bg-surface-2 rounded px-1">{seg.slice(1, -1)}</code>
      }
      const link = seg.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
      if (link) {
        return <a key={j} href={link[2]} target="_blank" rel="noopener" class="text-accent hover:underline">{link[1]}</a>
      }
      return seg
    })

  // block pass with table grouping: consecutive |-rows render as a real table
  const lines = text.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const isRow = (l) => /^\s*\|.*\|\s*$/.test(l)
    if (isRow(lines[i])) {
      const rows = []
      while (i < lines.length && isRow(lines[i])) rows.push(lines[i++])
      i--
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const body = rows.filter((r) => !/^[\s|:-]+$/.test(r))
      const [head, ...rest] = body
      out.push(
        <div key={`t${i}`} class="overflow-x-auto my-1.5">
          <table class="font-mono text-[11px] border-collapse">
            {head && <thead><tr>
              {cells(head).map((c, j) => <th key={j} class="text-left text-muted font-semibold uppercase text-[9.5px] tracking-wider border-b border-line px-2 py-0.5">{parts(c)}</th>)}
            </tr></thead>}
            <tbody>
              {rest.map((r, ri) => <tr key={ri} class="border-b border-line/40 last:border-0">
                {cells(r).map((c, j) => <td key={j} class="px-2 py-0.5 text-ink-2 whitespace-nowrap">{parts(c)}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    out.push(renderLine(lines[i], i, parts))
  }
  return out
}

function renderLine(line, i, parts) {
  {
    const h = line.match(/^#{1,4}\s+(.*)/)
    if (h) return <div key={i} class="font-anth font-bold text-accent text-[12.5px] pt-2 pb-0.5">{parts(h[1])}</div>
    if (/^\s*[-*]\s+/.test(line)) {
      return <div key={i} class="pl-4 relative"><span class="absolute left-1 text-muted">·</span>{parts(line.replace(/^\s*[-*]\s+/, ''))}</div>
    }
    const num = line.match(/^\s*(\d+)\.\s+(.*)/)
    if (num) {
      return <div key={i} class="pl-5 relative"><span class="absolute left-1 text-muted font-mono text-[11px]">{num[1]}.</span>{parts(num[2])}</div>
    }
    if (/^\s*---+\s*$/.test(line)) return <hr key={i} class="border-line my-1.5" />
    return <div key={i} class="min-h-[0.6em]">{parts(line)}</div>
  }
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
  const [models, setModels] = useState([])
  const [writer, setWriter] = useState(() => localStorage.getItem(WRITER_KEY) || 'agy-flash')
  const bodyRef = useRef(null)

  // the subscription lineup, when a wire is connected — same registry the
  // chat picker uses, so nothing here hardcodes a lineup that can drift
  useEffect(() => {
    if (!wireUrl()) return
    fetchWireChatModels()
      .then((live) => {
        setModels(live)
        const cur = localStorage.getItem(WRITER_KEY)
        if (!live.some((m) => m.key === cur)) setWriter(live[0]?.key || 'agy-flash')
      })
      .catch(() => {})
  }, [])

  // While generating, the panel used to push the whole page down line by
  // line — cap it and follow the tail inside its own scroller instead.
  useEffect(() => {
    if (busy) bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight)
  }, [text, busy])

  // Reports need a brain: the wire router on the private build (or a
  // configured endpoint). The public keyless build hides the feature.
  if (!IS_PRIVATE_BUILD && !wireUrl()) return null

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
        // tailnet: subscription models only — the picked writer streams over
        // /api/chat/stream; the metered API never enters this path.
        try {
          await wireStream({
            model: writer, effort: '', system,
            messages: [{ role: 'user', content: prompt }],
            onDelta: (d) => { acc += d; setText(acc) },
          })
        } catch {
          // older fragwire / stream hiccup — the one-shot router still works
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
        }
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
          {models.length > 0 && (
            <select
              value={writer}
              onChange={(e) => {
                setWriter(e.currentTarget.value)
                localStorage.setItem(WRITER_KEY, e.currentTarget.value)
              }}
              title={tl('report model')}
              class="bg-surface-3 border border-line rounded px-1 py-0.5 font-anth text-[10px] text-ink-2 outline-none cursor-pointer max-w-[130px]"
            >
              {models.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          )}
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
        <div ref={bodyRef} class="px-3 py-2 font-anth text-[13px] leading-relaxed select-text text-ink-2 max-h-[45vh] overflow-y-auto">
          {error ? <span class="font-mono text-[11px] text-down">{error}</span> : <MdLite text={text} />}
          {busy && <span class="text-accent">▌</span>}
        </div>
      )}
    </section>
  )
}
