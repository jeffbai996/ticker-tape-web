import {ChatFailure} from './ChatFailure.jsx'
import { ChatFooter } from './ChatFooter.jsx'
import { useEffect, useRef, useState } from 'preact/hooks'
import { streamChat } from '../lib/chatClient.js'
import { fetchWireChatModels, wireComplete, wireStream, wireChatAvailable } from '../lib/wirechat.js'
import { wireUrl } from '../lib/wire.js'
import { IS_PRIVATE_BUILD, IS_FAMILY_AI, IS_TV_BUILD } from '../lib/nav.js'
import { saveReport } from '../lib/archive.js'
import { getLocale, tl } from '../lib/i18n.js'
import { LENGTHS, TONES, applyAiPreferences, loadDials, saveDials } from '../lib/aidials.js'
import {pickerModels,preferredModel,migratePrivateModelDefaults} from '../lib/chatModels.js'
import { reportModelLabel } from '../lib/modelLabel.js'
import { mergeTurnUsage } from '../lib/chatMetrics.js'

// One-click AI synthesis panel: build a prompt, stream the answer, offer
// copy/download. On a wire build the writer is picked from the subscription
// lineup (localStorage-sticky). The public build renders the same panel as an
// inert preview; it never contacts either the wire or metered worker route.
const REPORT_MODEL = IS_PRIVATE_BUILD ? 'argon' : 'flash'
// pill display only — the full effort key still travels in state and requests
const EFFORT_SHORT = { medium: 'med' }
// reports don't need marathon thinking — the top tiers are chat-only
// (Jeff 2026-08-09: "drop the xhigh/max options for this")
const EFFORT_HIDDEN = new Set(['xhigh', 'max'])
const reportEfforts = (model) => (model?.efforts || []).filter((l) => !EFFORT_HIDDEN.has(l))
/** saved/default effort if still offered, else the deepest remaining tier */
const clampEffort = (model, wanted) => {
  const choices = reportEfforts(model)
  if (choices.includes(wanted)) return wanted
  if (choices.includes(model?.default_effort)) return model.default_effort
  return choices[choices.length - 1] || ''
}
const WRITER_KEY = 'report_model'
const EFFORT_KEY = 'report_effort'
const INSTRUCTIONS_KEY = 'report_instructions'

// Markdown-lite: headers + bold + bullets, enough to render a model's memo
// without a parser dependency. Anything fancier falls through as plain text.
export function MdLite({ text, streaming = false }) {
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
  const lines = (streaming ? text.trimEnd() : text).split('\n')
  const cursor = streaming ? <span data-stream-cursor aria-hidden="true" class="ai-report-cursor text-accent">▌</span> : null
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
              {cells(head).map((c, j) => <th key={j} class="text-left text-muted font-semibold uppercase text-[9.5px] tracking-wider border-b border-line px-2 py-0.5">{parts(c)}{i === lines.length - 1 && !rest.length && j === cells(head).length - 1 && cursor}</th>)}
            </tr></thead>}
            <tbody>
              {rest.map((r, ri) => <tr key={ri} class="border-b border-line/40 last:border-0">
                {cells(r).map((c, j) => <td key={j} class="px-2 py-0.5 text-ink-2 whitespace-nowrap">{parts(c)}{i === lines.length - 1 && ri === rest.length - 1 && j === cells(r).length - 1 && cursor}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    out.push(renderLine(lines[i], i, parts, i === lines.length - 1 ? cursor : null))
  }
  return out
}

function renderLine(line, i, parts, suffix = null) {
  {
    // Local models title their sections with a bold-only line rather than a
    // hash heading; rendered as inline bold, the memo had no visible sections.
    const h = line.match(/^#{1,6}\s+(.*)/) || line.match(/^\s*\*\*([^*]+)\*\*(:?)\s*$/)
    if (h) {
      return <div key={i} class="font-anth font-bold text-accent text-[12.5px] pt-2 first:pt-0 pb-0.5">{parts(h[1] + (h[2] || ''))}{suffix}</div>
    }
    if (/^\s*[-*]\s+/.test(line)) {
      return <div key={i} class="pl-4 relative"><span class="absolute left-1 text-muted">·</span>{parts(line.replace(/^\s*[-*]\s+/, ''))}{suffix}</div>
    }
    const num = line.match(/^\s*(\d+)\.\s+(.*)/)
    if (num) {
      return <div key={i} class="pl-5 relative"><span class="absolute left-1 text-muted font-mono text-[11px]">{num[1]}.</span>{parts(num[2])}{suffix}</div>
    }
    if (/^\s*---+\s*$/.test(line)) return <div key={i}><hr class="border-line my-1.5" />{suffix}</div>
    return <div key={i} class="min-h-[0.6em]">{parts(line)}{suffix}</div>
  }
}

// Each kind of control has its own look so the card reads at a glance: the
// model is a filled dropdown, tiers (effort, length) are one segmented track,
// tones are round chips, counter-case is a switch, copy and download are
// outlined buttons, and generate is the only solid one.
const DIAL_LABEL = 'font-anth text-[9px] uppercase tracking-wider text-muted'

/** Ordered tiers in one track with the chosen segment lit. */
function Segmented({ label, options, value, onPick }) {
  return (
    <span role="radiogroup" aria-label={label}
      class="h-6 inline-flex w-fit items-center gap-0.5 rounded-md border border-line bg-surface-0 px-0.5">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key}
          onClick={() => onPick(o.key)}
          class={`px-1.5 py-px rounded font-mono text-[10px] transition-colors ${
            value === o.key ? 'bg-accent text-black font-bold' : 'text-muted hover:text-ink hover:bg-surface-3'}`}>
          {tl(o.label)}
        </button>
      ))}
    </span>
  )
}

/** Tones are peers, not tiers: chips in whole rows of three, or one row of
 *  six when the card is wide, so a lone chip never wraps onto its own line. */
function ToneChips({ value, onPick }) {
  return (
    <div role="radiogroup" aria-label={tl('tone')}
      class="grid w-fit grid-cols-3 @[32rem]:grid-cols-6 gap-1">
      {TONES.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key}
          onClick={() => onPick(o.key)}
          class={`h-6 px-2.5 rounded-full border font-mono text-[10px] ${
            value === o.key ? 'border-accent text-accent bg-accent-soft' : 'border-line text-muted hover:text-ink hover:border-muted'}`}>
          {tl(o.label)}
        </button>
      ))}
    </div>
  )
}

const ICON = { width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }
const ACTION = 'h-6 inline-flex items-center gap-1 rounded border border-line px-1.5 font-anth text-[10px] font-semibold text-ink-2 hover:border-muted hover:text-ink hover:bg-surface-3'

/** The collapsed control has to say what it's set to, or the dials are
 *  invisible state that silently changes every report. */
function dialSummary(dials) {
  return `${tl(LENGTHS.find((item) => item.key === dials.length)?.label || dials.length)} · ${
    tl(TONES.find((item) => item.key === dials.tone)?.label || dials.tone)}${
    dials.disconfirm ? ` +${tl('counter-case')}` : ''}`
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
export function AiReport({ buildPrompt, filename = 'report.md', label = 'AI report', hint = '', archive = null, onBusyChange }) {
  // No model service reaches the TV, and its output is copy and download
  // controls a remote cannot use. A build constant, so hook order is stable.
  if (IS_TV_BUILD) return null
  const [text, setText] = useState('')
  // dials are shared across every generate button — set the shape once and
  // the briefing, the market read and the thesis memo all honour it
  const [dials, setDials] = useState(loadDials)
  const [showDials, setShowDials] = useState(false)
  const [busy, setBusy] = useState(false)
  const [generation, setGeneration] = useState(null)
  useEffect(()=>{onBusyChange?.(busy)},[busy,onBusyChange])
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [models, setModels] = useState([])
  const [writer, setWriter] = useState(() => {
    migratePrivateModelDefaults(IS_PRIVATE_BUILD)
    return IS_FAMILY_AI ? 'family-sonnet' : localStorage.getItem(WRITER_KEY) || (IS_PRIVATE_BUILD ? 'agy-argon' : 'agy-flash')
  })
  const [effort, setEffort] = useState(() => IS_FAMILY_AI ? 'medium' : localStorage.getItem(EFFORT_KEY) || '')
  const [instructions, setInstructions] = useState(() => localStorage.getItem(INSTRUCTIONS_KEY) || '')
  const bodyRef = useRef(null)
  const onWire = IS_FAMILY_AI ? wireChatAvailable() : !!wireUrl()
  const serviceAvailable = IS_PRIVATE_BUILD || (IS_FAMILY_AI && onWire)

  // the subscription lineup, when a wire is connected — same registry the
  // chat picker uses, so nothing here hardcodes a lineup that can drift
  useEffect(() => {
    if (!serviceAvailable || !onWire) return
    fetchWireChatModels()
      .then((available) => {
        const live=pickerModels(available,IS_PRIVATE_BUILD)
        setModels(live)
        const cur = localStorage.getItem(WRITER_KEY)
        const picked = preferredModel(live, cur, IS_PRIVATE_BUILD)
        const nextWriter = picked?.key || (IS_PRIVATE_BUILD ? 'agy-argon' : 'agy-flash')
        setWriter(nextWriter)
        localStorage.setItem(WRITER_KEY, nextWriter)
        const nextEffort = clampEffort(picked, localStorage.getItem(EFFORT_KEY))
        setEffort(nextEffort)
        if (nextEffort) localStorage.setItem(EFFORT_KEY, nextEffort)
      })
      .catch(() => {})
  }, [])

  // The wire marks a model busy while another program holds it (the local
  // model has one slot); re-read that before the menu opens and before a run.
  const refreshModels = () => fetchWireChatModels()
    .then((live) => { setModels(pickerModels(live,IS_PRIVATE_BUILD)); return live })
    .catch(() => null)

  // While generating, the panel used to push the whole page down line by
  // line — cap it and follow the tail inside its own scroller instead.
  useEffect(() => {
    if (busy) bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight)
  }, [text, busy])

  const generate = async () => {
    if (!serviceAvailable || busy) return
    const selected = models.find(m => m.key === writer)
    setGeneration({ startedAt: Date.now(), model: selected?.label || (onWire ? writer : REPORT_MODEL), effort: selected?.fixed_effort || effort, usage: null })
    setBusy(true)
    setError(null)
    const reportUsage = (round, usage) => setGeneration(current => ({ ...current, usage: mergeTurnUsage(current?.usage, round, usage) }))
    try {
      if (onWire) {
        const live = await refreshModels()
        if (live?.find((m) => m.key === writer)?.busy) {
          throw new Error(tl('This model is busy with another request. Please pick another model or try again shortly.'))
        }
      }
      setText('')
      const { system, prompt } = await buildPrompt()
      const shaped = applyAiPreferences(system, {
        dials, instructions, locale: getLocale(),
      })
      let acc = ''
      const wire = onWire
      if (wire) {
        // tailnet: subscription models only — the picked writer streams over
        // /api/chat/stream; the metered API never enters this path.
        try {
          await wireStream({
            model: writer, effort, system: shaped,
            messages: [{ role: 'user', content: prompt }],
            onDelta: (d) => { acc += d; setText(acc) },
            onUsage: usage => reportUsage(0, usage),
            onModel: model => setGeneration(current => ({ ...current, model: model.label, effort: model.effort ?? current.effort })),
          })
          // a stream can "succeed" with zero content — agy exits clean with
          // an empty answer about one run in four, and a dropped SSE pipe
          // looks identical. Both recover on the one-shot twin below.
          if (!acc.trim()) throw new Error('empty stream')
        } catch (error) {
          if (IS_FAMILY_AI || acc.trim()) throw error
          // The one-shot twin preserves the selected model and effort when a
          // stream is interrupted before it emits any content.
          const out = await wireComplete({
            model: writer, effort, system: shaped,
            messages: [{ role: 'user', content: prompt }],
            signal: AbortSignal.timeout(240_000),
          })
          if (out.usage) reportUsage(1, out.usage)
          acc = out.text
          setText(acc)
        }
        if (!acc.trim()) throw new Error(tl('model returned nothing — try again'))
      } else {
        await streamChat({
          model: REPORT_MODEL,
          system: shaped,
          messages: [{ role: 'user', content: prompt }],
          onDelta: (d) => {
            acc += d
            setText(acc)
          },
        })
      }
      if (archive) saveReport({ ...archive, text: acc })
    } catch (err) {
      setError(err.status===429?{message:String(err.message||err),status:429,code:err.code,retryAt:err.retryAt}:String(err.message||err))
    } finally {
      setGeneration(current => ({ ...current, endedAt: Date.now() }))
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

  const [modelMenu, setModelMenu] = useState(false)
  useEffect(() => {
    if (!modelMenu) return undefined
    const away = (e) => { if (!e.target.closest('[data-model-menu]')) setModelMenu(false) }
    addEventListener('pointerdown', away)
    return () => removeEventListener('pointerdown', away)
  }, [modelMenu])
  const selectedWriter = models.find((model) => model.key === writer)
  const writerBusy = !!selectedWriter?.busy
  const effortLevels = reportEfforts(selectedWriter)
  const hasDetails = !serviceAvailable || showDials || !!text || !!error

  return (
    <section data-ai-service-state={serviceAvailable ? 'ready' : 'disabled'}
      class="ai-report-card @container bg-surface-1 border border-line rounded-xl">
      {/* Rows come from .ai-report-head in main.css: narrow puts the title
          beside model+effort and the actions below; wide is one row. */}
      <header class={`ai-report-head items-center gap-x-1.5 gap-y-1.5 px-3 py-2 bg-surface-1 ${hasDetails ? 'border-b border-line-2 rounded-t-xl' : 'rounded-xl'}`}>
        <div class="min-w-0 flex items-center gap-2">
          <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase flex items-center gap-1.5 whitespace-nowrap shrink-0"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="3.5"/></svg>{tl(label)}</h2>
          {hint && <span class="font-mono text-[9.5px] text-muted normal-case tracking-normal truncate min-w-0 max-sm:hidden">{hint}</span>}
        </div>
        <div class="flex items-center gap-1.5 min-w-0">
          {!serviceAvailable && (
            <span class="h-6 inline-flex items-center rounded border border-line bg-surface-3 px-2 font-anth text-[9px] uppercase tracking-wider text-muted">
              {tl('preview only')}
            </span>
          )}
          {models.length > 0 && (
            // A CUSTOM menu, not <select>: iOS restyles native selects at
            // system size no matter what the CSS says — the picker rendered
            // huge on the iPad three fixes in a row (Jeff 2026-08-21).
            <span class="relative" data-model-menu>
              <button type="button"
                onClick={() => {
                  const open = !modelMenu
                  setModelMenu(open)
                  if (open) refreshModels()
                }}
                aria-label={tl('Report model')} title={writerBusy ? tl('Busy with another request') : tl('Report model')}
                class="h-6 inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 font-anth text-[10px] font-semibold text-ink cursor-pointer hover:bg-line">
                <span class={`max-w-[130px] truncate ${writerBusy ? 'text-muted' : ''}`}>{reportModelLabel(selectedWriter?.label || writer)}</span>

                <span aria-hidden="true" class="text-[7px] text-muted">▼</span>
              </button>
              {modelMenu && (
                <div class="absolute right-0 top-full z-40 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-line bg-surface-1/95 backdrop-blur shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
                  {models.map((m) => (
                    <button key={m.key} type="button" disabled={!!m.busy}
                      title={m.busy ? tl('Busy with another request') : undefined}
                      onClick={() => {
                        const nextEffort = clampEffort(m, effort)
                        setWriter(m.key)
                        setEffort(nextEffort)
                        localStorage.setItem(WRITER_KEY, m.key)
                        if (nextEffort) localStorage.setItem(EFFORT_KEY, nextEffort)
                        setModelMenu(false)
                      }}
                      class={`flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left font-anth text-[10px] font-semibold border-t border-line/60 first:border-0 ${
                        m.busy ? 'text-muted/50 cursor-not-allowed'
                          : m.key === writer ? 'text-accent bg-accent-soft' : 'text-ink-2 hover:bg-accent-soft hover:text-ink'}`}>
                      <span>{reportModelLabel(m.label)}</span>

                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
          {effortLevels.length > 0 && (
            <span class="h-6 flex items-center gap-0.5 bg-surface-0 border border-line rounded-md px-0.5"
                  title={tl('Thinking effort')}>
              {effortLevels.map((level) => (
                <button key={level} type="button"
                  aria-label={`${tl('Thinking effort')}: ${level}`}
                  onClick={() => {
                    setEffort(level)
                    localStorage.setItem(EFFORT_KEY, level)
                  }}
                  class={`px-[3px] py-px font-anth text-[10px] rounded transition-colors ${
                    effort === level
                      ? 'bg-accent text-black font-bold'
                      : 'text-muted hover:text-ink hover:bg-surface-3'
                  }`}
                >
                  {EFFORT_SHORT[level] || level}
                </button>
              ))}
            </span>
          )}
          {/* fixed effort is a fact about the model, not a control — plain
              text, so it does not read as one more button */}
          {selectedWriter?.fixed_effort && (
            <span class="h-6 inline-flex items-center rounded-md border border-line bg-surface-0 px-2 font-anth text-[10px] text-ink-2" title={tl('Fixed model effort')}>
              {tl('thinking')}
            </span>
          )}
        </div>
        <div class="flex items-center gap-1.5">
          {/* the dials button wears its state, not its name — the sliders
              glyph plus the current summary; the full label lives in the
              tooltip. No border: it opens a panel, it is not a choice. */}
          <button
            type="button"
            onClick={() => setShowDials((v) => !v)}
            disabled={!serviceAvailable}
            aria-expanded={showDials}
            aria-label={tl('Style & analysis')}
            title={tl('Style & analysis')}
            class={`h-6 flex items-center gap-1.5 px-2 rounded-md border border-line bg-surface-0 font-anth text-[10px] whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed ${
              showDials ? 'text-accent' : 'text-muted hover:text-ink'}`}
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h10m4 0h2M4 12h4m4 0h8M4 18h13m3 0h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="19" cy="18" r="2"/></svg>
            <span class="truncate max-w-32">{dialSummary(dials)}</span>
          </button>
          {/* label goes invisible (not removed) while busy so the button
              keeps its exact width; the spinner sits in the reserved box */}
          <button
            type="button"
            onClick={generate}
            disabled={!serviceAvailable || busy || writerBusy}
            title={writerBusy ? tl('Busy with another request') : undefined}
            class="relative h-6 inline-flex items-center font-anth text-[10px] font-bold px-2.5 rounded bg-accent text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span class={busy ? 'invisible' : ''}>{text ? tl('regenerate') : tl('generate')}</span>
            {busy && (
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
                stroke-width="3" stroke-linecap="round" class="animate-spin absolute inset-0 m-auto">
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
            )}
          </button>
        </div>
      </header>
      {!serviceAvailable && (
        <div class="px-3 py-2 font-anth text-[11px] text-muted border-t border-line/50">
          {tl('AI generation is disabled in the public demo. No request will be sent.')}
        </div>
      )}
      {showDials && (
        <div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 py-2.5 border-b border-line-2 bg-surface-1">
          <span class={DIAL_LABEL}>{tl('length')}</span>
          <Segmented label={tl('length')} options={LENGTHS} value={dials.length}
            onPick={(key) => setDials(saveDials({ ...dials, length: key }))} />
          <span class={DIAL_LABEL}>{tl('tone')}</span>
          <ToneChips value={dials.tone}
            onPick={(key) => setDials(saveDials({ ...dials, tone: key }))} />
          <button type="button" role="switch" aria-checked={dials.disconfirm}
            onClick={() => setDials(saveDials({ ...dials, disconfirm: !dials.disconfirm }))}
            class="col-start-2 w-fit inline-flex items-center gap-2 font-anth text-[11px] text-ink-2 hover:text-ink">
            <span class={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${
              dials.disconfirm ? 'bg-accent-2' : 'bg-surface-3 ring-1 ring-inset ring-line'}`}>
              <span class={`absolute top-0.5 h-2.5 w-2.5 rounded-full transition-[left] ${
                dials.disconfirm ? 'left-3 bg-black' : 'left-0.5 bg-muted'}`} />
            </span>
            {tl('include counter-case')}
          </button>
          <textarea value={instructions}
            onInput={(event) => {
              const next = event.currentTarget.value
              setInstructions(next)
              localStorage.setItem(INSTRUCTIONS_KEY, next)
            }}
            rows={1}
            aria-label={tl('Custom instructions')}
            placeholder={tl('Custom instructions')}
            class="col-span-2 block w-full min-h-10 max-h-40 resize-y [field-sizing:content] rounded-xl border border-line-2 bg-surface-2 px-3 py-2 font-anth text-[12px] leading-relaxed text-ink outline-none placeholder:text-muted/70 focus:border-accent/70"
          />
        </div>
      )}
      {(text || error) && (
        <div ref={bodyRef} class="ai-report-body px-4 sm:px-6 py-4 font-anth text-[12px] leading-relaxed select-text text-ink-2 max-h-[45vh] overflow-y-auto break-words">
          {text && <MdLite text={text} streaming={busy} />}
          {error && <div class="pt-2"><ChatFailure error={error} onRetry={generate} busy={busy} /></div>}
        </div>
      )}
      {generation && (
        <div data-report-observability class="px-3 pb-1">
          <ChatFooter model={generation.model} effort={generation.effort} usage={generation.usage}
            startedAt={generation.startedAt} endedAt={generation.endedAt} busy={busy} />
        </div>
      )}
      {/* the actions on a finished report sit with the report, not in the
          header row, so that row never has to fit five controls */}
      {text && !busy && !error && (
        <div class="flex items-center justify-end gap-1.5 px-3 py-1.5 border-t border-line/60">
          <button type="button" onClick={copy} class={ACTION}>
            {copied
              ? <svg {...ICON}><path d="m5 12 5 5 9-10" /></svg>
              : <svg {...ICON}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>}
            {copied ? tl('copied') : tl('copy')}
          </button>
          <button type="button" onClick={download} class={ACTION}>
            <svg {...ICON}><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>
            .md
          </button>
        </div>
      )}
    </section>
  )
}
