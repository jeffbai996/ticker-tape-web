import { useEffect, useState } from 'preact/hooks'
import { getLocale, setLocale, onLocaleChange, tl } from '../lib/i18n.js'
import { IS_FAMILY_BUILD, IS_PRIVATE_BUILD } from '../lib/nav.js'
import { useNamedWatchlists } from '../hooks.js'
import { pinnedDashboardLanding, pinDashboardLanding } from '../lib/dashboardLanding.js'
import { BOOK_CARDS, hiddenCards, onCardsChange, resetCards, toggleCard } from '../lib/bookCards.js'
import { getMarketColorOrder, saveMarketColorOrder, defaultMarketColorOrder } from '../lib/marketColors.js'
import { loadWireOrder, saveWireOrder } from '../lib/wire.js'

export function Settings() {
  const [locale, language] = useState(getLocale)
  useEffect(() => onLocaleChange(() => language(getLocale())), [])
  const lists = useNamedWatchlists()
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
    changeLanguage(IS_FAMILY_BUILD ? 'zh' : 'en')
    changeColors(defaultMarketColorOrder())
    changeSources(false)
    pinDashboardLanding(undefined); setLanding('')
    resetCards()
    saveWireOrder('wire'); setMode('wire')
    localStorage.removeItem('tape-wire-rail'); setRail(true)
  }
  const control = 'rounded-md border border-line-2 bg-surface-2 px-3 py-1.5 text-ink text-[12px] hover:border-accent/60 focus:border-accent outline-none'
  const heading = 'font-anth text-[11px] font-bold uppercase tracking-wider text-accent pt-6 pb-2 border-b border-line'
  return <section class="max-w-4xl mx-auto p-4 sm:p-6 text-ink font-anth">
    <div class="flex items-center justify-between border-b border-line pb-4 mb-2">
      <h1 class="text-xl font-semibold">{label('Settings', '设置')}</h1>
      <button class={control} onClick={reset}>{label('Reset', '重置')}</button>
    </div>
    <h2 class={heading}>{label('Appearance', '外观')}</h2>
    <div class="flex items-center justify-between gap-4 py-5 border-b border-line">
      <label for="settings-language">{label('Language', '语言')}</label>
      <select id="settings-language" class={control} value={locale} onChange={(e) => changeLanguage(e.currentTarget.value)}>
        <option value="en">English</option><option value="zh">简体中文</option>
      </select>
    </div>
    <div class="flex items-center justify-between gap-4 py-5 border-b border-line">
      <label for="settings-colors">{label('Market colors', '涨跌颜色')}</label>
      <select id="settings-colors" class={control} value={colors} onChange={(e) => changeColors(e.currentTarget.value)}>
        <option value="global">{label('Green up · Red down', '绿涨 · 红跌')}</option>
        <option value="cn">{label('Red up · Green down', '红涨 · 绿跌')}</option>
      </select>
    </div>
    <h2 class={heading}>{label('Dashboard', '仪表盘')}</h2>
    <div class="flex items-center justify-between gap-4 py-4 border-b border-line">
      <label for="settings-landing">{label('Opening watchlist', '默认显示自选股')}</label>
      <select id="settings-landing" class={control} value={landing} onChange={(e) => { const value = e.currentTarget.value; pinDashboardLanding(value || undefined); setLanding(value) }}>
        <option value="">{label('Last viewed', '上次查看')}</option><option value="main">{tl('Default')}</option>
        {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
      </select>
    </div>
    <h2 class={heading}>{label('Wire', '快讯')}</h2>
    <div class="flex items-center justify-between gap-4 py-4 border-b border-line">
      <label for="settings-wire-mode">{label('Feed order', '快讯排序')}</label>
      <select id="settings-wire-mode" class={control} value={mode} onChange={(e) => { setMode(e.currentTarget.value); saveWireOrder(e.currentTarget.value) }}>
        <option value="top">{label('Priority', '优先')}</option><option value="wire">{label('Latest', '最新')}</option>
      </select>
    </div>
    <label class="flex items-center justify-between gap-4 py-4 border-b border-line">
      {label('Chinese-language wire sources', '快讯中文来源')}
      <input type="checkbox" checked={chinese} onChange={(e) => changeSources(e.currentTarget.checked)} />
    </label>
    <label class="flex items-center justify-between gap-4 py-4 border-b border-line">
      {label('Show wire sidebar', '显示快讯侧栏')}
      <input type="checkbox" checked={rail} onChange={(e) => { setRail(e.currentTarget.checked); localStorage.setItem('tape-wire-rail', e.currentTarget.checked ? '1' : '0') }} />
    </label>
    <h2 class={heading}>{label('Portfolio cards', '持仓分析卡片')}</h2>
    <div class="grid sm:grid-cols-2 gap-x-6">
      {BOOK_CARDS.map((card) => <label key={card.id} class="flex items-center justify-between gap-4 py-3 border-b border-line text-[12px]">
        {tl(card.label)}<input type="checkbox" checked={!hidden.includes(card.id)} onChange={() => toggleCard(card.id)} />
      </label>)}
    </div>
    <h2 class={heading}>{label('Services', '服务')}</h2>
    <dl class="text-[12px]">
      {[
        [label('Wire', '快讯'), IS_PRIVATE_BUILD ? label('Live stream', '实时推送') : label('Headline mirror · periodic updates', '快讯镜像 · 定期更新')],
        [label('AI chat', 'AI 对话'), IS_PRIVATE_BUILD ? label('Available', '可用') : label('Unavailable', '暂不可用')],
        [label('Portfolio', '持仓'), IS_PRIVATE_BUILD ? label('IBKR + manual', 'IBKR 与手动组合') : label('Manual', '手动组合')],
      ].map(([name, status]) => <div key={name} class="flex justify-between gap-4 py-3 border-b border-line"><dt>{name}</dt><dd class="text-ink-2 text-right">{status}</dd></div>)}
    </dl>
  </section>
}
