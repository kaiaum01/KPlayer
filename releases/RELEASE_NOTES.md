# KPlayer v2.0.3 — R36S & Android (Ambos Adaptativos)

Central de mídia portátil para **R36S (Principal — dArkOS / PortMaster)** em C + SDL2 + libVLC (adaptativo à tela do dispositivo, ARM64) e edição **Android (Lado a Lado — Adaptativo)** em Kotlin + Jetpack Compose + Media3 (Android 8.0+, celulares retrato/paisagem, dobráveis e tablets).

---

## Novidades da v2.0.3

### R36S Adaptativo ao Dispositivo do Usuário
- **Escala automática de tela no binário nativo (`source/kplayer.c`):** detecta a resolução real do console ou monitor externo (`SDL_GetDesktopDisplayMode` / `SDL_RenderSetLogicalSize`), aplica filtragem linear e ajusta a decodificação de vídeo dinamicamente até Full HD (`1920×1080`) mantendo proporção fiel em telas 640×480 (R36S), 720p, 1080p ou ultrawide.
- **Palco web adaptativo:** modo `Auto` padrão que preenche a tela do dispositivo do usuário (com atalhos rápidos para `4:3`, `1:1` e `16:9`).
- **Compilação e testes nativos blindados:** corrigido o aviso `-Wformat-truncation` no leitor de categorias IPTV (`iptv_copy_str`) e garantido o reset determinístico de cache no teste com sanitizadores (`ASan`/`UBSan`).

### Edição Android Adaptativa (Celulares, Paisagem, Dobráveis & Tablets — Lado a Lado)
- **Layout 100% adaptativo (`KPlayer-v2.0.3-Android.apk`):** orientação desbloqueada (`fullUser`) e suporte multi-janela redimensionável. Em celulares retrato (`< 600dp`), utiliza Barra Inferior de 5 abas e Mini-Player flutuante; em paisagem, dobráveis e tablets (`≥ 600dp` / `≥ 840dp`), alterna automaticamente para **Trilho de Navegação Lateral**, grades multi-coluna (`LazyVerticalGrid` de 2–3 colunas) em Música, IPTV, Rádio e Placar, e **Now Playing em 2 painéis** (disco + controles à esquerda; letras `.LRC`, fila e equalizador ao vivo à direita).
- **Preview web Android adaptativo:** alternância rápida entre `Auto` (preenche o dispositivo), `Celular`, `Paisagem` e `Tablet`.
- **Paridade completa com o KPlayer v2.0.3:** letras `.LRC` com toque para pular, Equalizador de hardware (5 bandas / 6 presets), velocidade (`0.75x–1.5x`), Timer de Sono, varredura nativa via `MediaStore`, IPTV desbloqueado, Rádio Online, Placar da Bola, 7 temas, 3 idiomas e Aviso de Transparência.

### Aviso de Transparência e Termos de Uso Atualizados
- **Tela de Aviso de Transparência antes de entrar em Rádio Online ou IPTV:** deixa explícito ao usuário que todos os dados de IPTV e Rádio vêm de **agregadores públicos da internet ou fontes abertas**, que o KPlayer é apenas um reprodutor (não hospeda conteúdo) e que **você sempre tem o direito de colocar seu próprio link ou playlist**.
- **Termos de Uso expandidos (4 páginas no player + `TERMS.md`):** disponíveis em Português (BR), English e Español diretamente no aviso (`Y` no R36S ou botão dedicado no Android), nas Boas-Vindas e em **Opções → Termos de uso**.

### IPTV — 245 Canais + Filmes e Séries Sem Limites + IPTV do Usuário
- **Lista totalmente desbloqueada** (sem limite de canais, filmes, séries ou episódios), com **carregamento sob demanda categoria por categoria** em 4 abas:
  - **Canais** (`https://canais-saimo.pages.dev/`): catálogo completo (`catalogo.txt` + reservas `canais.txt`) com **245 canais** em **12 categorias** (*Esportes, Filmes e Séries, TV Aberta, Variedades, Infantil, Documentários, 24 Horas, Notícias, PPV, Músicas, Séries* e *Todos*), múltiplas fontes de fallback e troca rápida.
  - **Filmes** (`https://filmes-saimo.pages.dev/`): catálogo completo (~30.000+ filmes) por destaques, gêneros e índice A–Z.
  - **Séries** (`https://filmes-saimo.pages.dev/`): catálogo completo (~13.000+ séries) com navegação por categoria, filtro de temporada e **todos os episódios** sob demanda.
  - **IPTV do Usuário**: adicione seus próprios links `.m3u`/`.m3u8` usando o **teclado virtual na tela** (R36S, salvo em `kplayer/iptv_usuario/playlists.txt`) ou **teclado nativo / importação `.m3u`** no Android, além da pasta `kplayer/iptv_usuario/` no cartão SD.

### Tela de Boot Animada, Boas-Vindas Slim, Placar da Bola e Pastas Dedicadas (R36S)
- **Boot animado e Boas-Vindas Slim:** vinil giratório, anéis de sonar, equalizador, seletor de idioma (PT-BR / EN / ES) e 7 temas em bolinhas ao vivo.
- **Placar da Bola (estilo SofaScore):** jogos ao vivo, encerrados e futuros com Estatísticas, Eventos e Escalações.
- **Pastas Dedicadas (carregamento rápido):** `/roms/bgmusic`, `/roms2/bgmusic` (músicas + `.lrc`) e `/roms/videos`, `/roms2/videos` (vídeos).
- **Capa do Port e XML para dArkOS / EmulationStation:** inclui `images/KPlayer-image.png`, `gamelist.xml` e `kplayer/KPlayer-metadata.xml`.

---

## Como Instalar

### R36S (Edição Principal)
1. Baixe **`KPlayer-v2.0.3-R36S.zip`** nos anexos desta release.
2. Extraia e copie para `/roms/ports/` (ou `/roms2/ports/` no SD2):
   - `KPlayer.sh`
   - pasta `kplayer/`
   - `images/KPlayer-image.png`
   - `gamelist.xml` *(ou mescle `kplayer/KPlayer-metadata.xml` no seu `gamelist.xml` atual)*
3. Coloque suas músicas em `/roms/bgmusic` (ou `/roms2/bgmusic`), vídeos em `/roms/videos` (ou `/roms2/videos`), suas playlists IPTV em `ports/kplayer/iptv_usuario/` e suas rádios em `ports/kplayer/radios_usuario/`.
4. Abra **Ports → KPlayer v2.0.3** no R36S.

### Android (Edição Adaptativa — Lado a Lado)
1. Baixe **`KPlayer-v2.0.3-Android.apk`** nos anexos desta release (Android 8.0+ / API 26+, celulares retrato/paisagem, dobráveis e tablets).
2. Instale o APK no dispositivo e conceda a permissão de mídia local (áudio e vídeos).
3. Consulte o guia completo em **[docs/ANDROID.md](../docs/ANDROID.md)**.

> **Importante:** No R36S, faça backup de `settings.cfg`, `preferences.cfg`, `favorites.cfg` e `radio-favorites.tsv` antes de atualizar uma instalação anterior. Consulte os termos e transparência completos em **[TERMS.md](../TERMS.md)**.

---

## English Summary

**KPlayer v2.0.3 — R36S & Android (Both Adaptive):**
- **Adaptive R36S Display & Cross-Device Scaling:** Native C/SDL2 display detection (`SDL_WINDOW_FULLSCREEN_DESKTOP` + `SDL_RenderSetLogicalSize`) and adaptive video decode up to 1080p, paired with a responsive web preview stage (`Auto`, `4:3`, `1:1`, `16:9`).
- **Adaptive Android Edition (`KPlayer-v2.0.3-Android.apk`):** Unlocked `fullUser` orientation and resizable multi-window support (Kotlin + Jetpack Compose + Media3) adapting across portrait phones, landscape screens, foldables, and tablets (Bottom Nav ↔ Left Navigation Rail, multi-column grids, and 2-pane Now Playing) with full feature parity alongside `KPlayer-v2.0.3-R36S.zip`.
- **Native CI & Sanitizer Hardening:** Resolved `-Wformat-truncation` in `source/iptv.h` and ensured deterministic cache reset in `tests/test_native.c` under ASan/UBSan.
