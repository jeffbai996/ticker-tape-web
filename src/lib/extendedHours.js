const LABEL_CLASS = {
  ON: 'text-accent',
  PM: 'text-[#5ba8d9]',
  AH: 'text-[#c084fc]',
}

export function extendedLabelClass(label) {
  return LABEL_CLASS[label] || 'text-ink-2'
}
