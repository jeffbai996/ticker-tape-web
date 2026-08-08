// Output dials for every one-button generate. The button used to be a coin
// flip on length and register; these notches ride along with the system prompt
// so the same data can come back as a two-line read or a full memo without
// retyping an instruction every time (Jeff 2026-08-06).

const KEY = 'ai_dials_v1'

export const LENGTHS = [
  { key: 'flash', label: 'flash', rule: 'Hard cap: 60 words. Give the desk call and the one or two numbers that support it. Nothing else.' },
  { key: 'brief', label: 'brief', rule: 'Hard cap: 120 words. Lead with the single most important line, then at most three bullets. No preamble, no summary of what you are about to say.' },
  { key: 'standard', label: 'standard', rule: 'Target 300-450 words. Short sections, dense bullets, no filler transitions.' },
  { key: 'deep', label: 'deep', rule: 'Target 700-1000 words. Take the second-order effects seriously and show the reasoning chain, but never pad — length is a budget, not a quota.' },
]

export const TONES = [
  { key: 'analyst', label: 'analyst', rule: 'Register: buy-side analyst writing for a portfolio manager who already knows the basics. Numbers before adjectives.' },
  { key: 'trader', label: 'trader', rule: 'Register: trading-desk read. Prioritize what changed, positioning implications, actionable levels, and the next catalyst.' },
  { key: 'catalyst', label: 'catalyst', rule: 'Register: event-driven analyst. Organize the read around dated catalysts, expected reactions, and what would surprise the market.' },
  { key: 'risk', label: 'risk', rule: 'Register: risk manager. Lead with concentration, correlation, drawdown paths, invalidation levels, and what needs hedging or monitoring.' },
  { key: 'blunt', label: 'blunt', rule: 'Register: blunt and conversational. Say the thing directly, skip hedging language, no throat-clearing.' },
  { key: 'skeptic', label: 'skeptic', rule: 'Register: adversarial reviewer. Attack the consensus read, name what would have to be true for it to be wrong, and rank the assumptions by fragility.' },
]

export const DEFAULT_DIALS = { length: 'standard', tone: 'analyst', disconfirm: false }

function clean(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DIALS }
  return {
    length: LENGTHS.some((l) => l.key === raw.length) ? raw.length : DEFAULT_DIALS.length,
    tone: TONES.some((t) => t.key === raw.tone) ? raw.tone : DEFAULT_DIALS.tone,
    disconfirm: !!raw.disconfirm,
  }
}

export function loadDials() {
  try { return clean(JSON.parse(localStorage.getItem(KEY))) } catch { return { ...DEFAULT_DIALS } }
}

export function saveDials(dials) {
  const next = clean(dials)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* quota — dials just won't persist */ }
  return next
}

/**
 * Fold the dials into a system prompt. Appended rather than prepended so a
 * caller's own instructions still set the subject — these only govern shape.
 */
export function applyDials(system, dials) {
  const d = clean(dials)
  const lines = [
    LENGTHS.find((l) => l.key === d.length).rule,
    TONES.find((t) => t.key === d.tone).rule,
  ]
  if (d.disconfirm) {
    lines.push('Close with a DISCONFIRMING EVIDENCE section: the strongest specific case against the read above, and what observable would settle it.')
  }
  return `${system || ''}\n\nOUTPUT DIALS (these govern shape, not subject):\n${lines.map((l) => `- ${l}`).join('\n')}`
}

/** Apply the UI locale to model output without translating tool names, JSON,
 *  symbols, or source data that needs to remain exact. */
export function applyLanguagePreference(system, locale) {
  if (locale !== 'zh') return system || ''
  return `${system || ''}\n\nOUTPUT LANGUAGE:\n- Respond in Simplified Chinese. Keep ticker symbols, numbers, quoted source text, tool names, and JSON keys unchanged when precision requires it.`
}

/** Assemble every user-visible generation preference in one place so the
 *  report, memo, and market-read entry points cannot drift apart. */
export function applyAiPreferences(system, { dials, instructions = '', locale = 'en' } = {}) {
  let shaped = applyDials(system, dials)
  const custom = String(instructions || '').trim()
  if (custom) {
    shaped += `\n\nCUSTOM GENERATION INSTRUCTIONS:\n${custom}`
  }
  return applyLanguagePreference(shaped, locale)
}
