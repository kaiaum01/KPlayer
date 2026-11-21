# Build and Test / Compilação e Testes — KPlayer v2.0.2

## R36S v2.0.2: GitHub Actions & Local Cross-Compilation

The workflow **Compilar KPlayer R36S** (`.github/workflows/r36s-build.yml`) cross-compiles the C/SDL2 frontend with `gcc-aarch64-linux-gnu` (`-O2 -std=gnu11 -Wall -Wextra -Werror`), runs unit tests, and packages `releases/KPlayer-v2.0.2-R36S.zip` (including `KPlayer.sh`, `gamelist.xml`, `images/KPlayer-image.png`, `kplayer/cover.png`, `kplayer/KPlayer-metadata.xml`, and the SHA-256 checksum).

Pushing a version tag such as `v2.0.2` triggers **KPlayer - Compilar e preparar release R36S** (`.github/workflows/release-r36s.yml`), which builds the ARM64 binary, packages the install ZIP + `.sha256`, and drafts a GitHub Release ready for review and publishing.

### Compile the ARM64 Frontend Locally (Linux)

```bash
aarch64-linux-gnu-gcc -O2 -std=gnu11 -Wall -Wextra -Werror \
  -I source/include source/kplayer.c -o ports/kplayer/kplayer \
  -ldl -lpthread -lm
```

### Package the R36S Installable ZIP + SHA-256

```bash
python3 tools/package_release.py
```

Outputs:
- `releases/KPlayer-v2.0.2-R36S.zip`
- `releases/KPlayer-v2.0.2-R36S.zip.sha256`

To rebuild the full VLC core from `upstream/vlc-3.0.23.tar.xz` with `patches/kplayer-vlc.patch`:

```bash
bash build.sh
```

## Automated Tests

```bash
# Python unit tests (updater + Placar da Bola parser)
python3 -m unittest discover -s tests -p "test_updater.py" -v
python3 -m unittest discover -s tests -p "test_football.py" -v

# Native C/SDL2 UI + ID3 tag sanitizer tests (Linux host with gcc + libsdl2)
mkdir -p output
cc -O1 -g -fsanitize=address,undefined -I source/include tests/test_native.c -o output/test-native -ldl -lpthread -lm
cc -O1 -g -fsanitize=address,undefined tests/test_tags.c -o output/test-tags
ASAN_OPTIONS=detect_leaks=0 output/test-tags
(cd ports/kplayer && SDL_VIDEODRIVER=dummy ASAN_OPTIONS=detect_leaks=0 ../../output/test-native)
```

## Regenerate Documentation Screenshots

```bash
# Using KPlayer native TTF fonts + ImageMagick (no SDL host needed)
python3 tools/generate_v2_screenshots.py

# Or via the native C/SDL2 preview renderer (Linux host with gcc + libsdl2 + Pillow)
bash tools/render-previews.sh
```

## Web Preview (Dev / Test Simulator)

```bash
npm install
npm run dev
```
