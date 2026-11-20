#!/bin/bash
# Compila o frontend e o núcleo VLC para ARM64, sem instalar no sistema.
set -euo pipefail
base="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$base"
python3 -m venv .tools
.tools/bin/python -m pip install 'ziglang==0.17.0' 'pkgconf==3.0.7.post0'
py="$base/.tools/bin/python"
mkdir -p work/toolchain work/empty-pc output/lib
if [ ! -d work/vlc-3.0.23 ]; then
    tar --no-same-owner -xf upstream/vlc-3.0.23.tar.xz -C work
    (cd work/vlc-3.0.23 && patch -p1 < "$base/patches/kplayer-vlc.patch")
fi
for tool in cc cxx ar ranlib; do
    case "$tool" in
        cc) args='cc -target aarch64-linux-gnu.2.17 -Wno-date-time';;
        cxx) args='c++ -target aarch64-linux-gnu.2.17 -Wno-date-time';;
        ar) args='ar';;
        ranlib) args='ranlib';;
    esac
    printf '#!/bin/bash\nexec %q -m ziglang %s "$@"\n' "$py" "$args" > "work/toolchain/$tool"
    chmod +x "work/toolchain/$tool"
done
export PATH="$base/.tools/bin:$PATH"
export PKG_CONFIG_LIBDIR="$base/work/empty-pc"
export CC="$base/work/toolchain/cc" CXX="$base/work/toolchain/cxx"
export AR="$base/work/toolchain/ar" RANLIB="$base/work/toolchain/ranlib"
mkdir -p work/core-build
(
 cd work/core-build
 ../../work/vlc-3.0.23/configure --host=aarch64-linux-gnu --prefix=/usr --libdir=/usr/lib/aarch64-linux-gnu \
    --disable-nls --disable-dbus --disable-lua --disable-qt --disable-skins2 --disable-vlc \
    --disable-avcodec --disable-swscale --disable-a52 --disable-mad --disable-xcb --disable-xvideo \
    --disable-alsa --disable-libgcrypt --disable-gnutls --disable-freetype --disable-fribidi --disable-fontconfig
 make -j"${JOBS:-4}" -C compat
 make -j"${JOBS:-4}" -C src
 make -j"${JOBS:-4}" -C lib
 make -C src install-libLTLIBRARIES DESTDIR="$base/work/stage"
 make -C lib install-libLTLIBRARIES DESTDIR="$base/work/stage"
)
cp -L work/stage/usr/lib/aarch64-linux-gnu/libvlc.so.5 output/lib/
cp -L work/stage/usr/lib/aarch64-linux-gnu/libvlccore.so.9 output/lib/
"$py" -m ziglang cc -target aarch64-linux-gnu.2.17 -O2 -std=gnu11 -Wall -Wextra -Werror -s \
    -I source/include source/kplayer.c -o output/kplayer -ldl -lpthread -lm
printf '\nPronto: output/kplayer e output/lib/. Copie para a pasta kplayer do port.\n'
