export async function pushWatchlistToWire(endpoint, symbols, fetcher = fetch) {
  const response = await fetcher(`${endpoint.replace(/\/$/, '')}/api/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ add: symbols }),
  })
  const out = await response.json()
  if (!out.ok) throw new Error(out.error || 'watchlist export failed')
  return out
}
