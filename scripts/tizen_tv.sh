#!/usr/bin/env bash
# Build, sign and optionally install the Samsung TV widget.
#
# Runs from WSL against a Windows Tizen Studio install. Signing happens in a
# Windows temp directory because Tizen's Windows signer rejects WSL UNC paths.
#
#   TIZEN_PROFILE=<certificate profile> scripts/tizen_tv.sh
#   TIZEN_PROFILE=<profile> TIZEN_TV=<tv-ip> scripts/tizen_tv.sh --install
#
# TIZEN_STUDIO defaults to /mnt/c/tizen-studio. The signed widget is copied to
# dist-tizen/TickerTapeTV-<version>.wgt.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL=0
[[ "${1:-}" == "--install" ]] && INSTALL=1
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
(cd "$ROOT" && npm run --silent build:tv)

win_temp="$(wslpath -u "$("$CMD" /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')")"
work="$win_temp/ttw-tv-$(date +%Y%m%d-%H%M%S)-$$"
stage="$work/widget"
mkdir -p "$stage"
trap 'rm -rf "$work"' EXIT
cp -r "$ROOT/dist-tv/." "$stage/"
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
    missing = {"config.xml", "index.html", "icon.png", "author-signature.xml", "signature1.xml"} - names
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
