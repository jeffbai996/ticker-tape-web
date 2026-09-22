import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFixtureArtifact } from './helpers/release_artifacts.js'

const created = []
afterEach(() => { for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'ttw-release-test-'))
  created.push(base)
  const repo = join(base, 'repo'), bin = join(base, 'bin'), home = join(base, 'home')
  for (const dir of [repo, bin, home, join(repo, 'scripts')]) mkdirSync(dir, { recursive: true })
  for (const file of ['private_release.sh', 'deploy_family.sh', 'deploy_tailnet.sh']) {
    copyFileSync(resolve('scripts', file), join(repo, 'scripts', file))
  }
  writeFileSync(join(repo, '.gitignore'), 'dist-family-releases/\ndist-tailnet-releases/\ndist-tailnet\n.env\n')
  writeFileSync(join(repo, 'source.txt'), 'committed bytes')
  writeFileSync(join(repo, '.env'), 'IGNORED_PRIVATE_CONFIG=must-not-be-archived')
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q'); git('add', '.')
  git('-c', 'user.name=alice', '-c', 'user.email=user@example.com', 'commit', '-qm', 'fixture')
  const sha = git('rev-parse', 'HEAD')
  const log = join(base, 'steps')
  const executable = (name, script) => { const path = join(bin, name); writeFileSync(path, '#!/usr/bin/env bash\nset -eu\n' + script); chmodSync(path, 0o755) }
  executable('node', 'echo true\n')
  executable('npm', `echo "$*" >> "$STEP_LOG"
[ ! -e .env ] || exit 81
[ "$(cat source.txt)" = 'committed bytes' ] || exit 82
[ "$*" != "\${FAIL_STEP:-none}" ] || exit 83
if [ "$*" = 'run build' ]; then mkdir -p "$TTW_OUT_DIR"; echo built > "$TTW_OUT_DIR/index.html"; fi
`)
  executable('python3', `echo probe >> "$STEP_LOG"
[ "\${FAIL_STEP:-none}" != probe ] || exit 84
[[ "$*" == *--offline* ]] || exit 85
`)
  executable('npx', 'echo publish >> "$STEP_LOG"\n')
  const token = join(base, 'token'), font = join(base, 'font')
  writeFileSync(token, '0'.repeat(32)); writeFileSync(font, 'synthetic font')
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, STEP_LOG: log,
    TTW_SYNC_TOKEN_FILE: token, TTW_PRIVATE_FONT_FILE: font, TTW_PROBE_PYTHON: join(bin, 'python3') }
  const run = (variant, mode = '--deploy', requested = sha, extra = {}) => spawnSync('bash', [`scripts/deploy_${variant}.sh`, mode, requested], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' })
  const steps = () => existsSync(log) ? readFixtureArtifact(base, log).trim().split('\n') : []
  return { base, repo, sha, run, steps }
}

describe.each(['family', 'tailnet'])('%s release admission', variant => {
  it('rejects abbreviated or different source SHA before any validation or publish', () => {
    const f = fixture()
    for (const sha of [f.sha.slice(0, 7), 'f'.repeat(40)]) expect(f.run(variant, '--deploy', sha).status).not.toBe(0)
    expect(f.steps()).toEqual([])
  })
  it('rejects dirty tracked source and untracked source', () => {
    const f = fixture()
    writeFileSync(join(f.repo, 'source.txt'), 'dirty')
    expect(f.run(variant).status).not.toBe(0)
    writeFileSync(join(f.repo, 'source.txt'), 'committed bytes')
    writeFileSync(join(f.repo, 'untracked.js'), 'uncommitted')
    expect(f.run(variant).status).not.toBe(0)
    expect(f.steps()).toEqual([])
  })
  it.each(['ci', 'test', 'run build', 'probe'])('does not publish if %s fails', step => {
    const f = fixture()
    const previous = join(f.repo, 'dist-tailnet-releases', 'previous')
    mkdirSync(previous, { recursive: true })
    symlinkSync(previous, join(f.repo, 'dist-tailnet'))
    expect(f.run(variant, '--deploy', f.sha, { FAIL_STEP: step }).status).not.toBe(0)
    expect(f.steps()).not.toContain('publish')
    expect(readlinkSync(join(f.repo, 'dist-tailnet'))).toBe(previous)
  })
  it('validates archived bytes in order before publishing and records provenance', () => {
    const f = fixture(), result = f.run(variant)
    expect(result.status, result.stderr).toBe(0)
    expect(f.steps()).toEqual(['ci', 'test', 'run build', 'probe', ...(variant === 'family' ? ['publish'] : [])])
    if (variant === 'tailnet') {
      const release = readlinkSync(join(f.repo, 'dist-tailnet'))
      expect(JSON.parse(readFixtureArtifact(f.base, join(release, 'release.json'))).source_sha).toBe(f.sha)
      expect(readFixtureArtifact(f.base, join(release, 'artifact-sha256.txt'))).toContain('index.html')
    }
  })
  it('defaults build-only to validated output without a publish action', () => {
    const f = fixture(), result = f.run(variant, '--build-only')
    expect(result.status, result.stderr).toBe(0)
    expect(f.steps()).toEqual(['ci', 'test', 'run build', 'probe'])
    expect(existsSync(join(f.repo, 'dist-tailnet'))).toBe(false)
  })
})
