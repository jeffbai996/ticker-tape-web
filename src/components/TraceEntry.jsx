import { toChildArray } from 'preact'

/** Native disclosure keeps step output optional and keyboard accessible. */
export function TraceEntry({ children, detail }) {
  const [icon, ...text] = toChildArray(children)
  const content = <>{icon}<span class="chat-trace-text">{text}</span></>
  if (!detail) return <div class="chat-trace-row">{content}</div>
  return <details class="chat-trace-entry">
    <summary class="chat-trace-row">
      {content}
      <svg class="chat-trace-disclosure" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
    </summary>
    <div class="chat-trace-expanded">{detail}</div>
  </details>
}
