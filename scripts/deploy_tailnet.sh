#!/usr/bin/env bash
# Validate immutable bytes before atomically publishing the tailnet release.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---build-only}"
SOURCE_SHA="${2:-}"
# The licensed face is not in Git; a release without it 404s on every route.
FONT_FILE="${TTW_PRIVATE_FONT_FILE:-${HOME}/repos/newsservice/static/fonts/AnthropicSansVariable-TextRegular.woff2}"
if [[ "$MODE" != "--build-only" && "$MODE" != "--deploy" ]]; then
  echo "usage: scripts/deploy_tailnet.sh [--build-only|--deploy] FULL_SOURCE_SHA" >&2
  exit 2
fi
if [[ ! -f "$FONT_FILE" ]]; then
  echo "private UI font file is missing" >&2
  exit 2
fi
# shellcheck source=private_release.sh
source "$ROOT/scripts/private_release.sh"
if ! node -e "if (!require('node:util').styleText) process.exit(1)" >/dev/null 2>&1; then
  newest="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [[ -n "$newest" ]]; then export PATH="$newest:$PATH"; fi
fi
release_prepare "$ROOT" "$SOURCE_SHA"
# The server reads the shared checkout's link, not one in this release
# checkout: publishing only to $ROOT/dist-tailnet reported success while the
# live site stayed on the old release.
SHARED_LINK="$HOME/repos/ticker-tape-web/dist-tailnet"
if [[ -n "${TTW_TAILNET_LINK:-}" ]]; then LINK="$TTW_TAILNET_LINK"
elif [[ -L "$SHARED_LINK" ]]; then LINK="$SHARED_LINK"
else LINK="$ROOT/dist-tailnet"; fi
RELEASES="$ROOT/dist-tailnet-releases"
release="$RELEASES/$SOURCE_SHA-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$release"
VITE_PRIVATE=1 TTW_BASE=/ TTW_OUT_DIR="$release" npm run build
mkdir -p "$release/fonts"
install -m 0644 "$FONT_FILE" "$release/fonts/AnthropicSansVariable-TextRegular.woff2"
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
# Read the release back through the link that is actually served.
if ! grep -q "\"source_sha\":\"$SOURCE_SHA\"" "$LINK/release.json"; then
  echo "served link $LINK does not resolve to source $SOURCE_SHA" >&2
  exit 1
fi
echo "serving source $SOURCE_SHA through $LINK"
# Preserve the established bounded rollback window after successful publish.
KEEP=3
# Never delete a release any known link still serves.
protected=()
for link in "$LINK" "$SHARED_LINK" "$ROOT/dist-tailnet"; do
  if [[ -L "$link" ]]; then protected+=("$(readlink -f "$link")"); fi
done
# shellcheck disable=SC2012
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  target="$(readlink -f "$old")"
  for keep in "${protected[@]}"; do [[ "$keep" == "$target" ]] && continue 2; done
  rm -rf -- "$old"
done
