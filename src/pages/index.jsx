import { Placeholder } from '../components/Placeholder.jsx'
import { IS_FAMILY_BUILD, IS_PRIVATE_BUILD } from '../lib/nav.js'
import { useNamedWatchlists } from '../hooks.js'
import { resolveDashboardLanding } from '../lib/dashboardLanding.js'
import { lazyPage } from '../components/LazyPage.jsx'
// The dashboard is the landing route: it stays in the entry chunk so first
// paint costs one request. Everything else is fetched on first visit.
import { Dashboard } from './dashboard.jsx'

const WatchlistsPage = lazyPage(() => import('./watchlists.jsx').then((m) => m.WatchlistsPage))
const Markets = lazyPage(() => import('./markets.jsx').then((m) => m.Markets))
const Research = lazyPage(() => import('./research.jsx').then((m) => m.Research))
const Screen = lazyPage(() => import('./screen.jsx').then((m) => m.Screen))
const Alerts = lazyPage(() => import('./alerts.jsx').then((m) => m.Alerts))
const Portfolio = lazyPage(() => import('./portfolio.jsx').then((m) => m.Portfolio))
// The live chat implementation is private-build only; the public preview is a
// separate chunk, so neither one rides along in the other's build.
const Chat = lazyPage(() => import('./chat.jsx').then((m) => m.Chat))
const ChatPreview = lazyPage(() => import('./chatPreview.jsx').then((m) => m.ChatPreview))
const Brief = lazyPage(() => import('./brief.jsx').then((m) => m.Brief))
const Wire = lazyPage(() => import('./wire.jsx').then((m) => m.Wire))
const ConsolePage = lazyPage(() => import('./console.jsx').then((m) => m.ConsolePage))

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
  if (route.section === 'brief') return IS_FAMILY_BUILD ? <Dashboard /> : <Brief />
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
