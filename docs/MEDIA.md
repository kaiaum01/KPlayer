# Media, Visualizers & Metadata / Mídias, Visualizadores e Metadados — KPlayer v2.1.6 (R36S)

## English

### Dedicated Fast-Loading Folders
To avoid slowing down the R36S by scanning thousands of ROMs, BIOS files, and emulator saves, KPlayer v2.1.6 indexes **only four dedicated folders** in **Music & Videos**, filtered strictly by media type (max recursion depth 8, files ≥ 50 KB, up to 4,096 items):

- **Music (Audio only):** `/roms/bgmusic` (SD1) and `/roms2/bgmusic` (SD2)
- **Videos (Video only):** `/roms/videos` (SD1) and `/roms2/videos` (SD2)

For full console root (`/`) browsing, copy/move/delete/rename operations, and official **7-Zip** archive extraction (including password-protected ZIP/7Z/RAR), open the dedicated **Files (`Arquivos`)** tile on Home.

### Formats, Tags, Artwork & Synced Lyrics
- **Recognized extensions:** MP3, FLAC, OGG, WAV, M4A, AAC, OPUS (audio) and MP4, MKV, AVI, MOV, WEBM (video). Actual decoding depends on the device's installed VLC plugins.
- **Local MP3 ID3 tags:** ID3v2.2/2.3/2.4 and ID3v1 title/artist/album; APIC/PIC JPEG or PNG artwork; USLT/ULT lyrics (UTF-8, Latin-1, UTF-16).
- **External artwork:** `Song.jpg`/`.png`, or `cover.jpg`, `cover.png`, `folder.jpg`, `folder.png`, `front.jpg`, `front.png` in the same folder (up to 2048×2048). External covers take priority over embedded art.
- **Synced lyrics (`.lrc`):** UTF-8 `Song.lrc` / `Song.LRC` alongside `Song.mp3` with `[mm:ss.xx]` timestamps and optional `[offset:ms]`. Lyrics are read locally and also render live over the **10-visualizer Screensaver**.
- **Queue, Favorites & Playlists:** Queue snapshots the current folder's audio files; repeat (off / track / queue), shuffle, speed, sleep timer, and libVLC equalizer are configurable via `SELECT`; local `.m3u` / `.m3u8` playlists are supported.

### High-Resolution Scraper Artwork (`kplayer/scraper/`)
Every R36S release bundles vinyl-disc artwork inside `ports/kplayer/scraper/` without modifying your `gamelist.xml`:
- `kplayer-image.png` — Transparent Cover (`1200×1200` RGBA)
- `kplayer-marquee.png` — Transparent Marquee Logo (`1600×490` RGBA)
- `kplayer-thumb.png` — Vertical Boxart (`900×1200`)
- `kplayer-fanart.png` — Full HD Fanart (`1920×1080`)

---

## Português

### Pastas Dedicadas de Carregamento Rápido
Para não sobrecarregar o R36S varrendo milhares de ROMs, BIOS e saves no cartão SD, o KPlayer v2.1.6 indexa **exclusivamente quatro pastas dedicadas** em **Músicas e Vídeos**, filtrando estritamente por tipo de mídia (profundidade máxima de 8 subpastas, arquivos ≥ 50 KB, limite de 4.096 entradas):

- **Músicas (somente áudio):** `/roms/bgmusic` (SD1) e `/roms2/bgmusic` (SD2)
- **Vídeos (somente vídeo):** `/roms/videos` (SD1) e `/roms2/videos` (SD2)

Para navegar a partir da **raiz do console (`/`)**, copiar, mover, apagar, renomear pastas/arquivos e abrir/descompactar arquivos ZIP/7Z/RAR (inclusive com senha via **7-Zip oficial**), use o card separado **Arquivos** na tela inicial.

### Formatos, Tags, Capas e Letras Sincronizadas
- **Extensões reconhecidas:** MP3, FLAC, OGG, WAV, M4A, AAC e OPUS (áudio); MP4, MKV, AVI, MOV e WEBM (vídeo). A decodificação real depende dos plugins VLC instalados no firmware.
- **Tags ID3 locais (MP3):** ID3v2.2/2.3/2.4 e ID3v1 para título, artista e álbum; APIC/PIC para capas JPEG/PNG; USLT/ULT para letras embutidas (UTF-8, Latin-1 e UTF-16).
- **Capas externas:** mesmo nome da faixa com `.jpg`/`.png`, ou `cover`, `folder`, `front` (`.jpg`/`.png`) na mesma pasta (até 2048×2048). Têm prioridade sobre a capa embutida.
- **Letras sincronizadas (`.lrc`):** arquivo `Musica.lrc` / `Musica.LRC` UTF-8 ao lado da música, com tempos `[mm:ss.xx]` e suporte a `[offset:ms]`. As letras são 100% locais e também podem ser exibidas sobre os **10 visualizadores do Protetor de Tela**.
- **Fila, Favoritas e Playlists:** a fila preserva as faixas da pasta atual; repetição (desligada / faixa / fila), aleatório, velocidade, timer de sono e equalizador libVLC ficam em `SELECT`; playlists locais `.m3u` / `.m3u8` são suportadas.

### Artes de Scraper em Alta Resolução (`kplayer/scraper/`)
Cada pacote R36S inclui as artes fiéis ao disco de vinil K dentro de `ports/kplayer/scraper/`, sem alterar o seu `gamelist.xml`:
- `kplayer-image.png` — Capa com fundo transparente (`1200×1200` RGBA)
- `kplayer-marquee.png` — Marquee / Logo com fundo transparente (`1600×490` RGBA)
- `kplayer-thumb.png` — Boxart vertical (`900×1200`)
- `kplayer-fanart.png` — Fanart Full HD (`1920×1080`)

---

## Transport Metadata / Metadados da Barra
The format badge displays the uppercase file extension and reads the exact file size via `stat` (1024-byte KB / 1024²-byte MB), displaying `-- MB` when unavailable. Audio sample rate, channels, and bitrate are queried from libVLC tracks when playing.
