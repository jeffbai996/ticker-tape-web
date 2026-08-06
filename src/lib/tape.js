// What one marquee cycle contains, and how each item is labelled. The
// renderer duplicates the whole sequence to loop seamlessly.

const TYPE_CODE = {
  price_move: 'MOVE',
  earnings_release: 'ERN',
  filing: 'FIL',
  fed_headline: 'FED',
  fed_speech: 'FED',
  macro_print: 'MACRO',
  digest: 'AUDIO',
  transcript_chunk: 'AUDIO',
  brief: 'BRIEF',
}

// Same ramp as the wire page: T1 touches the sector, T2 is a core thesis
// story, T3 is a thesis story on a name you actually hold.
const TIER_CLS = {
  T1: 'bg-[#58a6ff] text-black',
  T2: 'bg-accent text-black',
  T3: 'bg-[#f85149] text-black',
  NEWS: 'bg-white/25 text-ink',
}

/**
 * Badge for a wire item: {code, cls}. A typed event says what it is; a plain
 * headline — the common case, and the one that used to read 'NEWS' on every
 * single row — falls back to why it earned a place on the tape.
 */
export function tapeBadge(ev, watchset = new Set()) {
  const typed = TYPE_CODE[ev?.type]
  if (typed) return { code: typed, cls: 'bg-accent text-black' }

  const thesis = (ev?.meta || {}).thesis || 0
  const onBook = (ev?.symbols || []).some((s) => watchset.has(s))
  const code = thesis >= 2 && onBook ? 'T3' : thesis >= 2 ? 'T2' : thesis >= 1 ? 'T1' : 'NEWS'
  return { code, cls: TIER_CLS[code] }
}

/**
 * One complete marquee cycle, headlines spaced through the quotes rather than
 * printed as a block at the head of the belt (Jeff 2026-08-05: "sprinkle in
 * the news articles instead of printing them all together"). The cycle never
 * opens on a headline, so the loop seam still lands on a price.
 */
export function tapeEntries(headlines = [], quotes = []) {
  const news = headlines.map((data) => ({ kind: 'headline', data }))
  const prices = quotes.map((data) => ({ kind: 'quote', data }))
  if (!news.length) return prices
  if (!prices.length) return news

  // one headline per gap, gaps spread as evenly as the counts allow
  const step = Math.max(1, Math.floor(prices.length / (news.length + 1)))
  const out = []
  let next = 0
  prices.forEach((entry, i) => {
    out.push(entry)
    const due = (i + 1) % step === 0
    if (due && next < news.length && i < prices.length - 1) out.push(news[next++])
  })
  // whatever didn't fit rides the tail rather than being dropped
  return out.concat(news.slice(next))
}
