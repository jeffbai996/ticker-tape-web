import { useEffect, useState } from 'preact/hooks'
import { getLocale } from '../lib/i18n.js'
import { isMirrorBase } from '../lib/wire.js'
import { startVisibleClock } from '../lib/idleClock.js'

export function sessionPageUrl(base, session) {
  if (!base || isMirrorBase(base) || !/^[a-z0-9]{4,16}$/.test(session?.slug || '')) return ''
  return `${base.replace(/\/$/, '')}/session/${session.slug}`
}

export function orderAudioSessions(sessions) {
  const live = s => ['armed', 'capturing', 'stopping'].includes(s.status) ? 1 : 0
  return [...sessions].sort((a, b) => live(b) - live(a) || Number(b.starts_at || 0) - Number(a.starts_at || 0) || b.id - a.id)
}

/** Use the same player, transcript and report view as Fragwire itself. */
export function WireAudio({ endpoint }) {
  const zh = getLocale() === 'zh'
  const [sessions, setSessions] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [frameReady, setFrameReady] = useState(false)
  const [frameSlow, setFrameSlow] = useState(false)
  const direct = !!endpoint && !isMirrorBase(endpoint)
  useEffect(() => {
    if (!direct) return
    let active = true
    let controller
    let busy = false
    const refresh = async () => {
      if (busy) return
      busy = true
      controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      try {
        const resp = await fetch(`${endpoint}/api/sessions`, { signal: controller.signal })
        if (!resp.ok) throw Error(`sessions ${resp.status}`)
        const data = await resp.json()
        if (!Array.isArray(data.sessions)) throw Error('Invalid session catalog')
        if (active) { setSessions(orderAudioSessions(data.sessions)); setError(false) }
      } catch (err) { if (active) setError(true) }
      finally { clearTimeout(timer); busy = false }
    }
    refresh()
    const stop = startVisibleClock(15000, refresh)
    return () => { active = false; stop(); controller?.abort() }
  }, [endpoint, direct, retry])
  const current = sessions?.find(s => s.id === selected)
  const src = sessionPageUrl(endpoint, current)
  useEffect(() => {
    setFrameReady(false); setFrameSlow(false)
    if (!src) return
    const timer = setTimeout(() => setFrameSlow(true), 12000)
    return () => clearTimeout(timer)
  }, [src, retry])

  if (!direct) return <p class="p-4 font-mono text-[12px] text-muted">{zh ? '实时音频需要连接 Fragwire 服务。' : 'Audio sessions require a connected Fragwire service.'}</p>
  return <section data-wire-audio class="flex flex-1 min-h-0 min-w-0 gap-2 max-md:flex-col">
    <div class={`w-[250px] shrink-0 overflow-y-auto rounded-lg border border-line max-md:w-full ${current ? 'max-md:max-h-[160px]' : ''}`}>
      <div class="flex items-center justify-between p-2 border-b border-line">
        <h2 class="text-[12px] font-semibold text-ink">{zh ? '音频与文字稿' : 'Audio & transcripts'}</h2>
        <button aria-label={zh ? '刷新' : 'Refresh'} class="px-2 text-muted hover:text-accent" onClick={() => setRetry(n => n + 1)}>↻</button>
      </div>
      {error && <p role="alert" class="p-3 text-[11px] text-down">{zh ? '无法加载录音，请重试。' : 'Could not load sessions. Retry.'}</p>}
      {!sessions && !error && <p class="p-3 text-[11px] text-muted">{zh ? '加载中…' : 'Loading sessions…'}</p>}
      {sessions?.length === 0 && <p class="p-3 text-[11px] text-muted">{zh ? '暂无录音。' : 'No sessions yet.'}</p>}
      {sessions?.map(s => <button key={s.id} data-audio-session={s.id} aria-pressed={selected === s.id}
        onClick={() => setSelected(s.id)} class={`block w-full text-left p-3 border-b border-line/50 hover:bg-surface-2 ${selected === s.id ? 'bg-accent/10 border-l-2 border-l-accent' : ''}`}>
        <span class="block text-[12px] font-semibold text-ink">{s.label || s.symbol}</span>
        <span class="mt-1 flex justify-between gap-2 font-mono text-[10px] text-muted">
          <span>{new Date(s.starts_at * 1000).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}</span>
          <span class={s.status === 'capturing' ? 'text-up' : s.status === 'failed' ? 'text-down' : ''}>{s.status}</span>
        </span>
      </button>)}
    </div>
    <div class="flex flex-col min-w-0 flex-1 rounded-lg border border-line overflow-hidden">
      {!current && <p class="p-4 text-[12px] text-muted">{zh ? '选择录音，查看音频、文字稿和报告。' : 'Select a session for audio, transcript and reports.'}</p>}
      {current && <>
        <div class="flex items-center gap-3 px-3 py-2 border-b border-line text-[11px]">
          <span class="truncate flex-1 text-ink">{current.label}</span>
          <a href={src} target="_blank" rel="noopener" class="shrink-0 text-accent">{zh ? '新窗口' : 'Open separately'} ↗</a>
        </div>
        {frameSlow && !frameReady && <p role="alert" class="p-3 text-[11px] text-accent">{zh ? '录音页面未响应。请刷新或在新窗口中打开。' : 'Session page is not responding. Refresh or open separately.'}</p>}
        {src && <iframe key={`${src}:${retry}`} data-audio-player title={current.label || 'Audio session'} src={src}
          allow="autoplay" onLoad={() => setFrameReady(true)} class="w-full flex-1 min-h-[560px] border-0 bg-black" />}
      </>}
    </div>
  </section>
}
