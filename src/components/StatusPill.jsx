// One pill, four tones. The Thesis Watcher needs FIRED / CLEAR / NO DATA /
// AWAITING to be unmistakable at a glance, and the ad hoc class maps that grew
// around each call site kept drifting apart. Tones are semantic, not colours:
// callers say what a thing IS, the pill decides how loud it looks.

const TONES = {
  // a fired breaker is the one thing on this page that shouts
  fired: 'bg-down text-black border-down',
  clear: 'bg-up/15 text-up border-up/40',
  // amber: a detector that cannot see is a risk, not a neutral state
  warn: 'bg-accent-soft text-accent border-accent/40',
  muted: 'bg-surface-3 text-muted border-line',
  accent: 'bg-accent text-black border-accent',
}

const SIZES = {
  xs: 'text-[9px] px-1.5 py-[1px]',
  sm: 'text-[10px] px-2 py-[1px]',
}

export function StatusPill({ tone = 'muted', size = 'xs', title, children, class: cls = '' }) {
  return (
    <span title={title}
      class={`inline-flex items-center gap-1 rounded border font-mono font-bold uppercase tracking-wider whitespace-nowrap ${
        SIZES[size] || SIZES.xs} ${TONES[tone] || TONES.muted} ${cls}`}>
      {children}
    </span>
  )
}

export default StatusPill
