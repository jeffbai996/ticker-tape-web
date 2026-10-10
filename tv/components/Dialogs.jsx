import { useEffect, useRef, useState } from 'preact/hooks'
import { normalizeSymbol } from '../lib/watchlist.js'

// Samsung's on-screen keyboard reports its own Done and Cancel keys.
const IME_DONE = 65376
const IME_CANCEL = 65385

export function AddDialog({ onSubmit, onCancel }) {
  const input = useRef(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { input.current?.focus() }, [])

  const submit = () => {
    if (!normalizeSymbol(value)) {
      setError('Enter a symbol such as AAPL, BRK-B, ^GSPC or ES=F.')
      return
    }
    onSubmit(value)
  }

  // The dialog consumes its keys. Preact re-renders in a microtask, and the
  // browser drains microtasks between listeners, so by the time this keydown
  // reached the app's window handler the dialog would already be gone and
  // Enter would open a chart, or Back would exit the app.
  const onKeyDown = (e) => {
    const done = e.keyCode === 13 || e.keyCode === IME_DONE
    const cancel = e.keyCode === 10009 || e.keyCode === 27 || e.keyCode === IME_CANCEL
    if (!done && !cancel) return
    e.preventDefault()
    e.stopPropagation()
    if (done) submit()
    else onCancel()
  }

  return (
    <div class="tv-scrim">
      <div class="tv-dialog">
        <h2>Add a symbol</h2>
        <input
          ref={input}
          class="tv-input"
          value={value}
          onInput={(e) => { setValue(e.currentTarget.value); setError('') }}
          onKeyDown={onKeyDown}
          autocapitalize="characters"
          autocomplete="off"
          spellcheck={false}
          maxLength={20}
        />
        <p class={error ? 'tv-dialog-error' : 'tv-dialog-hint'}>
          {error || 'Press OK to add it to the end of the watchlist, or Back to cancel.'}
        </p>
      </div>
    </div>
  )
}

export function RemoveDialog({ symbol }) {
  return (
    <div class="tv-scrim">
      <div class="tv-dialog">
        <h2>Remove {symbol} from the watchlist?</h2>
        <p class="tv-dialog-hint">Press OK to remove it, or Back to keep it.</p>
      </div>
    </div>
  )
}
