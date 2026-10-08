#!/usr/bin/env bash
# Shared fail-closed admission and validation for private release scripts.
release_prepare() {
  local root="$1" requested="$2"
  if [[ ! "$requested" =~ ^[a-f0-9]{40}$ ]] ||
     [[ "$(git -C "$root" rev-parse HEAD)" != "$requested" ]]; then
    echo "release requires the full 40-character current HEAD SHA" >&2
    return 2
  fi
  if [[ -n "$(git -C "$root" status --porcelain --untracked-files=normal)" ]]; then
    echo "release requires a clean committed source checkout" >&2
    return 2
  fi
  SOURCE_SHA="$requested"
  SOURCE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ttw-release-source.XXXXXX")"
  trap 'rm -rf -- "$SOURCE_DIR"' EXIT
  git -C "$root" archive "$SOURCE_SHA" | tar -x -C "$SOURCE_DIR"
  # Ignored .env files and inherited build flags are not release inputs.
  unset VITE_SYNC_CAPABILITY VITE_FAMILY_BUILD VITE_PRIVATE TTW_BASE TTW_OUT_DIR
  cd "$SOURCE_DIR"
  npm ci
  npm test
}

release_probe() {
  local release="$1" variant="$2"
  [[ -f "$release/index.html" ]] || {
    echo "release build has no index.html" >&2; return 1;
  }
  # Family capabilities must never contact production from validation.
  "${TTW_PROBE_PYTHON:-python3}" scripts/probe_gate.py --dist "$release" \
    --offline --json-out "$release/probe-matrix.json"
  printf '{"source_sha":"%s","variant":"%s"}\n' "$SOURCE_SHA" "$variant" \
    > "$release/release.json"
  (cd "$release"; find . -type f ! -name artifact-sha256.txt -print0 |
    sort -z | xargs -0 sha256sum > artifact-sha256.txt)
}
