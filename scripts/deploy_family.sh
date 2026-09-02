#!/usr/bin/env bash
# Build the separately hosted family bundle without ever placing its bearer on
# a command line, then optionally publish the existing ttw-family Assets Worker.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN_FILE="${TTW_SYNC_TOKEN_FILE:-${HOME}/.config/ttw/sync_token}"
FONT_FILE="${TTW_PRIVATE_FONT_FILE:-${HOME}/repos/fragwire/static/fonts/AnthropicSansVariable-TextRegular.woff2}"
MODE="${1:---build-only}"

if [[ "$MODE" != "--build-only" && "$MODE" != "--deploy" ]]; then
  echo "usage: scripts/deploy_family.sh [--build-only|--deploy]" >&2
  exit 2
fi
if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "family sync token file is missing" >&2
  exit 2
fi
mapfile -t token_lines < "$TOKEN_FILE"
sync_token="${token_lines[0]:-}"
unset token_lines
if [[ ! "$sync_token" =~ ^[a-f0-9]{32}$ ]]; then
  echo "family sync token file has the wrong shape" >&2
  exit 2
fi
if [[ ! -f "$FONT_FILE" ]]; then
  echo "private family font file is missing" >&2
  exit 2
fi

if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "${HOME}/.nvm/nvm.sh"
  nvm use 22.22.2 >/dev/null
fi
if [[ "$(node -p 'Number(process.versions.node.split(`.`)[0]) >= 22')" != "true" ]]; then
  echo "Node 22 or newer is required" >&2
  exit 2
fi

cd "$ROOT"
VITE_FAMILY_BUILD=1 \
VITE_SYNC_CAPABILITY="$sync_token" \
TTW_BASE=/tape-fmnco7yjx6/ \
TTW_OUT_DIR=dist-family \
  npm run build
unset sync_token

install -d -m 0700 dist-family/fonts
install -m 0600 "$FONT_FILE" dist-family/fonts/AnthropicSansVariable-TextRegular.woff2

if [[ "$MODE" == "--build-only" ]]; then
  echo "family bundle built; deploy not requested"
  exit 0
fi

asset_root="$(mktemp -d "${TMPDIR:-/tmp}/ttw-family-assets.XXXXXX")"
cleanup() {
  rm -rf -- "$asset_root"
}
trap cleanup EXIT
install -d -m 0700 "$asset_root/tape-fmnco7yjx6"
cp -a dist-family/. "$asset_root/tape-fmnco7yjx6/"

npx --yes wrangler@4.37.1 deploy \
  --name ttw-family \
  --compatibility-date 2026-01-24 \
  --assets "$asset_root" \
  --route 'jeffbai.com/tape-fmnco7yjx6' \
  --route 'jeffbai.com/tape-fmnco7yjx6/*'
