import { NAV, hrefFor } from '../lib/route.js'
import { tl } from '../lib/i18n.js'
import { useQuotes } from '../hooks.js'
import { WATCHLIST } from '../lib/symbols.js'
import { fmtPrice, fmtPct } from '../lib/format.js'

function WatchRow({ symbol, q }) {
  const up = (q?.pct ?? 0) >= 0
  return (
    <a
      href={`#/research/${symbol.toLowerCase()}`}
      class="flex items-baseline px-3 py-[3px] font-mono text-[11px] hover:bg-surface-2 hover:no-underline"
    >
      <span class="text-ink font-bold w-14">{symbol}</span>
      <span class="text-ink-2 ml-auto">{q ? fmtPrice(q.price) : '—'}</span>
      <span class={`w-16 text-right ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
        {q ? fmtPct(q.pct) : ''}
      </span>
    </a>
  )
}

export function Sidebar({ route }) {
  const quotes = useQuotes(WATCHLIST)

  return (
    <nav class="w-52 shrink-0 bg-surface-1 border-r border-line flex flex-col max-md:hidden min-h-0">
      <div class="py-2">
        {NAV.map((section) => (
          <div key={section.id}>
            <a
              href={hrefFor(section.id)}
              class={`flex items-center gap-2 mx-2 px-2.5 py-[5px] rounded-lg text-[13px] transition-colors ${
                route.section === section.id
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {tl(section.label)}
              {section.badge && (
                <span class="text-[8px] font-mono font-bold px-1 py-px rounded border border-line-2 text-muted">
                  {section.badge}
                </span>
              )}
            </a>
            {route.section === section.id && section.subs.length > 0 && (
              <div class="ml-4 my-0.5 flex flex-col border-l border-line">
                <a
                  href={hrefFor(section.id)}
                  class={`px-3 py-0.5 text-[11px] ${!route.sub ? 'text-accent' : 'text-muted hover:text-ink-2'}`}
                >
                  {tl('Overview')}
                </a>
                {section.subs.map((sub) => (
                  <a
                    key={sub.id}
                    href={hrefFor(section.id, sub.id)}
                    class={`px-3 py-0.5 text-[11px] ${
                      route.sub === sub.id ? 'text-accent' : 'text-muted hover:text-ink-2'
                    }`}
                  >
                    {tl(sub.label)}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div class="px-3 pt-2 pb-1 border-t border-line font-mono text-[10px] tracking-wider text-muted">
        {tl('Watchlist').toUpperCase()}
      </div>
      <div class="flex-1 overflow-y-auto min-h-0">
        {WATCHLIST.map((s) => (
          <WatchRow key={s} symbol={s} q={quotes[s]?.quote} />
        ))}
      </div>

      <div class="px-3 py-2 border-t border-line">
        <a
          href="https://github.com/jeffbai996/ticker-tape-web"
          class="text-[10px] font-mono text-muted hover:text-ink-2"
        >
          source ↗
        </a>
      </div>
    </nav>
  )
}
