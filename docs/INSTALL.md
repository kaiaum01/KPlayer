# Instalação / Installation — KPlayer v2.0.3 (R36S / dArkOS)

## Português

1. Extraia `KPlayer-v2.0.3-R36S.zip`.
2. Copie os arquivos para `/roms/ports/` (ou `/roms2/ports/` no segundo cartão):
   - `KPlayer.sh`
   - pasta `kplayer/`
   - `images/KPlayer-image.png` (capa do port para o EmulationStation / dArkOS)
   - `gamelist.xml` (se você ainda não tiver um `gamelist.xml` em `ports/`; caso já tenha outros ports, abra `kplayer/KPlayer-metadata.xml` e cole o bloco `<game>...</game>` no seu `gamelist.xml` existente).
3. No R36S, abra **Ports → KPlayer v2.0.3**. Escolha o idioma e a cor do tema e confirme com **B**.

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
`/usr/lib/aarch64-linux-gnu/vlc/plugins`. Rádio, IPTV e Placar da Bola requerem internet.
Todos os catálogos públicos de IPTV e Rádio vêm de agregadores abertos da internet; você sempre tem o direito de usar seus próprios links (veja `TERMS.md`).

Antes de atualizar, faça backup dos arquivos `settings.cfg`, `preferences.cfg` e `favorites.cfg`.
Se houver erro, consulte `ports/kplayer/log.txt`.

## English

1. Extract `KPlayer-v2.0.3-R36S.zip`.
2. Copy `KPlayer.sh`, `kplayer/`, `images/KPlayer-image.png`, and `gamelist.xml` (or merge `kplayer/KPlayer-metadata.xml` into your existing `ports/gamelist.xml`) into `/roms/ports/` (or `/roms2/ports/`).
3. Open **Ports → KPlayer v2.0.3** on your R36S.
4. Put music in `/roms/bgmusic` or `/roms2/bgmusic`, videos in `/roms/videos` or `/roms2/videos`, custom IPTV playlists in `ports/kplayer/iptv_usuario/`, and custom radios in `ports/kplayer/radios_usuario/`. See `TERMS.md` for transparency and open-source notices.
