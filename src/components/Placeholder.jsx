// Every section ships as a placeholder in Phase 0 so the shell, nav, and
// deploy pipeline can be verified live before any page content exists.

export function Placeholder({ title, phase, note, badge }) {
  return (
    <div class="flex-1 flex items-center justify-center p-8">
      <div class="max-w-md w-full bg-surface-1 border border-line rounded-2xl p-8 select-text">
        <div class="flex items-center gap-3 mb-2">
          <h1 class="text-lg font-semibold text-ink">{title}</h1>
          {badge && (
            <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-line-2 text-muted">
              {badge}
            </span>
          )}
        </div>
        <p class="text-sm text-ink-2 mb-4">{note}</p>
        <p class="font-mono text-xs text-muted">arrives in phase {phase}</p>
      </div>
    </div>
  )
}
