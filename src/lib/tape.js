/** One complete marquee cycle. The renderer duplicates this whole sequence. */
export function tapeEntries(headlines = [], quotes = []) {
  return [
    ...headlines.map((data) => ({ kind: 'headline', data })),
    ...quotes.map((data) => ({ kind: 'quote', data })),
  ]
}
