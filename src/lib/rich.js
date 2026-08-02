// A small renderer for the TUI's Rich-markup register — [bold #00c8ff]…[/],
// [dim]…[/], [green]…[/] — so console output can share the CLI formatters'
// exact color language instead of printing flat text.

export const TUI = {
  positive: '#22c55e', negative: '#ff3232', accent: '#ffc800',
  info: '#00c8ff', extended: '#c864ff', dim: '#808080',
}

const NAMED = {
  green: TUI.positive, red: TUI.negative, yellow: TUI.accent,
  cyan: TUI.info, magenta: TUI.extended, dim: TUI.dim, white: '#e7ecf3',
}

/**
 * Parse rich markup into spans: [{text, color, bold, dim}].
 * Unknown tags pass through as plain text rather than vanishing.
 */
export function parseRich(markup) {
  const spans = []
  const stack = []
  let buf = ''
  const flush = () => {
    if (!buf) return
    const cur = stack[stack.length - 1] || {}
    spans.push({ text: buf, ...cur })
    buf = ''
  }
  let i = 0
  while (i < markup.length) {
    if (markup[i] === '\\' && markup[i + 1] === '[') {   // escaped literal [
      buf += '['
      i += 2
      continue
    }
    if (markup[i] !== '[') {
      buf += markup[i]
      i += 1
      continue
    }
    const end = markup.indexOf(']', i)
    if (end < 0) {
      buf += markup.slice(i)
      break
    }
    const tag = markup.slice(i + 1, end)
    if (tag === '/') {
      flush()
      stack.pop()
      i = end + 1
      continue
    }
    const style = {}
    let known = true
    for (const part of tag.split(/\s+/)) {
      const p = part.toLowerCase()
      if (p === 'bold') style.bold = true
      else if (p === 'dim') style.dim = true
      else if (p.startsWith('#') && /^#[0-9a-f]{3,8}$/.test(p)) style.color = p
      else if (NAMED[p]) style.color = NAMED[p]
      else known = false
    }
    if (!known) {           // not markup we understand — emit literally
      buf += markup.slice(i, end + 1)
      i = end + 1
      continue
    }
    flush()
    stack.push({ ...(stack[stack.length - 1] || {}), ...style })
    i = end + 1
  }
  flush()
  return spans
}
