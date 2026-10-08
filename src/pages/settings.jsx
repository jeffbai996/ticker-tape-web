import { useEffect, useState } from 'preact/hooks'
import { getHighContrast, saveHighContrast } from '../lib/contrast.js'
import { getLocale, setLocale, onLocaleChange, tl } from '../lib/i18n.js'
import { IS_FAMILY_BUILD, IS_PRIVATE_BUILD } from '../lib/nav.js'
import { useNamedWatchlists } from '../hooks.js'
import { pinnedDashboardLanding, pinDashboardLanding } from '../lib/dashboardLanding.js'
import { BOOK_CARDS, hiddenCards, onCardsChange, resetCards, toggleCard } from '../lib/bookCards.js'
import { getMarketColorOrder, saveMarketColorOrder, defaultMarketColorOrder } from '../lib/marketColors.js'
import { loadWireOrder, saveWireOrder } from '../lib/wire.js'
import { isTapeList, toggleTapeList, onTapeListsChange } from '../lib/tapeLists.js'
import { getWidgets, addWidget, removeWidget, resetWidgets, onWidgetsChange } from '../lib/widgets.js'

const WIDGET_OPTIONS = [
  ['pulse', 'Market pulse', '市场脉搏'], ['markets', 'Global markets', '全球市场'],
  ['earnings', 'Earnings', '财报'], ['calendar', 'Economic calendar', '财经日历'],
  ['movers', 'Movers', '涨跌排行'], ['heat', 'Heatmap', '热力图'],
  ['alerts', 'Alerts', '提醒'], ['range', 'Price ranges', '价格区间'], ['risk', 'Risk', '风险'],
]

function Switch({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange}
    class={`shrink-0 w-6 h-3 rounded-[2px] border flex items-center px-[1px] ${checked ? 'border-accent bg-accent/15 justify-end' : 'border-line-2 bg-surface-2 justify-start'}`}>
    <span class={`block w-2 h-2 rounded-[1px] ${checked ? 'bg-accent' : 'bg-muted'}`} />
  </button>
}

export function Settings() {
  const [locale, language] = useState(getLocale)
  const [contrast, setContrast] = useState(getHighContrast)
  useEffect(() => onLocaleChange(() => language(getLocale())), [])
  const lists = useNamedWatchlists()
  const [, refreshTape] = useState(0)
  useEffect(() => onTapeListsChange(() => refreshTape((n) => n + 1)), [])
  const [widgets, setWidgets] = useState(getWidgets)
  useEffect(() => onWidgetsChange(setWidgets), [])
  const [landing, setLanding] = useState(() => pinnedDashboardLanding() || '')
  const [hidden, setHidden] = useState(hiddenCards)
  useEffect(() => onCardsChange(() => setHidden(hiddenCards())), [])
  const [mode, setMode] = useState(loadWireOrder)
  const [rail, setRail] = useState(() => localStorage.getItem('tape-wire-rail') !== '0')
  const [colors, color] = useState(getMarketColorOrder)
  const [chinese, sources] = useState(() => localStorage.getItem('tape-wire-zh-sources') === '1')
  const zh = locale === 'zh'
  const label = (en, cn) => zh ? cn : en
  const changeLanguage = (value) => { setLocale(value); language(value) }
  const changeColors = (value) => { saveMarketColorOrder(value); color(value) }
  const changeSources = (value) => { localStorage.setItem('tape-wire-zh-sources', value ? '1' : '0'); sources(value) }
  const reset = () => {
    saveHighContrast(false); setContrast(false)
    changeLanguage(IS_FAMILY_BUILD ? 'zh' : 'en')
    changeColors(defaultMarketColorOrder())
    changeSources(false)
    pinDashboardLanding(undefined); setLanding('')
    resetCards()
    saveWireOrder('wire'); setMode('wire')
    localStorage.removeItem('tape-wire-rail'); setRail(true)
    for (const list of [{ id: 'main' }, ...lists]) {
      if (isTapeList(list.id) !== (list.id === 'main')) toggleTapeList(list.id)
    }
    resetWidgets()
  }
  const control = 'rounded-sm border border-line-2 bg-surface-2 px-2 py-[2px] font-mono text-[12px] text-ink text-right hover:border-accent focus:border-accent outline-none'
  const heading = 'flex items-center px-3 py-[3px] border-b border-line-2 bg-surface-2 font-anth font-bold text-[12px] tracking-wider text-accent uppercase'
  return <section class="settings-page w-full min-w-0 flex-1 p-3 text-ink font-mono text-[12px]">
    <div class="flex items-center justify-between border-b border-line pb-2 mb-3">
      <h1 class="font-mono font-bold text-lg text-ink">{label('Settings', '设置')}</h1>
      <button class="rounded-sm border border-line-2 bg-surface-2 px-2 py-[2px] font-mono text-[10px] uppercase tracking-wider text-muted hover:text-accent hover:border-accent" onClick={reset}>{label('Reset', '重置')}</button>
    </div>
    <div class="columns-1 lg:columns-2 gap-3">
    <section class="settings-panel bg-surface-1 border border-line rounded-xl overflow-hidden">
    <h2 class={heading}>{label('Appearance', '外观')}</h2>
    <div class="settings-row">
      <label for="settings-language">{label('Language', '语言')}</label>
      <select id="settings-language" class={control} value={locale} onChange={(e) => changeLanguage(e.currentTarget.value)}>
        <option value="en">English</option><option value="zh">简体中文</option>
      </select>
    </div>
    <div class="settings-row">
      <label for="settings-colors">{label('Market colors', '涨跌颜色')}</label>
      <select id="settings-colors" class={control} value={colors} onChange={(e) => changeColors(e.currentTarget.value)}>
        <option value="global">{label('Green up · Red down', '绿涨 · 红跌')}</option>
        <option value="cn">{label('Red up · Green down', '红涨 · 绿跌')}</option>
      </select>
    </div>
    <label class="flex items-center justify-between gap-4 py-4 border-b border-line">
      {label('Higher contrast', '高对比度')}
      <Switch label={label('Higher contrast', '高对比度')} checked={contrast} onChange={() => {
        saveHighContrast(!contrast); setContrast(!contrast)
      }} />
    </label>
    <h2 class={heading}>{label('Dashboard', '仪表盘')}</h2>
    <div class="settings-row">
      <label for="settings-landing">{label('Opening watchlist', '默认显示自选股')}</label>
      <select id="settings-landing" class={control} value={landing} onChange={(e) => { const value = e.currentTarget.value; pinDashboardLanding(value || undefined); setLanding(value) }}>
        <option value="">{label('Last viewed', '上次查看')}</option><option value="main">{tl('Default')}</option>
        {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
      </select>
    </div>
    </section>
    <section class="settings-panel bg-surface-1 border border-line rounded-xl overflow-hidden">
    <h2 class={heading}>{label('Wire', '快讯')}</h2>
    <div class="settings-row">
      <label for="settings-wire-mode">{label('Feed order', '快讯排序')}</label>
      <select id="settings-wire-mode" class={control} value={mode} onChange={(e) => { setMode(e.currentTarget.value); saveWireOrder(e.currentTarget.value) }}>
        <option value="top">{label('Priority', '优先')}</option><option value="wire">{label('Latest', '最新')}</option>
      </select>
    </div>
    <label class="settings-row">
      {label('Chinese-language wire sources', '快讯中文来源')}
      <Switch label={label('Chinese sources', '中文源')} checked={chinese} onChange={() => changeSources(!chinese)} />
    </label>
    <label class="settings-row">
      {label('Show wire sidebar', '显示快讯侧栏')}
      <Switch label={label('Wire sidebar', '快讯侧栏')} checked={rail} onChange={() => { setRail(!rail); localStorage.setItem('tape-wire-rail', !rail ? '1' : '0') }} />
    </label>
    </section>
    <section class="settings-panel bg-surface-1 border border-line rounded-xl overflow-hidden">
      <h2 class={heading}>{label('Tape watchlists', '滚动行情自选股')}</h2>
      {[{ id: 'main', name: tl('Default') }, ...lists].map((list) => <div key={list.id} class="settings-row">
        <span class="truncate font-anth">{list.name}</span><Switch label={list.name} checked={isTapeList(list.id)} onChange={() => toggleTapeList(list.id)} />
      </div>)}
    </section>
    <section class="settings-panel bg-surface-1 border border-line rounded-xl overflow-hidden">
      <h2 class={heading}>{label('Dashboard widgets', '仪表盘组件')}</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 px-3">
        {WIDGET_OPTIONS.map(([type, en, cn]) => <div key={type} class="settings-row">
          <span>{label(en, cn)}</span><Switch label={label(en, cn)} checked={widgets.some((w) => w.type === type)} onChange={() => {
            const existing = getWidgets().filter((w) => w.type === type)
            if (existing.length) existing.forEach((w) => removeWidget(w.id)); else addWidget(type)
          }} />
        </div>)}
      </div>
    </section>
    <section class="settings-panel bg-surface-1 border border-line rounded-xl overflow-hidden">
    <h2 class={heading}>{label('Portfolio cards', '持仓分析卡片')}</h2>
    <div class="grid sm:grid-cols-2 gap-x-4 px-3">
      {BOOK_CARDS.map((card) => <label key={card.id} class="settings-row">
        {tl(card.label)}<Switch label={tl(card.label)} checked={!hidden.includes(card.id)} onChange={() => toggleCard(card.id)} />
      </label>)}
    </div>
    </section>
    <section class="settings-panel bg-surface-1 border border-line rounded-xl overflow-hidden">
    <h2 class={heading}>{label('Services', '服务')}</h2>
    <dl>
      {[
        [label('Wire', '快讯'), IS_PRIVATE_BUILD ? label('Live stream', '实时推送') : label('Periodic updates', '定期更新')],
        [label('AI chat', 'AI 对话'), IS_PRIVATE_BUILD ? label('Available', '可用') : label('Unavailable', '暂不可用')],
        [label('Portfolio', '持仓'), IS_PRIVATE_BUILD ? label('IBKR + manual', 'IBKR 与手动组合') : label('Manual', '手动组合')],
      ].map(([name, status]) => <div key={name} class="settings-row"><dt>{name}</dt><dd class="text-ink-2 text-right font-mono">{status}</dd></div>)}
    </dl>
    </section>
    </div>
  </section>
}
