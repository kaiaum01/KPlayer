# Media and Metadata / Mídias e Metadados — KPlayer v2.0.3

## English

### Dedicated Fast-Loading Folders (v2.0.3)
To avoid slowing down the R36S by scanning thousands of ROMs, BIOS files, and emulator saves, KPlayer v2.0.3 indexes **only four dedicated folders**, filtered strictly by media type (max recursion depth 8, files ≥ 50 KB, up to 4,096 items):

- **Music (Audio only):** `/roms/bgmusic` (SD1) and `/roms2/bgmusic` (SD2)
- **Videos (Video only):** `/roms/videos` (SD1) and `/roms2/videos` (SD2)

The **Files** view gives direct access to those same four folders on SD1 and SD2 so you can browse subfolders manually.

### Formats, Tags, Artwork & Lyrics
- **Recognized extensions:** MP3, FLAC, OGG, WAV, M4A, AAC, OPUS (audio) and MP4, MKV, AVI, MOV, WEBM (video). Actual decoding depends on the device's installed VLC plugins.
- **Local MP3 ID3 tags:** ID3v2.2/2.3/2.4 and ID3v1 title/artist/album; APIC/PIC JPEG or PNG artwork; USLT/ULT lyrics (UTF-8, Latin-1, UTF-16).
- **External artwork:** `Song.jpg`/`.png`, or `cover.jpg`, `cover.png`, `folder.jpg`, `folder.png`, `front.jpg`, `front.png` in the same folder (up to 2048×2048). External covers take priority over embedded art.
- **Synced lyrics (`.lrc`):** UTF-8 `Song.lrc` / `Song.LRC` alongside `Song.mp3` with `[mm:ss.xx]` timestamps and optional `[offset:ms]`. Lyrics are read locally and are never downloaded from the internet.
- **Queue, Favorites & Playlists:** Queue snapshots the current folder's audio files; repeat (off / track / queue) and shuffle are configurable in Settings; local `.m3u` / `.m3u8` music playlists are supported.

---

## Português

### Pastas Dedicadas de Carregamento Rápido (v2.0.3)
Para não sobrecarregar o console R36S varrendo milhares de ROMs, BIOS e saves no cartão SD, o KPlayer v2.0.3 carrega **exclusivamente quatro pastas dedicadas**, filtrando estritamente por tipo de mídia (profundidade máxima de 8 subpastas, arquivos ≥ 50 KB, limite de 4.096 entradas):

- **Músicas (somente áudio):** `/roms/bgmusic` (SD1) e `/roms2/bgmusic` (SD2)
- **Vídeos (somente vídeo):** `/roms/videos` (SD1) e `/roms2/videos` (SD2)

O cartão **Arquivos** lista diretamente essas 4 pastas para navegação manual por subpastas.

### Formatos, Tags, Capas e Letras
- **Extensões reconhecidas:** MP3, FLAC, OGG, WAV, M4A, AAC e OPUS (áudio); MP4, MKV, AVI, MOV e WEBM (vídeo). A decodificação real depende dos plugins VLC instalados no firmware.
- **Tags ID3 locais (MP3):** ID3v2.2/2.3/2.4 e ID3v1 para título, artista e álbum; APIC/PIC para capas JPEG/PNG; USLT/ULT para letras embutidas (UTF-8, Latin-1 e UTF-16).
- **Capas externas:** mesmo nome da faixa com `.jpg`/`.png`, ou `cover`, `folder`, `front` (`.jpg`/`.png`) na mesma pasta (até 2048×2048). Têm prioridade sobre a capa embutida.
- **Letras sincronizadas (`.lrc`):** arquivo `Musica.lrc` / `Musica.LRC` UTF-8 ao lado da música, com tempos `[mm:ss.xx]` e suporte a `[offset:ms]`. As letras são 100% locais e não usam internet.
- **Fila, Favoritas e Playlists:** a fila preserva as faixas da pasta atual; repetição (desligada / faixa / fila) e aleatório ficam em Opções; playlists locais `.m3u` / `.m3u8` são suportadas.

---

## Transport Metadata / Metadados da Barra
The format badge displays the uppercase file extension and reads the exact file size via `stat` (1024-byte KB / 1024²-byte MB), displaying `-- MB` when unavailable. Audio sample rate, channels, and bitrate are queried from libVLC tracks when playing.
