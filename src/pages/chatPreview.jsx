import { tl, t as tt } from '../lib/i18n.js'

const CONTEXT = ['live quotes', 'technicals', 'calendar', 'watchlist', 'alerts', 'memory', 'journal']
const EXAMPLES = [
  'what is moving today?',
  'what is on the calendar this week?',
  'compare two companies',
  'explain a technical signal',
]

/** Public product preview. This intentionally owns no hooks, clients, or
 * service imports: the controls communicate the production surface without
 * creating a hidden path to a disabled model or private thread store. */
export function ChatPreview() {
  return (
    <div data-ai-preview data-service-state="disabled" class="relative flex-1 flex flex-col min-h-0 min-w-0 p-3 pt-12 select-text">
      <div class="absolute top-4 left-4 flex items-center gap-2">
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
             class="shrink-0 text-accent" fill="none" stroke="currentColor"
             stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 13.2a3.3 3.3 0 0 1-3.3 3.3H10l-4.2 3.2a.5.5 0 0 1-.8-.4v-2.8A3.3 3.3 0 0 1 4 13.2V7.3A3.3 3.3 0 0 1 7.3 4h9.4A3.3 3.3 0 0 1 20 7.3z" />
          <path d="M8.4 9.2h7.2M8.4 12.2h4.4" />
        </svg>
        <h1 class="font-anth font-bold text-[17px] leading-tight text-ink">{tl('AI Chat')}</h1>
        <span class="w-1.5 h-1.5 rounded-full bg-muted" />
        <span class="font-mono text-[9px] uppercase tracking-wider text-muted border border-line rounded px-1.5 py-0.5">
          {tl('preview')}
        </span>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto flex flex-col [justify-content:safe_center]">
        <div class="max-w-[50rem] w-full mx-auto flex flex-col gap-4 py-6">
          <div>
            <p class="font-anth text-[11px] uppercase tracking-[0.16em] text-accent">{tl('operator workspace')}</p>
            <h2 class="font-anth font-semibold text-[clamp(20px,4vw,32px)] tracking-[-0.035em] text-ink">
              {tt('chat.preview_heading')}
            </h2>
            <p class="font-anth text-[12px] text-muted mt-1">{tt('chat.preview_disabled')}</p>
          </div>

          <div class="grid sm:grid-cols-2 border border-line rounded-xl overflow-hidden bg-surface-1">
            <section class="p-3 border-b sm:border-b-0 sm:border-r border-line">
              <h3 class="font-mono text-[9px] uppercase tracking-widest text-muted mb-2">{tl('context')}</h3>
              <div class="flex flex-wrap gap-1.5">
                {CONTEXT.map((item) => (
                  <span key={item} class="font-mono text-[10px] text-ink-2 border border-line rounded px-1.5 py-0.5">{tl(item)}</span>
                ))}
              </div>
            </section>
            <section class="p-3">
              <h3 class="font-mono text-[9px] uppercase tracking-widest text-muted mb-2">{tl('service')}</h3>
              <div class="flex items-center gap-2 font-anth text-[12px] text-ink-2">
                <span class="w-1.5 h-1.5 rounded-full bg-muted" />
                {tl('disabled in public demo')}
              </div>
              <p class="font-anth text-[10.5px] text-muted mt-1">{tl('No request will be sent.')}</p>
            </section>
          </div>

          <div class="flex flex-wrap gap-1.5" aria-label={tl('example prompts')}>
            {EXAMPLES.map((item) => (
              <button key={item} type="button" disabled
                class="font-anth text-[11.5px] text-muted border border-line rounded-full px-3 py-1 disabled:cursor-not-allowed">
                {tl(item)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <form class="max-w-[46rem] w-full mx-auto pt-2" onSubmit={(event) => event.preventDefault()}>
        <div class="flex items-center gap-2 bg-surface-2 border border-line-2 rounded-xl px-3 py-1.5 opacity-80">
          <textarea disabled rows={1} placeholder={tt('chat.placeholder')}
            class="flex-1 bg-transparent resize-none outline-none text-[13.5px] leading-[21px] py-[5.5px] text-muted font-anth disabled:cursor-not-allowed" />
          <button type="submit" disabled aria-label={tl('send')}
            class="shrink-0 w-8 h-8 grid place-items-center rounded-md bg-surface-3 text-muted disabled:cursor-not-allowed">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
        <div class="flex items-center gap-2 px-2 pt-1 font-mono text-[9.5px] text-muted flex-wrap">
          <select data-model-preview disabled aria-label={tl('model')}
            class="appearance-none bg-surface-2 border border-line rounded-md px-2 py-[3px] font-anth text-[10.5px] text-muted disabled:cursor-not-allowed">
            <option>{tl('model unavailable')}</option>
          </select>
          <span data-effort-preview class="flex items-center gap-0.5 bg-surface-2 border border-line rounded-md px-0.5 py-px">
            {['low', 'med', 'high'].map((level) => (
              <button key={level} type="button" disabled class="px-1.5 py-px font-anth text-[10px] text-muted rounded disabled:cursor-not-allowed">{level}</button>
            ))}
          </span>
          <span class="ml-auto">{tl('preview only')}</span>
        </div>
      </form>
    </div>
  )
}
