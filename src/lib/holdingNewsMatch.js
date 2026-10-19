const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const companyName = name => String(name || '').trim()
  .replace(/[-－](?:SW|W|B|S|R)$/i,'').replace(/^(?:XD|XR|DR)(?=[\u3400-\u9fff])/i,'').trim()

export function matchesHoldingNews(event, holding) {
  const symbol = String(holding.symbol).toUpperCase()
  if ((event.symbols || []).some(s => String(s).toUpperCase() === symbol)) return true
  const text = `${event.headline || ''} ${event.body || ''}`
  const quoted = escape(symbol)
  if (/^\d{6}\.(?:SS|SZ)$/.test(symbol) && new RegExp(`(?<!\\d)${symbol.slice(0,6)}(?!\\d)`).test(text)) return true
  if ((symbol.length >= 3 && /[A-Z]/.test(symbol) && new RegExp(`\\b${quoted}\\b`, 'i').test(text))
      || new RegExp(`\\$${quoted}\\b|(?:NYSE|NASDAQ)\\s*:\\s*${quoted}\\b`, 'i').test(text)) return true
  for (const name of holding.names || []) {
    const value = companyName(name)
      .replace(/[-－](?:SW|W|B|S|R)$/i, '')
      .replace(/(?:股份有限公司|有限公司|公司)$/, '')
      .replace(/\s+(?:inc\.?|corp\.?|corporation|ltd\.?|limited|plc)$/i, '').trim()
    if (/[\u3400-\u9fff]/.test(value)) {
      if (value.length >= 2 && text.includes(value)) return true
    } else if (value.length >= 4 && new RegExp(`\\b${escape(value)}\\b`, 'i').test(text)) return true
  }
  return false
}

