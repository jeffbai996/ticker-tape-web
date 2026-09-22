import { useState } from 'preact/hooks'
import { getLocale, setLocale } from '../lib/i18n.js'
import { IS_FAMILY_BUILD } from '../lib/nav.js'
import { getMarketColorOrder, saveMarketColorOrder, defaultMarketColorOrder } from '../lib/marketColors.js'

export function Settings() {
  const [locale, language] = useState(getLocale)
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
  }
  const control = 'rounded border border-line-2 bg-panel px-3 py-2 text-ink text-sm'
  return <section class="max-w-3xl mx-auto p-5 text-ink">
    <div class="flex items-center justify-between border-b border-line pb-4 mb-2">
      <h1 class="text-xl font-semibold">{label('Settings', '设置')}</h1>
      <button class={control} onClick={reset}>{label('Reset', '重置')}</button>
    </div>
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
    <label class="flex items-center justify-between gap-4 py-5 border-b border-line">
      {label('Chinese-language wire sources', '快讯中文来源')}
      <input type="checkbox" checked={chinese} onChange={(e) => changeSources(e.currentTarget.checked)} />
    </label>
  </section>
}
