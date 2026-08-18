#!/usr/bin/env bash
# Build the tailnet bundle and swap it in without ever taking the site down.
#
# `vite build` empties its output directory before writing, so building
# straight into the directory being served puts the site into a broken state
# for the length of the build — index.html and the hashed assets are missing or
# half-written, and anyone who loads during that window gets a dead page. With
# frequent rebuilds that is a recurring outage, not a theoretical one (Dan hit
# it on 2026-08-06 during a run of five rebuilds inside 35 minutes).
#
# So each build goes to its own release directory and `dist-tailnet` is a
# symlink pointing at the current one. Publishing is a single rename(2) over
# that symlink, which is atomic: a request either resolves through the old
# release or the new one, never through a directory mid-write. A build that
# fails or is killed leaves the symlink alone, so the previous release keeps
# serving rather than the site going dark.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The build chain (vite 8.2 / rolldown) needs Node >= 20.12 (`util.styleText`);
# host-a's system node is 18. Prefer the newest nvm-installed Node when the
# one on PATH is too old, so a cron/hook/bot shell can still publish.
if ! node -e "if (!require('node:util').styleText) process.exit(1)" >/dev/null 2>&1; then
  newest="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$newest" ]; then export PATH="$newest:$PATH"; fi
fi
echo "node $(node -v)"
ROOT="$PWD"
LINK="$ROOT/dist-tailnet"
RELEASES="$ROOT/dist-tailnet-releases"
KEEP=3

mkdir -p "$RELEASES"
release="$RELEASES/$(date +%Y%m%d-%H%M%S)-$$"

echo "building into $release"
VITE_PRIVATE=1 npx vite build --base=/ --outDir "$release"
mkdir -p "$release/fonts"
cp "$ROOT"/private/fonts/*.woff2 "$release/fonts/" 2>/dev/null || true

# Refuse to publish an incomplete build. Without this a vite failure that still
# exited 0 could swap in a directory with no entry point.
[ -f "$release/index.html" ] || { echo "FATAL: no index.html in $release" >&2; exit 1; }

# First run migrates the real directory that used to live here. Anything that
# is not a symlink is moved aside rather than deleted.
if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
  echo "migrating pre-existing directory to $LINK.pre-atomic"
  rm -rf "$LINK.pre-atomic"
  mv "$LINK" "$LINK.pre-atomic"
fi

# The swap. `ln -sfn` onto a temp name then `mv -T` is the atomic pair: a bare
# `ln -sfn` over an existing symlink is unlink-then-create, which briefly has
# no symlink at all — exactly the gap this script exists to remove.
ln -sfn "$release" "$LINK.tmp"
mv -T "$LINK.tmp" "$LINK"
echo "published $(basename "$release")"

# Keep the last few releases so a bad deploy can be pointed back by hand.
# shellcheck disable=SC2012
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$(readlink -f "$LINK")" = "$(readlink -f "$old")" ] && continue
  rm -rf "$old"
done
