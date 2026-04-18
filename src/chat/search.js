// Tavily web-search client for chat context injection.
// Browser-direct POST to api.tavily.com/search. Key from localStorage.tavily_key.
// Results are injected into the system prompt, not used as a tool call —
// the web chat providers don't support tool use today.

const TAVILY_URL = 'https://api.tavily.com/search'
const REQUEST_TIMEOUT_MS = 15_000

export function getTavilyKey() {
  return localStorage.getItem('tavily_key') || ''
}

export function isSearchAvailable() {
  return !!getTavilyKey()
}

/**
 * Query Tavily and return the parsed response, or null on failure.
 * Shape: { query, answer: string|null, results: [{ title, url, content }] }.
 */
export async function tavilySearch(query, key, { maxResults = 5 } = {}) {
  const apiKey = key || getTavilyKey()
  if (!apiKey || !query?.trim()) return null

  try {
    const resp = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_answer: true,
        search_depth: 'basic',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!resp.ok) return null
    const json = await resp.json()
    return normalizeTavily(json)
  } catch {
    return null
  }
}

export function normalizeTavily(json) {
  if (!json || typeof json !== 'object') return null
  const results = Array.isArray(json.results) ? json.results.map(r => ({
    title: r.title || '',
    url: r.url || '',
    content: r.content || r.snippet || '',
  })) : []
  return {
    query: json.query || '',
    answer: typeof json.answer === 'string' ? json.answer : null,
    results,
  }
}

/**
 * Format a Tavily response as a markdown block for system-prompt injection.
 * Returns '' if there's nothing useful to inject.
 */
export function formatResultsForPrompt(tavilyResp) {
  if (!tavilyResp) return ''
  const { answer, results, query } = tavilyResp
  if (!answer && (!results || !results.length)) return ''

  let out = `\n\n## Web Search Context (query: "${query}")\n`
  if (answer) out += `\nQuick answer: ${answer}\n`
  if (results?.length) {
    out += '\nSources:\n'
    for (const r of results) {
      const snippet = r.content ? ` — ${r.content.slice(0, 240)}` : ''
      out += `- [${r.title || r.url}](${r.url})${snippet}\n`
    }
  }
  out += '\nUse these as grounding for your answer. Cite URLs when relevant.'
  return out
}
