import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { blockText } from '../lib/chatBlocks.js'
import { fmtCcy } from '../lib/fx.js'
import { getLocale, tl } from '../lib/i18n.js'

// Renders validated chat blocks (chatBlocks.js) inside the transcript. Every
// chart keeps a table view of the same data one tap away, so the figures
// stay readable without a pointer, a screen reader or a wide screen.

const PALETTE = ['#f59e0b', '#58a6ff', '#a78bfa', '#2dd4bf', '#f472b6', '#fb923c', '#a3e635', '#94a3b8']
const DASH = '—'

export function formatBlockValue(value, unit = {}, { signed = false } = {}) {
  if (value == null || !Number.isFinite(value)) return DASH
  const digits = unit.digits ?? (unit.kind === 'index' ? 1 : unit.kind === 'pct' ? 1 : 2)
  const sign = signed && value > 0 ? '+' : ''
  if (unit.kind === 'ccy') return `${value < 0 ? '−' : sign}${fmtCcy(Math.abs(value), unit.currency, digits)}`
  // One minus glyph throughout: the currency path already prints U+2212.
  if (unit.kind === 'pct') return `${sign}${value.toFixed(digits).replace(/^-/, '−')}%`
  return `${sign}${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/^-/, '−')}`
}

const stamp = (ms) => {
  if (!Number.isFinite(ms)) return ''
  try { return new Date(ms).toLocaleString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

function useWidth(ref, fallback = 560) {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setWidth(w) }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** Multi-series line with hover/tap inspection and legend toggles. */
function LineView({ block }) {
  const host = useRef(null)
  const width = useWidth(host)
  const [hidden, setHidden] = useState(() => new Set())
  const [cursor, setCursor] = useState(null)
  const narrow = width < 420
  const H = narrow ? 170 : 210
  const pad = { l: 6, r: narrow ? 44 : 54, t: 10, b: 20 }
  const n = block.dates.length
  const visible = block.series.filter((s) => !hidden.has(s.key))
  const values = visible.flatMap((s) => s.values).filter((v) => v != null)
  const baseline = block.unit?.baseline
  const lo = Math.min(...(baseline != null ? [baseline] : []), ...values)
  const hi = Math.max(...(baseline != null ? [baseline] : []), ...values)
  const span = hi - lo || 1
  const x = (i) => pad.l + (i / (n - 1)) * (width - pad.l - pad.r)
  const y = (v) => pad.t + (1 - (v - lo) / span) * (H - pad.t - pad.b)
  const path = (vals) => {
    let d = ''
    let pen = false
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    })
    return d
  }
  const color = (key) => PALETTE[block.series.findIndex((s) => s.key === key) % PALETTE.length]
  const ticks = useMemo(() => {
    const steps = narrow ? 2 : 3
    return Array.from({ length: steps + 1 }, (_, k) => lo + (span * k) / steps)
  }, [lo, span, narrow])
  const dateTicks = n >= 3 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1]
  const locate = (event) => {
    const rect = host.current?.getBoundingClientRect()
    if (!rect || n < 2) return
    const px = event.clientX - rect.left
    const i = Math.round(((px - pad.l) / (width - pad.l - pad.r)) * (n - 1))
    setCursor(Math.max(0, Math.min(n - 1, i)))
  }
  const toggle = (key) => setHidden((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else if (next.size < block.series.length - 1) next.add(key)
    return next
  })
  const fmt = (v) => formatBlockValue(v, block.unit)
  return (
    <div class="chat-block-line">
      <div ref={host} class="relative w-full select-none touch-pan-y" style={{ height: `${H}px` }}
        onPointerMove={locate} onPointerDown={locate} onPointerLeave={() => setCursor(null)}>
        <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label={block.title} class="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" stroke-opacity="0.08" />
              <text x={width - pad.r + 4} y={y(t) + 3} fill="currentColor" fill-opacity="0.55" font-size="9" font-family="var(--font-mono)">{fmt(t)}</text>
            </g>
          ))}
          {baseline != null && baseline >= lo && baseline <= hi && (
            <line data-baseline x1={pad.l} x2={width - pad.r} y1={y(baseline)} y2={y(baseline)} stroke="currentColor" stroke-opacity="0.35" stroke-dasharray="3 4" />
          )}
          {visible.map((s) => (
            <path key={s.key} d={path(s.values)} fill="none" stroke={color(s.key)} stroke-width={visible.length === 1 ? 1.8 : 1.4} stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          ))}
          {dateTicks.map((i, k) => (
            <text key={i} x={x(i)} y={H - 5} fill="currentColor" fill-opacity="0.55" font-size="9" font-family="var(--font-mono)"
              text-anchor={k === 0 ? 'start' : k === dateTicks.length - 1 ? 'end' : 'middle'}>{block.dates[i].slice(narrow ? 5 : 0)}</text>
          ))}
          {cursor != null && (
            <g>
              <line x1={x(cursor)} x2={x(cursor)} y1={pad.t} y2={H - pad.b} stroke="currentColor" stroke-opacity="0.35" />
              {visible.map((s) => (s.values[cursor] == null ? null
                : <circle key={s.key} cx={x(cursor)} cy={y(s.values[cursor])} r="3" fill={color(s.key)} />))}
            </g>
          )}
        </svg>
        {cursor != null && (
          <div class={`chat-block-tip absolute top-1 ${x(cursor) > width / 2 ? 'left-1' : 'right-1'}`} role="status">
            <div class="text-ink">{block.dates[cursor]}</div>
            {visible.map((s) => (
              <div key={s.key} class="flex items-center gap-1.5">
                <span class="inline-block w-2 h-0.5" style={{ background: color(s.key) }} /><span class="text-ink-2">{s.label}</span>
                <span class="ml-auto pl-2 text-ink">{fmt(s.values[cursor])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {block.series.map((s) => {
          const last = [...s.values].reverse().find((v) => v != null)
          return (
            <button key={s.key} type="button" aria-pressed={!hidden.has(s.key)} onClick={() => toggle(s.key)}
              title={tl(hidden.has(s.key) ? 'Show series' : 'Hide series')}
              class={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-[10px] ${hidden.has(s.key) ? 'text-muted line-through' : 'text-ink-2'}`}>
              <span class="inline-block w-2.5 h-0.5 rounded" style={{ background: color(s.key), opacity: hidden.has(s.key) ? 0.4 : 1 }} />
              {s.label}
              <span class="text-muted">{fmt(last)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Horizontal bars: signed contributors around a zero axis, or plain weights. */
function BarsView({ block }) {
  const vals = block.items.map((i) => i.value).filter((v) => v != null)
  const max = Math.max(1e-9, ...vals.map(Math.abs))
  const fmt = (v) => formatBlockValue(v, block.unit, { signed: block.signed })
  return (
    <div class="chat-block-bars flex flex-col gap-[3px] pt-1" role="list">
      {block.items.map((item) => {
        const value = item.value
        const w = value == null ? 0 : (Math.abs(value) / max) * 100
        return (
          <div key={item.key} role="listitem" class="grid items-center gap-2 font-mono text-[10px]" style={{ gridTemplateColumns: 'minmax(0, 7.5rem) minmax(0, 1fr) auto' }}>
            <span class="truncate text-ink-2" title={item.label}>{item.label}</span>
            <span class="relative block h-[9px] rounded-[2px] bg-surface-2" aria-hidden="true">
              {value != null && (block.signed
                ? <span class={`absolute top-0 h-full rounded-[2px] ${value >= 0 ? 'bg-[var(--color-up)]' : 'bg-[var(--color-down)]'}`}
                  style={value >= 0 ? { left: '50%', width: `${w / 2}%` } : { right: '50%', width: `${w / 2}%` }} />
                : <span class="absolute left-0 top-0 h-full rounded-[2px] bg-accent/80" style={{ width: `${w}%` }} />)}
              {block.signed && <span class="absolute left-1/2 top-0 h-full w-px bg-line-2" />}
            </span>
            <span class={`text-right tabular-nums whitespace-nowrap ${value == null ? 'text-muted' : block.signed ? (value >= 0 ? 'text-up' : 'text-down') : 'text-ink'}`}>
              {fmt(value)}
              {item.pct != null && <span class="text-muted"> {formatBlockValue(item.pct, { kind: 'pct', digits: 2 }, { signed: true })}</span>}
              {value == null && item.note && <span class="text-muted"> · {item.note}</span>}
              {value != null && item.note && <span class="text-muted"> · {item.note}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function TableView({ block }) {
  const columns = block.type === 'table' ? block.columns
    : block.type === 'line' ? [{ key: 'date', label: tl('Date') }, ...block.series.map((s) => ({ key: s.key, label: s.label, align: 'right' }))]
      : [{ key: 'label', label: tl('Name') }, { key: 'value', label: tl('Value'), align: 'right' }, ...(block.items.some((i) => i.pct != null) ? [{ key: 'pct', label: '%', align: 'right' }] : []), ...(block.items.some((i) => i.note) ? [{ key: 'note', label: tl('Note') }] : [])]
  const rows = block.type === 'table' ? block.rows.map((row) => row.map((cell) => (typeof cell === 'number' ? formatBlockValue(cell, block.unit) : cell ?? DASH)))
    : block.type === 'line' ? block.dates.map((d, i) => [d, ...block.series.map((s) => formatBlockValue(s.values[i], block.unit))])
      : block.items.map((i) => [i.label, formatBlockValue(i.value, block.unit, { signed: block.signed }), ...(columns.some((c) => c.key === 'pct') ? [i.pct == null ? DASH : formatBlockValue(i.pct, { kind: 'pct', digits: 2 }, { signed: true })] : []), ...(columns.some((c) => c.key === 'note') ? [i.note || ''] : [])])
  return (
    <div class="chat-block-table max-h-64 overflow-auto pt-1">
      <table class="w-full border-collapse font-mono text-[10.5px]">
        <thead><tr>{columns.map((c) => <th key={c.key} class={`sticky top-0 bg-surface-1 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted border-b border-line ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} class="border-b border-line/40 last:border-0">
              {row.map((cell, ci) => <td key={ci} class={`px-2 py-0.5 whitespace-nowrap text-ink-2 ${columns[ci]?.align === 'right' ? 'text-right tabular-nums' : ''}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChatBlock({ block }) {
  const [view, setView] = useState(block.type === 'table' ? 'table' : 'chart')
  const chartable = block.type !== 'table'
  const asOf = stamp(block.source?.asOf)
  return (
    <figure data-chat-block={block.type} data-block-id={block.id} class="chat-block w-full min-w-0 rounded-xl border border-line bg-surface-1 px-3 py-2 text-ink">
      <figcaption class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="font-anth text-[11.5px] font-semibold leading-snug text-ink">{block.title}</div>
          {block.subtitle && <div class="font-anth text-[10px] text-muted">{block.subtitle}</div>}
        </div>
        {chartable && (
          <div class="flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-surface-2 px-0.5 py-px" role="group" aria-label={tl('View')}>
            {['chart', 'table'].map((key) => (
              <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}
                class={`rounded px-1.5 py-px font-anth text-[10px] ${view === key ? 'bg-accent text-black font-bold' : 'text-muted hover:text-ink'}`}>
                {tl(key === 'chart' ? 'Chart' : 'Table')}
              </button>
            ))}
          </div>
        )}
      </figcaption>
      {view === 'chart' && block.type === 'line' && <LineView block={block} />}
      {view === 'chart' && block.type === 'bars' && <BarsView block={block} />}
      {view === 'table' && <TableView block={block} />}
      <div class="pt-1.5 font-anth text-[9px] leading-snug text-muted">
        {(block.source?.provider || asOf) && <div>{[block.source?.provider, asOf ? `${tl('As of')} ${asOf}` : ''].filter(Boolean).join(' · ')}</div>}
        {(block.notes || []).map((note, i) => <div key={i}>{note}</div>)}
      </div>
      <span class="sr-only">{blockText(block)}</span>
    </figure>
  )
}

/** The blocks of one turn, in the order their tools ran. */
export function ChatBlocks({ blocks, class: extra = '' }) {
  if (!blocks?.length) return null
  return (
    <div data-chat-blocks class={`flex w-full max-w-[92%] flex-col gap-2 self-start ${extra}`}>
      {blocks.map((block) => <ChatBlock key={block.key || block.id} block={block} />)}
    </div>
  )
}
