import { Placeholder } from '../components/Placeholder.jsx'
import { Dashboard } from './dashboard.jsx'
import { Markets } from './markets.jsx'

const PAGES = {
  markets: {
    title: 'Markets',
    phase: 1,
    note: 'Market overview, sectors, commodities, and the economic calendar under one roof.',
  },
  research: {
    title: 'Research',
    phase: 1,
    note: 'Per-symbol deep dive: chart, fundamentals, technicals, news, options, insider activity, earnings impact.',
  },
  portfolio: {
    title: 'Portfolio',
    phase: 2,
    badge: 'DEMO — NOT REAL POSITIONS',
    note: 'Synthetic demo portfolio: positions, account summary, sizing, cost of carry, risk cockpit, NLV timeline. Every number on this page is generated.',
  },
  screen: {
    title: 'Screening',
    phase: 1,
    note: 'Multi-symbol screening, comparison, correlation, and valuation on any tickers you type.',
  },
  chat: {
    title: 'AI Chat',
    phase: 3,
    note: 'Multi-model chat over the data in view, proxied server-side. No API key required.',
  },
}

export function Page({ route }) {
  if (route.section === 'dashboard') return <Dashboard />
  if (route.section === 'markets') return <Markets route={route} />
  const page = PAGES[route.section]
  const sub = route.sub ? ` / ${route.sub}` : ''
  return <Placeholder {...page} title={page.title + sub} />
}
