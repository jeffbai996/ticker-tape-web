import { useEffect, useState } from 'preact/hooks'
import { getLocale, tl } from '../lib/i18n.js'
import { canReadPortfolioArticle, readPortfolioArticle } from '../lib/portfolioNews.js'
import { AskAI } from './AskAI.jsx'

const loc=()=>getLocale()==='zh' ? 'zh-CN' : 'en-US'
const dayLabel=ts=>ts ? new Date(ts).toLocaleDateString(loc()) : ''
const clock=ts=>ts ? new Date(ts).toLocaleTimeString(loc(),{hour:'2-digit',minute:'2-digit'}) : ''

export function PortfolioArticleReader({ item, portfolio, onClose, dialog=false }) {
  const [art, setArt] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    setArt(null); setErr(false)
    if (!canReadPortfolioArticle(item)) return undefined
    let live = true
    readPortfolioArticle(item).then((a) => { if (live) setArt(a) }).catch(() => { if (live) setErr(true) })
    return () => { live = false }
  }, [item?.link, item?.wireBase, item?.wireId])
  if (!item) {
    return <div class="hidden lg:flex h-full items-center justify-center px-6 text-center font-anth text-[11px] text-muted">{tl('Pick a story to read it here.')}</div>
  }
  const bookName=portfolio?.name || item.portfolioName
  const analysis={
    label:getLocale()==='zh' ? '解读影响' : 'Explain impact',
    question:getLocale()==='zh'
      ? `解读新闻「${item.title}」${bookName ? `对「${bookName}」组合持仓的影响` : '的市场影响'}，区分已确认事实与推测。`
      : `Explain the ${bookName ? `impact on the “${bookName}” portfolio` : 'market impact'} of “${item.title}”. Separate confirmed facts from inference.`,
    context:{label:bookName || item.publisher || item.symbol || 'News',data:{kind:'article',portfolio_id:portfolio?.id,portfolio:bookName,symbols:item.symbols || [item.symbol],title:item.title,url:item.link,publisher:item.publisher,publishedAt:item.time,excerpt:(art?.paras?.join('\n') || item.summary || '').slice(0,3500)}}
  }
  const readable = canReadPortfolioArticle(item)
  return (
    <article class="flex h-full min-h-0 flex-col">
      <header class="flex items-start gap-2 border-b border-line-2 px-4 py-3">
        <div class="min-w-0 flex-1">
          <h2 class="font-anth text-[16px] font-semibold leading-snug tracking-tight text-ink">{art?.title || item.title}</h2>
          <div class="mt-1 font-mono text-[10px] text-muted">
            <span class="font-bold text-accent">{item.symbol}</span>
            {(art?.source || item.publisher) && <span> · {art?.source || item.publisher}</span>}
            {(art?.time || item.time) && <span> · {art?.time || `${dayLabel(item.time)} ${clock(item.time)}`}</span>}
          </div>
        </div>
        <AskAI {...analysis} />
        <a href={item.link} target="_blank" rel="noopener noreferrer" class="shrink-0 rounded border border-line-2 px-2 py-1 font-anth text-[10px] text-muted hover:text-accent">{tl('Open original')} ↗</a>
        <button type="button" onClick={onClose} aria-label={tl('Close')} class={`shrink-0 rounded border border-line-2 px-2 py-1 font-mono text-[11px] text-muted hover:text-ink ${dialog ? '' : 'lg:hidden'}`}>✕</button>
      </header>
      <div class="reader-prose min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {readable && !art && !err && <div class="font-anth text-[11px] text-muted">{tl('Reading')}…</div>}
        {readable && err && <div class="font-anth text-[11px] text-danger">{tl('Could not load the story — open the original instead.')}</div>}
        {art?.paras?.map((p, i) => (
          <p key={i} class="mb-3 font-anth text-[13.5px] leading-[1.85] text-ink-2">{p}</p>
        ))}
        {!readable && (
          <div class="font-anth text-[12px] leading-relaxed text-ink-2">
            {item.summary && <p class="mb-3">{item.summary}</p>}
            <AskAI {...analysis} />
        <a href={item.link} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">{tl('Open original')} ↗</a>
          </div>
        )}
      </div>
    </article>
  )
}

