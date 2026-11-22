# Instalação / Installation — KPlayer v2.0.8 (R36S / dArkOS)

## Português

1. Extraia `KPlayer-v2.0.8-R36S.zip`.
2. Copie para `/roms/ports/` (ou `/roms2/ports/` no segundo cartão):
   - `KPlayer v2.0.8.sh` (o nome da versão no `.sh` é atualizado automaticamente a cada atualização futura)
   - pasta `kplayer/` (já contém todas as imagens de scraper em `kplayer/scraper/`, metadados completos e o sincronizador automático `scraper_sync.py`)
3. No R36S, abra **Ports → KPlayer v2.0.8**.
   - Ao abrir, o KPlayer insere automaticamente os metadados completos e artes de scraper (Capa, Boxart, Marquee e Fanart) no arquivo `gamelist.xml` de `/roms/ports` e `/roms2/ports` **sem apagar nenhum jogo/port existente** (ou cria o arquivo se ainda não existir).

### Pastas de mídia (carregamento rápido sem sobrecarregar o console)

- **Músicas (MP3, FLAC, WAV, OGG, M4A + letras .LRC)**:
  - `/roms/bgmusic` (SD1)
  - `/roms2/bgmusic` (SD2)
- **Vídeos (MP4, MKV, AVI, WEBM, MOV)**:
  - `/roms/videos` (SD1)
  - `/roms2/videos` (SD2)
- **Rádios personalizadas (`.pls`, `.m3u`)**: `ports/kplayer/radios_usuario/`
- **IPTV do Usuário (`.m3u`, `.m3u8`, `.txt` ou links via teclado na tela)**: `ports/kplayer/iptv_usuario/`

Requer R36S ARM64, dArkOS/PortMaster, SDL2, ALSA e plugins VLC compatíveis em
`/usr/lib/aarch64-linux-gnu/vlc/plugins`. Rádio, IPTV, Clima e Placar da Bola requerem internet.
Todos os catálogos públicos de IPTV e Rádio vêm de agregadores abertos da internet; você sempre tem o direito de usar seus próprios links (veja `TERMS.md`).
Se houver erro, consulte `ports/kplayer/log.txt`.

## English

1. Extract `KPlayer-v2.0.8-R36S.zip`.
2. Copy `KPlayer v2.0.8.sh` and the `kplayer/` folder into `/roms/ports/` (or `/roms2/ports/`).
3. Open **Ports → KPlayer v2.0.8** on your R36S. KPlayer automatically merges its complete scraper artwork (`kplayer/scraper/`) and metadata into `/roms/ports/gamelist.xml` and `/roms2/ports/gamelist.xml` without removing existing games (or creates `gamelist.xml` if absent), and automatically updates the version in the `.sh` launcher on every future update.
