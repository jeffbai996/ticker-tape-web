// Session labels get their own hues so a glance separates them: overnight is
// a light lemon (the UI accent is amber, and ON sitting in accent read as
// chrome rather than data — Jeff 2026-08-05), pre-market blue, after-hours
// purple.
const LABEL_CLASS = {
  ON: 'text-[#fde047]',
  PM: 'text-[#5ba8d9]',
  AH: 'text-[#c084fc]',
}

export function extendedLabelClass(label) {
  return LABEL_CLASS[label] || 'text-ink-2'
}
