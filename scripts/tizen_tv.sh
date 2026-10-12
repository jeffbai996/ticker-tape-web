#!/usr/bin/env bash
# Build, sign and optionally install the Samsung TV widget.
#
# Runs from WSL against a Windows Tizen Studio install. Signing happens in a
# Windows temp directory because Tizen's Windows signer rejects WSL UNC paths.
#
#   TIZEN_PROFILE=<profile> scripts/tizen_tv.sh                      # public data
#   TIZEN_PROFILE=<profile> scripts/tizen_tv.sh --family <full sha>  # family books
#   ... --install with TIZEN_TV=<tv-ip> also installs and launches it.
#
# --family builds the family edition: the sync capability from
# ~/.config/ttw/sync_token is compiled in, so like scripts/deploy_family.sh
# it builds only from a clean committed checkout at the named SHA, after the
# full test suite, and never takes the capability on a command line.
#
# TIZEN_STUDIO defaults to /mnt/c/tizen-studio. The signed widget is copied to
# dist-tizen/TickerTapeTV-<version>.wgt.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL=0
FAMILY=0
SOURCE_SHA=""
while (( $# )); do
  case "$1" in
    --install) INSTALL=1 ;;
    --family) FAMILY=1; SOURCE_SHA="${2:-}"; shift ;;
    *) echo "usage: scripts/tizen_tv.sh [--install] [--family FULL_SOURCE_SHA]" >&2; exit 2 ;;
  esac
  shift
done
: "${TIZEN_PROFILE:?set TIZEN_PROFILE to a Samsung TV certificate profile name}"
if (( INSTALL )); then : "${TIZEN_TV:?set TIZEN_TV to the TV address for --install}"; fi
STUDIO="${TIZEN_STUDIO:-/mnt/c/tizen-studio}"
TIZEN_BAT="$(wslpath -w "$STUDIO/tools/ide/bin/tizen.bat")"
SDB="$STUDIO/tools/sdb.exe"
CMD=/mnt/c/Windows/System32/cmd.exe
APP_ID="$(sed -n 's/.*tizen:application id="\([^"]*\)".*/\1/p' "$ROOT/tizen/config.xml")"
VERSION="$(sed -n 's/^ *version="\([^"]*\)".*/\1/p' "$ROOT/tizen/config.xml" | head -1)"

# tizen.bat is a batch file, so it goes through cmd.exe from a Windows cwd.
tizen() { (cd /mnt/c && "$CMD" /c "$TIZEN_BAT" "$@" | tr -d '\r'); }

if ! node -e "if (!require('node:util').styleText) process.exit(1)" >/dev/null 2>&1; then
  newest="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [[ -n "$newest" ]]; then export PATH="$newest:$PATH"; fi
fi

SOURCE_DIR=""
if (( FAMILY )); then
  TOKEN_FILE="${TTW_SYNC_TOKEN_FILE:-${HOME}/.config/ttw/sync_token}"
  READER_FILE="${HOME}/.config/ttw/reader_token"
  FONT_FILE="${TTW_PRIVATE_FONT_FILE:-${HOME}/repos/fragwire/static/fonts/AnthropicSansVariable-TextRegular.woff2}"
  [[ -f "$TOKEN_FILE" ]] || { echo "family sync token file is missing" >&2; exit 2; }
  [[ -f "$FONT_FILE" ]] || { echo "private family font file is missing" >&2; exit 2; }
  mapfile -t token_lines < "$TOKEN_FILE"
  sync_token="${token_lines[0]:-}"
  unset token_lines
  if [[ ! "$sync_token" =~ ^[a-f0-9]{32}$ ]]; then
    echo "family sync token file has the wrong shape" >&2
    exit 2
  fi
  reader_token=""
  if [[ -f "$READER_FILE" ]]; then read -r reader_token < "$READER_FILE"; fi
  # shellcheck source=private_release.sh
  source "$ROOT/scripts/private_release.sh"
  release_prepare "$ROOT" "$SOURCE_SHA"   # cds into a clean archive of SOURCE_SHA
  VITE_FAMILY_BUILD=1 \
  VITE_SYNC_CAPABILITY="$sync_token" \
  VITE_READER_CAPABILITY="$reader_token" \
    npm run --silent build:tv
  unset sync_token reader_token
  install -d -m 0700 "$SOURCE_DIR/dist-tv/fonts"
  install -m 0600 "$FONT_FILE" "$SOURCE_DIR/dist-tv/fonts/AnthropicSansVariable-TextRegular.woff2"
  BUILD_DIR="$SOURCE_DIR/dist-tv"
else
  (cd "$ROOT" && npm run --silent build:tv)
  BUILD_DIR="$ROOT/dist-tv"
fi

win_temp="$(wslpath -u "$("$CMD" /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')")"
work="$win_temp/ttw-tv-$(date +%Y%m%d-%H%M%S)-$$"
stage="$work/widget"
mkdir -p "$stage"
# The family stage holds the capability in plain script: remove every copy.
trap 'rm -rf -- "$work" ${SOURCE_DIR:+"$SOURCE_DIR"}' EXIT
cp -r "$BUILD_DIR/." "$stage/"
# Web-only files: the widget has no service worker or install manifest.
rm -f "$stage/sw.js" "$stage/manifest.webmanifest"
cp "$ROOT/tizen/config.xml" "$ROOT/tizen/icon.png" "$stage/"

tizen package -t wgt -s "$TIZEN_PROFILE" -- "$(wslpath -w "$stage")"
shopt -s nullglob
built=("$stage"/*.wgt)
if (( ${#built[@]} != 1 )); then
  echo "expected one signed widget in $stage, found ${#built[@]}" >&2
  exit 1
fi

# A widget without both signatures installs on nothing; fail here instead.
python3 - "${built[0]}" "$VERSION" <<'PY'
import re, sys, zipfile
path, version = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(path) as z:
    names = set(z.namelist())
    missing = {"config.xml", "tv.html", "icon.png", "author-signature.xml", "signature1.xml"} - names
    if missing:
        sys.exit(f"widget is missing {', '.join(sorted(missing))}")
    if not any(n.startswith("assets/") and n.endswith(".js") for n in names):
        sys.exit("widget has no script bundle")
    widget = re.search(rb'<widget\b[^>]*\sversion="([^"]+)"', z.read("config.xml"))
    packaged = widget.group(1).decode() if widget else None
    if packaged != version:
        sys.exit(f"packaged version {packaged} != {version}")
PY

mkdir -p "$ROOT/dist-tizen"
out="$ROOT/dist-tizen/TickerTapeTV-$VERSION.wgt"
cp "${built[0]}" "$out"
chmod 0600 "$out"
echo "signed $out ($(stat -c %s "$out") bytes, sha256 $(sha256sum "$out" | cut -c1-16))"
# The CLI names the file after <name>; the TV's installer rejects a path
# with a space in it, so install from a copy with the release name.
wgt_name="$(basename "$out")"
mv "${built[0]}" "$stage/$wgt_name"

if (( INSTALL )); then
  target="$TIZEN_TV"
  [[ "$target" == *:* ]] || target="$target:26101"
  "$SDB" connect "$target" | tr -d '\r'
  serial="$("$SDB" devices | tr -d '\r' | awk -v t="$target" '$1 == t && $2 == "device" { print $1 }')"
  if [[ -z "$serial" ]]; then
    echo "TV $target is not connected. Check Developer Mode and the host IP set on the TV." >&2
    exit 1
  fi
  log="$(tizen install -s "$serial" -n "$wgt_name" -- "$(wslpath -w "$stage")")"
  echo "$log"
  # tizen.bat exits 0 on a failed install, so judge by its own report.
  if grep -q "Failed to install" <<<"$log"; then
    echo "The TV rejected the widget. Check that the certificate profile's distributor certificate lists this TV's DUID." >&2
    exit 1
  fi
  tizen run -s "$serial" -p "$APP_ID"
fi
