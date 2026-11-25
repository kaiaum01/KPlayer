# Build and Test / Compilação e Testes — KPlayer v2.1.4 (R36S)

## R36S v2.1.4: GitHub Actions & Local Cross-Compilation

The workflow **Compilar KPlayer R36S** (`.github/workflows/r36s-build.yml`) cross-compiles the C/SDL2 frontend with `gcc-aarch64-linux-gnu` (`-O2 -std=gnu11 -D_FORTIFY_SOURCE=3 -Wall -Wextra -Werror`), fetches the official static ARM64 `7zzs` binary from `ip7z/7zip` via `tools/fetch_7zip_arm64.sh`, runs native sanitizer & Python unit tests, packages `releases/KPlayer-v2.1.4-R36S.zip` (with `KPlayer.sh`, `kplayer/`, and high-resolution transparent scraper artwork in `kplayer/scraper/`), and publishes the GitHub Release + `updates/` manifest automatically.

Pushing a version tag such as `v2.1.4` triggers **KPlayer - Compilar e preparar release R36S** (`.github/workflows/release-r36s.yml`), which builds the ARM64 binary, packages the install ZIP + `.sha256`, updates `updates/latest.json` and `updates/history.json`, and publishes the GitHub Release.

### Compile the ARM64 Frontend Locally (Linux)

```bash
aarch64-linux-gnu-gcc -O2 -std=gnu11 -D_FORTIFY_SOURCE=3 -Wall -Wextra -Werror \
  -I source -I source/include source/kplayer.c -o ports/kplayer/kplayer \
  -ldl -lpthread -lm
```

### Package the R36S Installable ZIP + SHA-256

```bash
bash tools/fetch_7zip_arm64.sh
python3 tools/package_release.py
```

Outputs:
- `releases/KPlayer-v2.1.4-R36S.zip`
- `releases/KPlayer-v2.1.4-R36S.zip.sha256`

To rebuild the full VLC core from `upstream/vlc-3.0.23.tar.xz` with `patches/kplayer-vlc.patch`:

```bash
bash build.sh
```

## Automated Tests

```bash
# Shell syntax check
bash -n ports/KPlayer.sh

# Python unit tests (updater, stable launcher, scraper assets, Placar da Bola parser)
python3 -m unittest discover -s tests -p "test_*.py" -v

# Native C/SDL2 UI + ID3 tag sanitizer tests (Linux host with gcc + libsdl2)
mkdir -p output
cc -O1 -g -fsanitize=address,undefined -I source -I source/include tests/test_native.c -o output/test-native -ldl -lpthread -lm
cc -O1 -g -fsanitize=address,undefined tests/test_tags.c -o output/test-tags
ASAN_OPTIONS=detect_leaks=0 output/test-tags
(cd ports/kplayer && SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy ASAN_OPTIONS=detect_leaks=0 ../../output/test-native)
```

## Web R36S Preview & Local Server

```bash
npm install
npm run dev
```
