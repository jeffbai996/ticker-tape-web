/** Compact labels for the narrow AI report picker. Provider families add no
 * routing information here; the option value keeps the original model key. */
export function reportModelLabel(label) {
  return String(label || '').replace(/^(?:Claude|Gemini)\s+/i, '')
}
