#!/usr/bin/env bash
# Build the separately hosted family bundle without ever placing its bearer on
# a command line, then optionally publish the existing ttw-family Assets Worker.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN_FILE="${TTW_SYNC_TOKEN_FILE:-${HOME}/.config/ttw/sync_token}"
FONT_FILE="${TTW_PRIVATE_FONT_FILE:-${HOME}/repos/newsservice/static/fonts/AnthropicSansVariable-TextRegular.woff2}"
# The family entry point is private deployment configuration, never source.
if [[ -f "${TTW_FAMILY_CONFIG:-$HOME/.config/ttw/family_deploy.env}" ]]; then
  source "${TTW_FAMILY_CONFIG:-$HOME/.config/ttw/family_deploy.env}"
fi
family_base="${TTW_FAMILY_BASE:-}"
family_host="${TTW_FAMILY_HOST:-}"
if [[ ! "$family_base" =~ ^/[a-zA-Z0-9_-]{8,}/$ || ! "$family_host" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
  echo "private family route configuration is missing or invalid" >&2
  exit 2
fi
MODE="${1:---build-only}"
SOURCE_SHA="${2:-}"
# shellcheck source=private_release.sh
source "$ROOT/scripts/private_release.sh"

if [[ "$MODE" != "--build-only" && "$MODE" != "--deploy" ]]; then
  echo "usage: scripts/deploy_family.sh [--build-only|--deploy] FULL_SOURCE_SHA" >&2
  exit 2
fi
# Publishing a family bundle must never silently change assistant availability.
case "${TTW_FAMILY_AI:-}" in
  0|1) ;;
  "")
    if [[ "$MODE" == "--deploy" ]]; then
      echo "family deployment requires explicit TTW_FAMILY_AI=1 (enabled) or 0 (disabled)" >&2
      exit 2
    fi ;;
  *) echo "TTW_FAMILY_AI must be 0 or 1" >&2; exit 2 ;;
esac
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

release_prepare "$ROOT" "$SOURCE_SHA"
release="$ROOT/dist-family-releases/$SOURCE_SHA-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$release"
chmod 0700 "$ROOT/dist-family-releases" "$release"
reader_token=""
if [[ -f "$HOME/.config/ttw/reader_token" ]]; then
  read -r reader_token < "$HOME/.config/ttw/reader_token"
fi
# Personal news scope belongs to this private build, not the public source.
news_book_ids="${TTW_NEWS_PORTFOLIO_IDS:-}"
news_book_file="${TTW_NEWS_PORTFOLIO_IDS_FILE:-$HOME/.config/ttw/news_portfolio_ids}"
if [[ -z "$news_book_ids" && -f "$news_book_file" ]]; then
  IFS= read -r news_book_ids < "$news_book_file" || [[ -n "$news_book_ids" ]]
fi
if [[ -n "$news_book_ids" && ! "$news_book_ids" =~ ^p[0-9]{1,6}(,p[0-9]{1,6})*$ ]]; then
  echo "family news portfolio IDs have the wrong shape" >&2
  exit 2
fi
VITE_FAMILY_BUILD=1 \
VITE_NEWS_PORTFOLIO_IDS="$news_book_ids" \
VITE_FAMILY_AI="${TTW_FAMILY_AI:-0}" \
VITE_SYNC_CAPABILITY="$sync_token" \
VITE_READER_CAPABILITY="$reader_token" \
TTW_BASE="$family_base" \
TTW_OUT_DIR="$release" \
  npm run build
unset sync_token
unset reader_token

install -d -m 0700 "$release/fonts"
install -m 0600 "$FONT_FILE" "$release/fonts/AnthropicSansVariable-TextRegular.woff2"

release_probe "$release" family

if [[ "$MODE" == "--build-only" ]]; then
  echo "family release validated: $release; source $SOURCE_SHA; deploy not requested"
  exit 0
fi

asset_root="$(mktemp -d "${TMPDIR:-/tmp}/ttw-family-assets.XXXXXX")"
cleanup() {
  rm -rf -- "$asset_root" "$SOURCE_DIR"
}
trap cleanup EXIT
install -d -m 0700 "$asset_root${family_base%/}"
cp -a "$release/." "$asset_root$family_base"

npx --yes wrangler@4.37.1 deploy \
  --name ttw-family \
  --compatibility-date 2026-01-24 \
  --assets "$asset_root" \
  --route "${family_host}${family_base%/}" \
  --route "${family_host}${family_base}*" \
  --route "www.${family_host}${family_base%/}" \
  --route "www.${family_host}${family_base}*"
