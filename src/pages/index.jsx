import { Placeholder } from '../components/Placeholder.jsx'
import { Dashboard } from './dashboard.jsx'
import { WatchlistsPage } from './watchlists.jsx'
import { Markets } from './markets.jsx'
import { Research } from './research.jsx'
import { Screen } from './screen.jsx'
import { Alerts } from './alerts.jsx'
import { Portfolio } from './portfolio.jsx'
import { Chat } from './chat.jsx'
import { IS_PRIVATE_BUILD } from '../lib/nav.js'

function ChatUnavailable() {
  return (
    <div class="flex-1 p-6 font-mono text-[12px] text-muted max-w-lg leading-relaxed">
      the assistant runs on the operator's own subscription through a private
      wire service, so it isn't part of this public demo. everything else on
      the site works without it.
    </div>
  )
}
import { Brief } from './brief.jsx'
import { Wire } from './wire.jsx'

const PAGES = {
  markets: {
    title: 'Markets',
    note: 'Market overview, sectors, commodities, and the economic calendar under one roof.',
  },
  research: {
    title: 'Research',
    note: 'Per-symbol deep dive: chart, fundamentals, technicals, news, options, insider activity, earnings impact.',
  },
  portfolio: {
    title: 'Portfolio',
    badge: 'DEMO — NOT REAL POSITIONS',
    note: 'Synthetic demo portfolio: positions, account summary, sizing, cost of carry, risk cockpit, NLV timeline. Every number on this page is generated.',
  },
  screen: {
    title: 'Screening',
    note: 'Multi-symbol screening, comparison, correlation, and valuation on any tickers you type.',
  },
  chat: {
    title: 'AI Chat',
    note: 'Multi-model chat over the data in view, proxied server-side. No API key required.',
  },
}

export function Page({ route }) {
  if (route.section === 'dashboard') {
    return <Dashboard />
  }
  if (route.section === 'watchlists') return route.sub
    ? <Dashboard listId={route.sub} />
    : <WatchlistsPage />
  if (route.section === 'brief') return <Brief />
  if (route.section === 'markets') return <Markets route={route} />
  if (route.section === 'research') return <Research route={route} />
  if (route.section === 'screen') return <Screen route={route} />
  if (route.section === 'alerts') return <Alerts />
  if (route.section === 'wire') return <Wire />
  if (route.section === 'portfolio') return <Portfolio route={route} />
  // Public build has no assistant: the route is dead, not just hidden.
  if (route.section === 'chat') {
    return IS_PRIVATE_BUILD ? <Chat /> : <ChatUnavailable />
  }
  const page = PAGES[route.section]
  const sub = route.sub ? ` / ${route.sub}` : ''
  return <Placeholder {...page} title={page.title + sub} />
}
