# Instalação / Installation — KPlayer v2.1.6 (R36S / dArkOS)

## Português

### Instalação nova no R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.1.6-R36S.zip`** na aba **Releases** do GitHub. *(Não baixe o ZIP de código-fonte do repositório como instalador.)*
2. Extraia o pacote e copie para `/roms/ports/` (ou `/roms2/ports/` no segundo cartão):
   - **`KPlayer.sh`** (lançador fixo sem espaços, com a versão atualizada internamente a cada update)
   - pasta **`kplayer/`** (binário nativo ARM64, sprites, fontes, scripts auxiliares e artes de alta resolução em `kplayer/scraper/`)
3. No R36S, atualize a lista de jogos se necessário e abra **Ports → KPlayer**.
   - O KPlayer **nunca edita nem sobrescreve** o seu arquivo `gamelist.xml`. As artes em `kplayer/scraper/` (Capa PNG transparente `1200×1200`, Marquee PNG transparente `1600×490`, Boxart `900×1200` e Fanart Full HD `1920×1080`) ficam prontas para associar manualmente quando desejar.

### Atualização automática (preservando seus dados)
Se você já tem o KPlayer instalado (v2.0.3+):
1. Conecte o R36S ao Wi-Fi e abra o KPlayer.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. A barra de carregamento mostra o progresso em tempo real, valida o SHA-256, preserva favoritos, histórico, configurações, listas de IPTV/Rádio e `gamelist.xml`, atualiza o lançador fixo `KPlayer.sh` (limpando sobras antigas `KPlayer v*.sh`) e reinicia o player automaticamente exibindo o resumo de novidades da v2.1.6 uma única vez.

### Pastas de mídia (carregamento rápido sem sobrecarregar o console)

- **Músicas (MP3, FLAC, WAV, OGG, M4A, AAC, OPUS + letras `.LRC`)**:
  - `/roms/bgmusic` (SD1)
  - `/roms2/bgmusic` (SD2)
- **Vídeos (MP4, MKV, AVI, WEBM, MOV)**:
  - `/roms/videos` (SD1)
  - `/roms2/videos` (SD2)
- **Rádios personalizadas (`.pls`, `.m3u`, `.m3u8`, `.asx`)**: `ports/kplayer/radios_usuario/`
- **IPTV do Usuário (`.m3u`, `.m3u8`, `.txt` ou links via teclado virtual)**: `ports/kplayer/iptv_usuario/`

### Requisitos
- R36S ARM64 com dArkOS e PortMaster, SDL2, ALSA e plugins VLC compatíveis em `/usr/lib/aarch64-linux-gnu/vlc/plugins`.
- Rádio Online, IPTV (com EPG), Clima Open-Meteo, Placar da Bola e Auto-Update exigem conexão com a internet.
- Todos os catálogos públicos de IPTV e Rádio vêm de agregadores abertos da internet; você sempre tem o direito de usar seus próprios links (veja `TERMS.md`).
- Se houver algum erro na execução, consulte o log em `ports/kplayer/log.txt`.

---

## English

1. Download **`KPlayer-v2.1.6-R36S.zip`** from GitHub **Releases**. *(Do not install the source archive.)*
2. Extract and copy **`KPlayer.sh`** and the **`kplayer/`** directory into `/roms/ports/` (or `/roms2/ports/` on SD2).
3. Open **Ports → KPlayer** on your R36S.
   - High-resolution vinyl-disc scraper artwork (transparent `1200×1200` Cover, transparent `1600×490` Marquee, `900×1200` Boxart, and `1920×1080` Fanart) is stored in `kplayer/scraper/`.
   - KPlayer keeps `KPlayer.sh` stable across updates and never modifies your `gamelist.xml`.
   - Future updates can be installed directly inside the app via **`SELECT` → `[A] Verificar atualizações`**, preserving all user playlists, favorites, history, and settings.
