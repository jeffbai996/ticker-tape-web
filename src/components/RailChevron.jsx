export function RailChevron({ direction }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none"
      stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true">
      <path d={direction === 'left' ? 'M9.5 3.5 6.25 8l3.25 4.5' : 'M6.5 3.5 9.75 8 6.5 12.5'} />
    </svg>
  )
}
