// Page registry: imports all page modules and registers them with the router.

import { registerPage } from '../router.js'

import { render as dashboard } from './dashboard.js'
import { render as market } from './market.js'
import { render as chart } from './chart.js'
import { render as lookup } from './lookup.js'
import { render as technicals } from './technicals.js'
import { render as sectors } from './sectors.js'
import { render as earnings } from './earnings.js'
import { render as news } from './news.js'
import { render as heatmap } from './heatmap.js'
import { render as intraday } from './intraday.js'
import { render as comparison } from './comparison.js'
import { render as correlation } from './correlation.js'
import { render as valuation } from './valuation.js'
import { render as calendar } from './calendar.js'
import { render as commodities } from './commodities.js'
import { render as dividends } from './dividends.js'
import { render as short_ } from './short.js'
import { render as ratings } from './ratings.js'
import { render as insider } from './insider.js'
import { render as impact } from './impact.js'
import { render as options } from './options.js'

export function registerPages() {
  registerPage('', dashboard)
  registerPage('dashboard', dashboard)
  registerPage('market', market)
  registerPage('chart', chart)
  registerPage('lookup', lookup)
  registerPage('technicals', technicals)
  registerPage('sectors', sectors)
  registerPage('earnings', earnings)
  registerPage('news', news)
  registerPage('heatmap', heatmap)
  registerPage('intraday', intraday)
  registerPage('comparison', comparison)
  registerPage('correlation', correlation)
  registerPage('valuation', valuation)
  registerPage('calendar', calendar)
  registerPage('commodities', commodities)
  registerPage('dividends', dividends)
  registerPage('short', short_)
  registerPage('ratings', ratings)
  registerPage('insider', insider)
  registerPage('impact', impact)
  registerPage('options', options)
}
