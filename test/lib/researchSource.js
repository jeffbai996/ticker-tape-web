// The research page is a lane, not a file (P1 "four pages have become feature
// monoliths"): `src/pages/research.jsx` is the shell and every subview lives in
// `src/pages/research/`. Source-string contracts point at the whole lane so a
// component that moved still has to keep the markup it was pinned on — the
// assertions do not get weaker, they get wider.

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const RESEARCH_SHELL = resolve(process.cwd(), 'src/pages/research.jsx')
export const RESEARCH_DIR = resolve(process.cwd(), 'src/pages/research')

/** Every file in the research lane, path-sorted, newest read each call. */
export function researchFiles() {
  return [
    RESEARCH_SHELL,
    ...readdirSync(RESEARCH_DIR).sort().map((f) => join(RESEARCH_DIR, f)),
  ]
}

/** The lane as one string, for `toContain` / `not.toContain` contracts. */
export function researchSource() {
  return researchFiles().map((f) => readFileSync(f, 'utf8')).join('\n')
}
