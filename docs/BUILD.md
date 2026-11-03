# Build and test / Compilação e testes

## R36S 1.0.4: GitHub Actions

The workflow **Compilar KPlayer R36S** cross-compiles the C/SDL2 frontend with
`gcc-aarch64-linux-gnu`, then produces `KPlayer-v1.0.4-R36S.zip` and its
SHA-256 checksum as an Actions artifact. It uses the existing bundled libVLC
core libraries and requires target-system plugins; it does not rebuild VLC.
This workflow and the new 1.0.0 binary have not been tested on R36S.
The source archive intentionally excludes the older frontend binary and old
prebuilt releases; do not run the packager until the new frontend is built.

Execute esse workflow no GitHub e baixe o artefato após a compilação. Ele não
publica releases. Um segundo workflow, **KPlayer - Compilar e preparar release
R36S**, é acionado por tags numéricas como `v1.0.1` e prepara um rascunho com
ZIP e checksum; o mantenedor precisa conferir e publicar a release. Veja
[o guia de publicação](../PUBLICACAO-1.0.0.md).

## Build the ARM64 application and VLC core

Use Linux x86_64 with Python 3/venv/pip, make, patch, tar and the usual shell utilities. The first run downloads isolated Zig 0.17.0 and pkgconf 3.0.7.post0 tooling.

```bash
bash build.sh
```

The script extracts `upstream/vlc-3.0.23.tar.xz`, applies `patches/kplayer-vlc.patch`, builds VLC `compat/`, `src/` and `lib/`, then compiles `source/kplayer.c` for `aarch64-linux-gnu.2.17`.

Outputs: `output/kplayer`, `output/lib/libvlc.so.5`, `output/lib/libvlccore.so.9`. To update the install tree, copy them into `ports/kplayer/` and `ports/kplayer/lib/` respectively, preserving fonts and licenses. No install into the build computer's `/usr` is performed.

The full clean build script has not been rerun as a separate reproducibility certification. The shipped core and frontend were built using equivalent commands during development. Codecs are not rebuilt by this script; the matching device plugins provide them. Disable flags in the core configure command avoid building optional plugins on the build host.

## Local UI and ID3 tests

Linux host, C compiler and SDL2 runtime:

```bash
mkdir -p output
cc -O1 -g -fsanitize=address,undefined -I source/include tests/test_native.c -o output/test-native -ldl -lpthread -lm
cc -O1 -g -fsanitize=address,undefined tests/test_tags.c -o output/test-tags
ASAN_OPTIONS=detect_leaks=0 output/test-tags
(cd ports/kplayer && SDL_VIDEODRIVER=dummy ASAN_OPTIONS=detect_leaks=0 ../../output/test-native)
```

`KPLAYER_TEST_MP3` is an optional path to the specific Get Lucky sample used during development. When set, it enables assertions for that sample's title, artists, album, embedded picture and timed lyrics. That file is not redistributed. Leave the variable unset for the standalone tests.

`tests/test_core.c` is a separate dynamic libVLC playback check for a short media file or the raw RV32 fixture described in its code. It requires the relevant engine, libraries and plugins for the architecture used; the repository does not bundle a Linux host VLC runtime or QEMU environment.

## Recreate the public preview images

```bash
bash tools/render-previews.sh
```

Requires a host C compiler, SDL2 runtime and Python Pillow. The renderer uses the application's real drawing routines with original demonstration fixtures, then exports PNGs into `docs/images/`. It does not play or redistribute commercial media. `docs/images/banner.svg` is the repository's native vector identity asset.

## Create an install ZIP

```bash
python3 tools/package_release.py
```

To package a specific numeric version, set `KPLAYER_VERSION`, for example
`KPLAYER_VERSION=v1.0.1 python3 tools/package_release.py`. Compile the matching
ARM64 frontend first. The version is included in the install tree and manifest.

Only the runtime tree, install notes, license and source-location notice are included in the install ZIP. Source is in this repository, including the original VLC archive and its patch. The release asset and its SHA-256 checksum are written to `releases/`.

## Português

Compile em Linux com `bash build.sh`. A saída fica em `output/`; copie o executável e as duas bibliotecas para `ports/kplayer/`. O script usa ferramentas isoladas, requer internet na primeira instalação e não instala o motor no sistema do computador.

Os comandos acima verificam a interface e o leitor ID3 no host. Para recriar as imagens, use `bash tools/render-previews.sh`; para gerar o ZIP instalável, `python3 tools/package_release.py`.

Os testes locais não substituem o teste físico no R36S. DRM, ALSA, botões, codecs comprimidos, resolução e desempenho precisam ser conferidos no firmware alvo.
