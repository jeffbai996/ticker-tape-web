import { NAV, hrefFor } from '../lib/route.js'

export function Sidebar({ route }) {
  return (
    <nav class="w-48 shrink-0 bg-surface-1 border-r border-line flex flex-col py-3 max-md:hidden">
      {NAV.map((section) => (
        <div key={section.id}>
          <a
            href={hrefFor(section.id)}
            class={`flex items-center gap-2 mx-2 px-3 py-2 rounded-[10px] text-sm transition-colors ${
              route.section === section.id
                ? 'bg-accent-soft text-ink'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {section.label}
            {section.badge && (
              <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-line-2 text-muted">
                {section.badge}
              </span>
            )}
          </a>
          {route.section === section.id && section.subs.length > 0 && (
            <div class="ml-5 my-1 flex flex-col border-l border-line">
              <a
                href={hrefFor(section.id)}
                class={`px-3 py-1 text-xs ${!route.sub ? 'text-ink' : 'text-muted hover:text-ink-2'}`}
              >
                Overview
              </a>
              {section.subs.map((sub) => (
                <a
                  key={sub.id}
                  href={hrefFor(section.id, sub.id)}
                  class={`px-3 py-1 text-xs ${
                    route.sub === sub.id ? 'text-ink' : 'text-muted hover:text-ink-2'
                  }`}
                >
                  {sub.label}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}

      <div class="mt-auto px-4 pt-3 border-t border-line mx-2">
        <a
          href="https://github.com/jeffbai996/ticker-tape-web"
          class="text-[11px] text-muted hover:text-ink-2"
        >
          source ↗
        </a>
      </div>
    </nav>
  )
}
