#!/bin/bash
# Cross-compiles patched libvlc.so.5 and libvlccore.so.9 (VLC 3.0.23) for ARM64 R36S / dArkOS.
set -euo pipefail

base="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$base"

OUT_DIR="$base/ports/kplayer/lib"
VLC_VERSION="3.0.23"
VLC_TARBALL="vlc-${VLC_VERSION}.tar.xz"
VLC_SHA256="e891cae6aa3ccda69bf94173d5105cbc55c7a7d9b1d21b9b21666e69eff3e7e0"

FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
fi

if [ "$FORCE" -eq 0 ] && [ -s "$OUT_DIR/libvlc.so.5" ] && [ -s "$OUT_DIR/libvlccore.so.9" ]; then
  echo "libvlc.so.5 and libvlccore.so.9 already present in $OUT_DIR; skipping rebuild."
  file "$OUT_DIR/libvlc.so.5" "$OUT_DIR/libvlccore.so.9" || true
  exit 0
fi

WORK_DIR="${TMPDIR:-/tmp}/kplayer-vlc-arm64-$$"
trap 'rm -rf "$WORK_DIR"' EXIT
mkdir -p "$WORK_DIR/empty-pc" "$WORK_DIR/build" "$WORK_DIR/stage" "$OUT_DIR"

TAR_PATH="$base/upstream/$VLC_TARBALL"
NEED_DOWNLOAD=1
if [ -f "$TAR_PATH" ]; then
  ACTUAL_SHA="$(sha256sum "$TAR_PATH" | awk '{print $1}')"
  if [ "$ACTUAL_SHA" = "$VLC_SHA256" ]; then
    NEED_DOWNLOAD=0
  else
    echo "Local $TAR_PATH checksum mismatch ($ACTUAL_SHA); downloading official tarball..."
  fi
fi

if [ "$NEED_DOWNLOAD" -eq 1 ]; then
  TAR_PATH="$WORK_DIR/$VLC_TARBALL"
  curl -fSL --retry 3 --retry-delay 2 \
    "https://get.videolan.org/vlc/${VLC_VERSION}/${VLC_TARBALL}" \
    -o "$TAR_PATH" \
  || curl -fSL --retry 3 --retry-delay 2 \
    "https://download.videolan.org/pub/videolan/vlc/${VLC_VERSION}/${VLC_TARBALL}" \
    -o "$TAR_PATH"
  echo "${VLC_SHA256}  ${TAR_PATH}" | sha256sum -c -
fi

tar --no-same-owner -xf "$TAR_PATH" -C "$WORK_DIR"
(
  cd "$WORK_DIR/vlc-${VLC_VERSION}"
  patch -p1 < "$base/patches/kplayer-vlc.patch"
)

JOBS="${JOBS:-$(nproc 2>/dev/null || echo 4)}"

(
  cd "$WORK_DIR/build"
  export PKG_CONFIG_LIBDIR="$WORK_DIR/empty-pc"
  export PKG_CONFIG_PATH=""
  export CC="${CC:-aarch64-linux-gnu-gcc}"
  export CXX="${CXX:-aarch64-linux-gnu-g++}"
  export AR="${AR:-aarch64-linux-gnu-ar}"
  export RANLIB="${RANLIB:-aarch64-linux-gnu-ranlib}"
  export STRIP="${STRIP:-aarch64-linux-gnu-strip}"
  export BUILDCC="${BUILDCC:-gcc}"
  export CFLAGS="-O2 -Wno-date-time"
  export CXXFLAGS="-O2 -Wno-date-time"

  "../vlc-${VLC_VERSION}/configure" \
    --host=aarch64-linux-gnu \
    --prefix=/usr \
    --libdir=/usr/lib/aarch64-linux-gnu \
    --disable-nls --disable-dbus --disable-lua --disable-qt --disable-skins2 --disable-vlc \
    --disable-avcodec --disable-swscale --disable-a52 --disable-mad --disable-xcb --disable-xvideo \
    --disable-alsa --disable-libgcrypt --disable-gnutls --disable-freetype --disable-fribidi --disable-fontconfig

  make -j"$JOBS" -C compat
  make -j"$JOBS" -C src
  make -j"$JOBS" -C lib
  make -C src install-libLTLIBRARIES DESTDIR="$WORK_DIR/stage"
  make -C lib install-libLTLIBRARIES DESTDIR="$WORK_DIR/stage"
)

cp -L "$WORK_DIR/stage/usr/lib/aarch64-linux-gnu/libvlc.so.5" "$OUT_DIR/libvlc.so.5"
cp -L "$WORK_DIR/stage/usr/lib/aarch64-linux-gnu/libvlccore.so.9" "$OUT_DIR/libvlccore.so.9"

if command -v "${STRIP:-aarch64-linux-gnu-strip}" >/dev/null 2>&1; then
  "${STRIP:-aarch64-linux-gnu-strip}" --strip-unneeded \
    "$OUT_DIR/libvlc.so.5" "$OUT_DIR/libvlccore.so.9" || true
fi

ls -lh "$OUT_DIR/libvlc.so.5" "$OUT_DIR/libvlccore.so.9"
file "$OUT_DIR/libvlc.so.5" "$OUT_DIR/libvlccore.so.9" || true
