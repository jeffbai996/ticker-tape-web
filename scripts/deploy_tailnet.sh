#!/usr/bin/env bash
# Validate immutable bytes before atomically publishing the tailnet release.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---build-only}"
SOURCE_SHA="${2:-}"
if [[ "$MODE" != "--build-only" && "$MODE" != "--deploy" ]]; then
  echo "usage: scripts/deploy_tailnet.sh [--build-only|--deploy] FULL_SOURCE_SHA" >&2
  exit 2
fi
# shellcheck source=private_release.sh
source "$ROOT/scripts/private_release.sh"
if ! node -e "if (!require('node:util').styleText) process.exit(1)" >/dev/null 2>&1; then
  newest="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [[ -n "$newest" ]]; then export PATH="$newest:$PATH"; fi
fi
release_prepare "$ROOT" "$SOURCE_SHA"
LINK="$ROOT/dist-tailnet"
RELEASES="$ROOT/dist-tailnet-releases"
release="$RELEASES/$SOURCE_SHA-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$release"
VITE_PRIVATE=1 TTW_BASE=/ TTW_OUT_DIR="$release" npm run build
mkdir -p "$release/fonts"
if [[ -d "$ROOT/private/fonts" ]]; then
  cp "$ROOT"/private/fonts/*.woff2 "$release/fonts/" 2>/dev/null || true
fi
release_probe "$release" tailnet
if [[ "$MODE" == "--build-only" ]]; then
  echo "tailnet release validated: $release; source $SOURCE_SHA; deploy not requested"
  exit 0
fi
# Preserve the old directory on first migration; never overwrite a prior backup.
if [[ -e "$LINK" && ! -L "$LINK" ]]; then
  backup="$LINK.pre-atomic-$(date +%Y%m%d-%H%M%S)-$$"
  mv "$LINK" "$backup"
fi
# Unique temporary links prevent concurrent deploys from clobbering admission.
ln -s "$release" "$LINK.tmp.$$"
mv -T "$LINK.tmp.$$" "$LINK"
echo "published source $SOURCE_SHA at $release"
# Preserve the established bounded rollback window after successful publish.
KEEP=3
# shellcheck disable=SC2012
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  [[ "$(readlink -f "$LINK")" == "$(readlink -f "$old")" ]] && continue
  rm -rf -- "$old"
done
