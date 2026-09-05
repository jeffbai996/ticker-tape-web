import { readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, sep } from 'node:path'

// Process-output assertions may only read this suite's generated temporary
// artifacts, never application source or a live deployment/state directory.
export function readFixtureArtifact(root, file) {
  const base = realpathSync(root), target = realpathSync(file)
  if (dirname(base) !== realpathSync(tmpdir()) || !basename(base).startsWith('ttw-release-test-') || !target.startsWith(base + sep)) {
    throw new Error('release fixture artifact escaped its temporary root')
  }
  return readFileSync(target, 'utf8')
}
