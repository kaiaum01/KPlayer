# KPlayer v2.0.2 — R36S (Principal) & Android (Retrato)

Central de mídia portátil para **R36S (Principal — dArkOS / PortMaster)** em C + SDL2 + libVLC (640×480, ARM64) e nova edição **Android (Lado a Lado — Modo Retrato)** em Kotlin + Jetpack Compose + Media3 (Android 8.0+).

---

## Novidades da v2.0.2

### Nova Edição Android (Modo Retrato — Lado a Lado)
- **Player moderno em modo retrato (`KPlayer-v2.0.2-Android.apk`):** desenvolvido lado a lado sem substituir o R36S, trazendo Mini-Player flutuante, tela cheia **Now Playing**, **Letras `.LRC` com toque para pular**, Equalizador de hardware (5 bandas / 6 presets), velocidade de reprodução (`0.75x–1.5x`), Timer de Sono, varredura nativa via `MediaStore` (áudio e vídeo) e paridade completa com todas as funções do KPlayer v2.0.2 (IPTV, Rádio Online, Placar da Bola, 7 temas, 3 idiomas e Aviso de Transparência).

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
1. Baixe **`KPlayer-v2.0.2-R36S.zip`** nos anexos desta release.
2. Extraia e copie para `/roms/ports/` (ou `/roms2/ports/` no SD2):
   - `KPlayer.sh`
   - pasta `kplayer/`
   - `images/KPlayer-image.png`
   - `gamelist.xml` *(ou mescle `kplayer/KPlayer-metadata.xml` no seu `gamelist.xml` atual)*
3. Coloque suas músicas em `/roms/bgmusic` (ou `/roms2/bgmusic`), vídeos em `/roms/videos` (ou `/roms2/videos`), suas playlists IPTV em `ports/kplayer/iptv_usuario/` e suas rádios em `ports/kplayer/radios_usuario/`.
4. Abra **Ports → KPlayer v2.0.2** no R36S.

### Android (Edição Retrato — Lado a Lado)
1. Baixe **`KPlayer-v2.0.2-Android.apk`** nos anexos desta release (Android 8.0+ / API 26+).
2. Instale o APK no smartphone e conceda a permissão de mídia local (áudio e vídeos).
3. Consulte o guia completo em **[docs/ANDROID.md](../docs/ANDROID.md)**.

> **Importante:** No R36S, faça backup de `settings.cfg`, `preferences.cfg`, `favorites.cfg` e `radio-favorites.tsv` antes de atualizar uma instalação anterior. Consulte os termos e transparência completos em **[TERMS.md](../TERMS.md)**.

---

## English Summary

**KPlayer v2.0.2 — R36S (Primary) & Android (Portrait Companion):**
- **New Native Android Portrait Edition (`KPlayer-v2.0.2-Android.apk`):** Modern touch-first portrait app (Kotlin + Jetpack Compose + Media3) shipped side-by-side with the primary R36S package, with full feature parity (local Music/Video, tap-to-seek `.LRC` lyrics, 5-band EQ, 245-channel IPTV + Movies + Series + User IPTV, Online Radio, Placar da Bola, 7 themes, 3 languages, and Transparency Notice).
- **Transparency Notice & Updated Terms (`TERMS.md`):** Displays an in-app Transparency Notice before entering **Online Radio** or **IPTV**, clearly stating that all IPTV and Radio listings come from public internet aggregators or open sources, KPlayer hosts no content, and every user has the right to add their own links/playlists.
- **Unlocked Category-by-Category IPTV (245 TV Channels + Movies + Series + User IPTV)** and **Animated Boot Splash, Slim Welcome Screen, Placar da Bola Match Center, Dedicated SD1/SD2 Media Folders, and dArkOS Cover/XML Metadata** for R36S.
