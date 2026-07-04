import { NAV, hrefFor } from '../lib/route.js'
import { tl } from '../lib/i18n.js'

// Mobile-only bottom tab bar (the sidebar is hidden below md). Scrolls
// horizontally if the section list outgrows the viewport.

export function BottomNav({ route }) {
  return (
    <nav class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-1 border-t border-line flex overflow-x-auto no-scrollbar">
      {NAV.map((section) => (
        <a
          key={section.id}
          href={hrefFor(section.id)}
          class={`flex-1 min-w-fit text-center px-3 py-2.5 text-[10px] font-mono whitespace-nowrap ${
            route.section === section.id ? 'text-accent border-t-2 border-accent -mt-px' : 'text-muted'
          }`}
        >
          {tl(section.label)}
        </a>
      ))}
    </nav>
  )
}

/** Mobile-only sub-tab strip for sections whose sub-nav lives in the sidebar. */
export function SubTabs({ route }) {
  const section = NAV.find((s) => s.id === route.section)
  if (!section?.subs?.length) return null
  const tabs = [{ id: null, label: 'Overview' }, ...section.subs]
  return (
    <div class="md:hidden flex gap-1.5 px-3 py-1.5 border-b border-line overflow-x-auto no-scrollbar bg-surface-1">
      {tabs.map((tab) => (
        <a
          key={tab.label}
          href={tab.id ? hrefFor(section.id, tab.id) : hrefFor(section.id)}
          class={`px-2.5 py-1 rounded-md border font-mono text-[11px] whitespace-nowrap ${
            (route.sub || null) === tab.id
              ? 'border-accent text-accent bg-accent-soft'
              : 'border-line text-muted'
          }`}
        >
          {tl(tab.label)}
        </a>
      ))}
    </div>
  )
}
