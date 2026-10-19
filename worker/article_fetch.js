const MAX_BYTES = 1_500_000

/** Publisher charsets include Big5 and GBK; UTF-8 replacement loses Chinese. */
export function decodeArticleHtml(bytes, contentType = '') {
  const prefix = new TextDecoder('latin1').decode(bytes.subarray(0, 8192))
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1]
    || /charset\s*=\s*["']?([\w-]+)/i.exec(prefix)?.[1] || 'utf-8'
  try { return new TextDecoder(charset).decode(bytes) }
  catch { return new TextDecoder().decode(bytes) }
}

export async function readArticleResponse(response) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw Error('article too large')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return decodeArticleHtml(bytes, response.headers.get('content-type') || '')
}
