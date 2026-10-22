import {tl} from '../lib/i18n.js'
import claudeLogo from '../assets/claude.svg'
import qwenLogo from '../assets/qwen.svg'
import geminiLogo from '../assets/gemini.svg'
import openaiLogo from '../assets/openai.svg'
import {modelProvider} from '../lib/chatModels.js'
import { useEffect, useState } from 'preact/hooks'
import { chatMetrics, metricDuration } from '../lib/chatMetrics.js'

const PROVIDERS={claude:[claudeLogo,'#d97757'],qwen:[qwenLogo,'#8b7bf4'],gemini:[geminiLogo,'#58a6ff'],openai:[openaiLogo,'#d8dee9']}
// The footer names the provider; the exact model and effort are on hover.
const PROVIDER_NAMES={claude:'Claude',gemini:'Gemini',qwen:'Qwen',openai:'GPT'}

const paths = {
  model: 'm8 1 6 3.5v7L8 15l-6-3.5v-7L8 1Zm-6 3.5L8 8l6-3.5M8 8v7M5 2.8l6 3.5',
  clock: 'M8 4v4l3 2',
  speed: 'M2.4 12a6 6 0 1 1 11.2 0M8 9l3-4M4 12h8',
  think: 'M6 12h4M6.5 14h3M8 1.5a4 4 0 0 0-2.5 7.1L6 10h4l.5-1.4A4 4 0 0 0 8 1.5Z',
}
function Icon({ kind }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
    {kind === 'clock' && <circle cx="8" cy="8" r="6" />}<path d={paths[kind]} />
  </svg>
}

export function ChatFooter({ model, effort, usage, startedAt, endedAt, busy = false }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!busy) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [busy, startedAt])
  const m = chatMetrics({ usage, startedAt, endedAt, now })
  const provider=modelProvider(model),mark=PROVIDERS[provider]
  const modelName=PROVIDER_NAMES[provider] || String(model || '')
  const effortName=effort === 'medium' ? 'med' : effort
  const tokens = (n) => n == null ? '—' : n.toLocaleString('en-US')
  return <div class="chat-token-footer" aria-label={tl('Response statistics')} data-live={busy || undefined}>
    <span class="chat-token-model" title={effort ? `${model} · ${effortName}` : model}>
      {mark
        ? <span class="chat-token-provider" data-provider={provider} aria-hidden="true" style={{maskImage:`url("${mark[0]}")`,WebkitMaskImage:`url("${mark[0]}")`,backgroundColor:mark[1]}} />
        : <Icon kind="model" />}<span class="chat-token-model-name"><span class="chat-model-short">{modelName || tl('Model')}</span><span class="chat-model-full">{modelName || tl('Model')}</span></span>
      {effort && effort !== 'none' && <span class="chat-token-effort" title={`${tl('Reasoning')}: ${effortName}`}><Icon kind="think" /></span>}
    </span>
    <span class="chat-token-stat chat-token-usage" title={tl('Largest reported input context; output summed across model calls')}>
      <span class="chat-token-input"><span class="chat-token-arrow">↑</span>{tokens(m.input)}</span><span class="chat-token-output"><span class="chat-token-arrow">↓</span>{tokens(m.output)}</span><span>tok</span>
    </span>
    <span class="chat-token-stat" title={tl('Turn elapsed time')}><Icon kind="clock" />{metricDuration(m.elapsed)}</span>
    <span class="chat-token-stat chat-token-throughput" title={tl(m.rateSource==='inference' ? 'Reported output tokens per provider inference second, including prompt processing and reasoning; excluding application tool time' : 'Provider-reported generation speed, excluding prompt processing and tool time')}><Icon kind="speed" />{m.rate == null ? '—' : m.rate.toFixed(1)} tok/s</span>
  </div>
}
