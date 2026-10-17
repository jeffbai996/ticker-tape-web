import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Settings } from '../../src/pages/settings.jsx'
import { setLocale } from '../../src/lib/i18n.js'
import { getHighContrast } from '../../src/lib/contrast.js'

let host
beforeEach(() => {
  localStorage.clear()
  setLocale('en')
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => {
  render(null, host)
  host.remove()
})

describe('settings controls', () => {
  it('persists a switch change and restores it when settings is reopened', async () => {
    await act(() => render(h(Settings), host))
    const contrast = () => host.querySelector('[role="switch"][aria-label="Higher contrast"]')
    expect(contrast().getAttribute('aria-checked')).toBe('false')
    await act(() => contrast().click())
    expect(getHighContrast()).toBe(true)
    await act(() => render(null, host))
    await act(() => render(h(Settings), host))
    expect(contrast().getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the tape language override when the app language changes', async () => {
    await act(() => render(h(Settings), host))
    const change = async (id, value) => {
      const select = host.querySelector(`#${id}`)
      select.value = value
      await act(() => select.dispatchEvent(new Event('change', { bubbles: true })))
    }
    await change('settings-tape-language', 'en')
    await change('settings-language', 'zh')
    expect(localStorage.getItem('locale_v1')).toBe('zh')
    expect(localStorage.getItem('tape_locale_v1')).toBe('en')
    expect(host.querySelector('h1').textContent).toBe('设置')
    expect(host.querySelector('#settings-tape-language').value).toBe('en')
  })
})
