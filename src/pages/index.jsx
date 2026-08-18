import { Placeholder } from '../components/Placeholder.jsx'
import { Dashboard } from './dashboard.jsx'
import { WatchlistsPage } from './watchlists.jsx'
import { Markets } from './markets.jsx'
import { Research } from './research.jsx'
import { Screen } from './screen.jsx'
import { Alerts } from './alerts.jsx'
import { Portfolio } from './portfolio.jsx'
import { Chat } from './chat.jsx'
import { ChatPreview } from './chatPreview.jsx'
import { Brief } from './brief.jsx'
import { Wire } from './wire.jsx'
import { ConsolePage } from './console.jsx'
import { IS_PRIVATE_BUILD } from '../lib/nav.js'
import { useNamedWatchlists } from '../hooks.js'
import { resolveDashboardLanding } from '../lib/dashboardLanding.js'

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

function LandingDashboard() {
  const lists = useNamedWatchlists()
  return <Dashboard listId={resolveDashboardLanding(lists)} />
}

export function Page({ route }) {
  if (route.section === 'dashboard') {
    return <LandingDashboard />
  }
  if (route.section === 'watchlists') return route.sub
    ? <Dashboard listId={route.sub === 'main' ? null : route.sub} />
    : <WatchlistsPage />
  if (route.section === 'brief') return <Brief />
  if (route.section === 'markets') return <Markets route={route} />
  if (route.section === 'research') return <Research route={route} />
  if (route.section === 'screen') return <Screen route={route} />
  if (route.section === 'alerts') return <Alerts />
  if (route.section === 'wire') return <Wire route={route} />
  if (route.section === 'console') return <ConsolePage />
  if (route.section === 'portfolio') return <Portfolio route={route} />
  if (route.section === 'chat') {
    return IS_PRIVATE_BUILD ? <Chat /> : <ChatPreview />
  }
  const page = PAGES[route.section]
  const sub = route.sub ? ` / ${route.sub}` : ''
  return <Placeholder {...page} title={page.title + sub} />
}
