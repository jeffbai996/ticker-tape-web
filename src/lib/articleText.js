const PLATFORMS = new Set(['facebook', 'whatsapp', 'reddit', 'pinterest',
  'flipboard', 'twitter', 'x', 'linkedin', 'telegram'])
const SHARE_ACTIONS = new Set(['email', 'e-mail', 'copy link', 'share'])
const CONTROLS = new Set(['view original', 'share this article'])

/** Strip recognized publisher controls, never words inside article sentences.
 * A lone "Email" may be a legitimate heading; require a share-widget run. */
export function cleanArticleText(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n')
  const labels = lines.map(line => line.trim().replace(/\s+/g, ' ').toLowerCase())
  const removed = new Set()
  let run = []
  const finishRun = () => {
    const platforms = new Set(run.map(i => labels[i]).filter(label => PLATFORMS.has(label)))
    const hasAction = run.some(i => SHARE_ACTIONS.has(labels[i]))
    if (platforms.size >= 3 || (run.length >= 2 && platforms.size && hasAction)) {
      for (const i of run) removed.add(i)
    }
    run = []
  }
  for (let i = 0; i < lines.length; i++) {
    const label = labels[i]
    if (!label) continue
    if (PLATFORMS.has(label) || SHARE_ACTIONS.has(label)) run.push(i)
    else {
      finishRun()
      if (CONTROLS.has(label)) removed.add(i)
    }
  }
  finishRun()
  return lines.filter((_, i) => !removed.has(i)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
