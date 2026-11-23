# Instalação / Installation — KPlayer v2.0.8 (R36S / dArkOS)

## Português

1. Extraia `KPlayer-v2.0.8-R36S.zip`.
2. Copie para `/roms/ports/` (ou `/roms2/ports/` no segundo cartão):
   - `KPlayer v2.0.8.sh` (o nome da versão no `.sh` é atualizado automaticamente a cada atualização futura)
   - pasta `kplayer/` (inclui as artes em alta resolução do disco K em `kplayer/scraper/`: Capa PNG transparente 1200×1200, Marquee PNG transparente 1600×490, Boxart 900×1200 e Fanart Full HD 1920×1080)
3. No R36S, abra **Ports → KPlayer v2.0.8**.
   - O KPlayer **não edita nem sobrescreve** o seu arquivo `gamelist.xml`. Você pode associar as imagens da pasta `kplayer/scraper/` quando quiser pelo menu do EmulationStation ou manualmente.

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
3. Open **Ports → KPlayer v2.0.8** on your R36S. High-resolution vinyl-disc scraper artwork (transparent 1200×1200 Cover, transparent 1600×490 Marquee, 900×1200 Boxart, and 1920×1080 Fanart) is stored in `kplayer/scraper/`. KPlayer never modifies your `gamelist.xml`, and automatically updates the version in the `.sh` launcher on every future update.
