#!/bin/bash
# Run on Linux with a C compiler, SDL2 runtime and Pillow for Python.
set -euo pipefail
base="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
mkdir -p "$base/output/previews" "$base/docs/images"
"${CC:-cc}" -O2 -std=gnu11 -I "$base/source/include" "$base/tools/render_previews.c" \
  -o "$base/output/render-previews" -ldl -lpthread -lm
(
 cd "$base/ports/kplayer"
 SDL_VIDEODRIVER="${SDL_VIDEODRIVER:-dummy}" "$base/output/render-previews" "$base/output/previews"
)
python3 - "$base" <<'PY'
from pathlib import Path
from PIL import Image
import sys
base=Path(sys.argv[1])
for src in (base/'output/previews').glob('*.bmp'):
    Image.open(src).save(base/'docs/images'/f'{src.stem}.png')
PY
