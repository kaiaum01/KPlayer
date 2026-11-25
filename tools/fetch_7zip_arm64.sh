#!/usr/bin/env bash
# Fetch the official static ARM64 7-Zip binary (7zzs) from the public ip7z/7zip GitHub repository
# into ports/kplayer/7zzs along with its license notice.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_BIN="$ROOT_DIR/ports/kplayer/7zzs"
OUT_LIC="$ROOT_DIR/ports/kplayer/licencas/7-Zip-License.txt"
DEFAULT_TAG="26.06"
DEFAULT_COMPACT="2606"

if [ -x "$OUT_BIN" ] && [ -s "$OUT_BIN" ]; then
  echo "7-Zip ARM64 already present at $OUT_BIN"
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TARBALL="$TMP_DIR/7z-linux-arm64.tar.xz"
URL="https://github.com/ip7z/7zip/releases/download/${DEFAULT_TAG}/7z${DEFAULT_COMPACT}-linux-arm64.tar.xz"

echo "Downloading official 7-Zip ARM64 (${DEFAULT_TAG}) from ip7z/7zip..."
if ! curl -fsSL --retry 3 --retry-delay 2 "$URL" -o "$TARBALL"; then
  echo "Primary release URL failed, resolving latest release from GitHub API..."
  LATEST_URL="$(curl -fsSL https://api.github.com/repos/ip7z/7zip/releases/latest \
    | grep -oE 'https://github\.com/ip7z/7zip/releases/download/[^"]+-linux-arm64\.tar\.xz' \
    | head -n 1 || true)"
  if [ -z "$LATEST_URL" ]; then
    echo "ERROR: Could not resolve official 7-Zip ARM64 release URL." >&2
    exit 1
  fi
  curl -fsSL --retry 3 --retry-delay 2 "$LATEST_URL" -o "$TARBALL"
fi

mkdir -p "$TMP_DIR/extract" "$(dirname "$OUT_BIN")" "$(dirname "$OUT_LIC")"
tar -xJf "$TARBALL" -C "$TMP_DIR/extract"

FOUND_BIN=""
for cand in "$TMP_DIR/extract/7zzs" "$TMP_DIR/extract/7zz"; do
  if [ -f "$cand" ]; then
    FOUND_BIN="$cand"
    break
  fi
done

if [ -z "$FOUND_BIN" ]; then
  echo "ERROR: 7zzs binary not found inside extracted 7-Zip tarball." >&2
  exit 1
fi

install -m 0755 "$FOUND_BIN" "$OUT_BIN"
if [ -f "$TMP_DIR/extract/License.txt" ]; then
  install -m 0644 "$TMP_DIR/extract/License.txt" "$OUT_LIC"
fi

echo "Installed official 7-Zip ARM64 binary -> $OUT_BIN"
file "$OUT_BIN" || true
