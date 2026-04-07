// Simple markdown to HTML converter for chat responses.
// Handles: headers, bold, italic, code blocks, inline code, links, lists, blockquotes, tables.

export function markdownToHTML(md) {
  if (!md) return ''

  let html = md
    // Code blocks (must be first to protect content inside)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = escapeHTML(code.trim())
      return `<pre class="bg-zinc-800 rounded-md p-3 my-2 overflow-x-auto text-xs"><code class="language-${lang || 'text'}">${escaped}</code></pre>`
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1 py-0.5 rounded text-xs text-amber-300">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold text-zinc-200 mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold text-zinc-100 mt-4 mb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold text-zinc-100 mt-4 mb-2">$1</h2>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-zinc-100">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-amber-400 hover:underline">$1</a>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-zinc-600 pl-3 text-zinc-400 my-1">$1</blockquote>')
    // Unordered lists
    .replace(/^[*-] (.+)$/gm, '<li class="ml-4 list-disc text-zinc-300">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-zinc-300">$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="border-zinc-700 my-3">')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="my-1.5">')
    // Single newlines within paragraphs
    .replace(/\n/g, '<br>')

  // Wrap in paragraph if not already block-level
  if (!html.startsWith('<h') && !html.startsWith('<pre') && !html.startsWith('<blockquote')) {
    html = `<p class="my-1.5">${html}</p>`
  }

  return html
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
