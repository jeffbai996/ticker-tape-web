/** Remove lightweight Markdown emphasis from provider reasoning/status text.
 * Final answers still go through the Markdown renderer; this is only for the
 * compact execution trace, where literal ** plumbing looks broken. */
export function plainTraceText(text) {
  return String(text || '')
    .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
    .replace(/__([\s\S]*?)__/g, '$1')
}
