// News headlines by symbol.

import { loadNews, loadMeta } from '../lib/data.js'
import { timeAgo } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el, param) {
  const [news, meta] = await Promise.all([loadNews(), loadMeta()])

  if (!news || !Object.keys(news).length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No news data available.'
    el.appendChild(msg)
    return
  }

  const container = document.createElement('div')
  container.className = 'p-4 fade-in space-y-4'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = param ? `News — ${param.toUpperCase()}` : 'News'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)
  container.appendChild(header)

  // Determine which symbols to show
  const symbols = param
    ? [param.toUpperCase()]
    : Object.keys(news)

  for (const sym of symbols) {
    const articles = news[sym]
    if (!articles?.length) continue

    const section = document.createElement('div')
    section.className = 'card p-3'

    // Symbol header
    const symHeader = document.createElement('div')
    symHeader.className = 'flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800'
    const symLabel = document.createElement('span')
    symLabel.className = 'font-mono text-sm font-semibold text-amber-400 cursor-pointer hover:underline'
    symLabel.textContent = sym
    symLabel.addEventListener('click', () => go('lookup', sym))
    const countBadge = document.createElement('span')
    countBadge.className = 'badge bg-zinc-800 text-zinc-500'
    countBadge.textContent = `${articles.length} articles`
    symHeader.append(symLabel, countBadge)
    section.appendChild(symHeader)

    // Articles list
    for (const article of articles) {
      const row = document.createElement('div')
      row.className = 'py-2 border-b border-zinc-800/50 last:border-0'

      const titleRow = document.createElement('div')
      titleRow.className = 'flex items-start gap-2'

      // Title — linked if link exists
      if (article.link) {
        const a = document.createElement('a')
        a.href = article.link
        a.target = '_blank'
        a.rel = 'noopener'
        a.className = 'text-sm text-zinc-200 hover:text-amber-400 transition-colors leading-snug'
        a.textContent = article.title || 'Untitled'
        titleRow.appendChild(a)
      } else {
        const span = document.createElement('span')
        span.className = 'text-sm text-zinc-200 leading-snug'
        span.textContent = article.title || 'Untitled'
        titleRow.appendChild(span)
      }

      // Meta row: source + age
      const metaRow = document.createElement('div')
      metaRow.className = 'flex items-center gap-2 mt-1'

      if (article.source) {
        const sourceBadge = document.createElement('span')
        sourceBadge.className = 'badge bg-zinc-800 text-zinc-500 text-[10px]'
        sourceBadge.textContent = article.source
        metaRow.appendChild(sourceBadge)
      }

      if (article.age) {
        const ageEl = document.createElement('span')
        ageEl.className = 'text-[10px] text-zinc-600'
        ageEl.textContent = article.age
        metaRow.appendChild(ageEl)
      } else if (article.published) {
        const ageEl = document.createElement('span')
        ageEl.className = 'text-[10px] text-zinc-600'
        ageEl.textContent = timeAgo(article.published)
        metaRow.appendChild(ageEl)
      }

      row.append(titleRow, metaRow)
      section.appendChild(row)
    }

    container.appendChild(section)
  }

  el.textContent = ''
  el.appendChild(container)
}
