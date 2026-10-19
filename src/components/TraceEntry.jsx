/** Native disclosure keeps step output optional and keyboard accessible. */
export function TraceEntry({ children, detail }) {
  if (!detail) return <div class="chat-trace-row">{children}</div>
  return <details class="chat-trace-entry">
    <summary class="chat-trace-row">
      {children}
      <svg class="chat-trace-disclosure" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
    </summary>
    <div class="chat-trace-expanded">{detail}</div>
  </details>
}
