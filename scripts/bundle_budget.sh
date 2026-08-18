#!/usr/bin/env bash
# Route budget for the entry chunk.
#
# Vitest can assert that routed pages are imported dynamically, but it cannot
# see what the bundler actually emitted. This runs the real build and fails when
# the entry chunk drifts back over budget — the regression that put the app past
# Vite's 500 kB warning in the first place.
#
# Budget is raw (pre-gzip) bytes of dist/assets/index-*.js. Raise it only with a
# reason: the point is that new work lands in a route chunk, not the shell.
#
# Usage: bash scripts/bundle_budget.sh [budget-bytes]
set -euo pipefail

BUDGET="${1:-420000}"
cd "$(dirname "$0")/.."

npm run build >/dev/null

entry=$(ls -1 dist/assets/index-*.js 2>/dev/null | head -n 1)
if [[ -z "$entry" ]]; then
  echo "bundle_budget: no entry chunk found in dist/assets" >&2
  exit 1
fi

size=$(wc -c <"$entry")
printf 'entry chunk %s: %s bytes (budget %s)\n' "$(basename "$entry")" "$size" "$BUDGET"

if (( size > BUDGET )); then
  echo "bundle_budget: entry chunk is over budget — move new work into a lazy route chunk" >&2
  exit 1
fi
