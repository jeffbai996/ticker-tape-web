#!/usr/bin/env bash
# First-paint budget, in two gates.
#
# Vitest can assert that pages and the chart library are imported dynamically,
# but it cannot see what the bundler actually emitted. This runs the real build
# and fails when first paint drifts back over budget — the regression that put
# the app past Vite's 500 kB warning in the first place.
#
#   1. entry chunk (dist/assets/index-*.js) — new work must land in a route
#      chunk, not the shell.
#   2. eager set — the entry module PLUS every chunk index.html modulepreloads.
#      Gate 1 alone lies: lightweight-charts sat in its own hashed file for
#      months, so the entry chunk looked fine while the browser still fetched
#      and parsed 165 kB of charting engine before anything rendered, on a
#      landing route whose default widget rail contains no chart at all.
#      (2026-08-18: eager set 493,533 → 331,132 bytes once the dashboard and
#      demo-portfolio widgets moved behind src/components/LazyChart.jsx.)
#
# Budgets are raw (pre-gzip) bytes. Raise either one only with a reason.
#
# Usage: bash scripts/bundle_budget.sh [entry-bytes] [first-paint-bytes]
set -euo pipefail

BUDGET="${1:-90000}"
FIRST_PAINT_BUDGET="${2:-370000}"
cd "$(dirname "$0")/.."

npm run build >/dev/null

entry=$(ls -1 dist/assets/index-*.js 2>/dev/null | head -n 1)
if [[ -z "$entry" ]]; then
  echo "bundle_budget: no entry chunk found in dist/assets" >&2
  exit 1
fi

size=$(wc -c <"$entry")
printf 'entry chunk %s: %s bytes (budget %s)\n' "$(basename "$entry")" "$size" "$BUDGET"

# Split on '<' so the scan does not depend on how Vite line-wraps the head.
refs=$(tr '<' '\n' <dist/index.html \
  | grep -E 'rel="modulepreload"|script[^>]*type="module"' \
  | grep -oE 'assets/[A-Za-z0-9._-]+\.js' \
  | sort -u)

if [[ -z "$refs" ]]; then
  echo "bundle_budget: dist/index.html references no eager modules — parse failed" >&2
  exit 1
fi

total=0
count=0
while read -r ref; do
  [[ -z "$ref" ]] && continue
  if [[ ! -f "dist/$ref" ]]; then
    echo "bundle_budget: dist/index.html points at missing $ref" >&2
    exit 1
  fi
  total=$(( total + $(wc -c <"dist/$ref") ))
  count=$(( count + 1 ))
done <<<"$refs"

printf 'first paint (%s eager chunks): %s bytes (budget %s)\n' \
  "$count" "$total" "$FIRST_PAINT_BUDGET"

over=0
if (( size > BUDGET )); then
  echo "bundle_budget: entry chunk is over budget — move new work into a lazy route chunk" >&2
  over=1
fi

if (( total > FIRST_PAINT_BUDGET )); then
  echo "bundle_budget: the eager set is over budget — something heavy is being" >&2
  echo "  modulepreloaded before it is on screen. The biggest eager chunks:" >&2
  # printf to stdout so sort/head see it; the whole pipeline goes to stderr.
  {
    while read -r ref; do
      [[ -z "$ref" ]] && continue
      printf '%10s  %s\n' "$(wc -c <"dist/$ref")" "$ref"
    done <<<"$refs" | sort -rn | head -n 5
  } >&2
  over=1
fi

exit "$over"
