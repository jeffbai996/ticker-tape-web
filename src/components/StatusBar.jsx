import { useEffect, useState } from 'preact/hooks'

function marketState(now) {
  // NYSE regular session in ET; a coarse open/closed pill until the real
  // market-state feed lands in Phase 1 (holidays, pre/post sessions).
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  const mins = et.getHours() * 60 + et.getMinutes()
  const open = day >= 1 && day <= 5 && mins >= 570 && mins < 960
  return open ? { label: 'MARKET OPEN', live: true } : { label: 'MARKET CLOSED', live: false }
}

export function StatusBar() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const state = marketState(now)
  const clock = now.toLocaleTimeString('en-US', {
    hour12: false,
    timeZone: 'America/New_York',
  })

  return (
    <header class="flex items-center gap-3 px-4 h-11 shrink-0 bg-surface-1 border-b border-line">
      <span class="font-mono font-bold text-ink tracking-tight">ticker-tape</span>
      <span class="text-muted text-xs hidden sm:inline">public market showcase</span>

      <span class="ml-auto flex items-center gap-2 text-xs font-mono">
        <span
          class={`inline-block w-1.5 h-1.5 rounded-full ${state.live ? 'bg-up' : 'bg-muted'}`}
        />
        <span class={state.live ? 'text-up' : 'text-muted'}>{state.label}</span>
      </span>

      <span class="font-mono text-xs text-ink-2">{clock} ET</span>
    </header>
  )
}
