# KPlayer v2.0.2 — R36S / dArkOS

Central de mídia portátil para **R36S (dArkOS / PortMaster)** em C + SDL2 + libVLC (640×480, ARM64).

---

## Novidades da v2.0.2

### Aviso de Transparência e Termos de Uso Atualizados
- **Tela de Aviso de Transparência antes de entrar em Rádio Online ou IPTV:** deixa explícito ao usuário que todos os dados de IPTV e Rádio vêm de **agregadores públicos da internet ou fontes abertas**, que o KPlayer é apenas um reprodutor (não hospeda conteúdo) e que **você sempre tem o direito de colocar seu próprio link ou playlist**.
- **Termos de Uso expandidos (4 páginas no player + `TERMS.md`):** disponíveis em Português (BR), English e Español diretamente no aviso (`Y`), na tela de Boas-Vindas e em **Opções → Termos de uso**.

### IPTV — 245 Canais + Filmes e Séries Sem Limites + IPTV do Usuário
- **Lista totalmente desbloqueada** (sem limite de canais, filmes, séries ou episódios), com **carregamento sob demanda categoria por categoria** em 4 abas:
  - **Canais** (`https://canais-saimo.pages.dev/`): catálogo completo (`catalogo.txt` + reservas `canais.txt`) com **245 canais** em **12 categorias** (*Esportes, Filmes e Séries, TV Aberta, Variedades, Infantil, Documentários, 24 Horas, Notícias, PPV, Músicas, Séries* e *Todos*), múltiplas fontes de fallback e troca rápida por `L1`/`R1`.
  - **Filmes** (`https://filmes-saimo.pages.dev/`): catálogo completo (~30.000+ filmes) por destaques, gêneros e índice A–Z.
  - **Séries** (`https://filmes-saimo.pages.dev/`): catálogo completo (~13.000+ séries) com navegação por categoria, filtro de temporada e **todos os episódios** sob demanda.
  - **IPTV do Usuário**: adicione seus próprios links `.m3u`/`.m3u8` usando o **teclado virtual na tela** (salvo em `kplayer/iptv_usuario/playlists.txt`) ou copie arquivos `.m3u`/`.m3u8`/`.txt` diretamente na pasta `kplayer/iptv_usuario/`.

### Tela de Boot Animada, Boas-Vindas Slim, Placar da Bola e Pastas Dedicadas
- **Boot animado e Boas-Vindas Slim:** vinil giratório, anéis de sonar, equalizador, seletor de idioma (PT-BR / EN / ES) e 7 temas em bolinhas ao vivo.
- **Placar da Bola (estilo SofaScore):** jogos ao vivo, encerrados e futuros com Estatísticas, Eventos e Escalações.
- **Pastas Dedicadas (carregamento rápido):** `/roms/bgmusic`, `/roms2/bgmusic` (músicas + `.lrc`) e `/roms/videos`, `/roms2/videos` (vídeos).
- **Capa do Port e XML para dArkOS / EmulationStation:** inclui `images/KPlayer-image.png`, `gamelist.xml` e `kplayer/KPlayer-metadata.xml`.

---

## Como Instalar no R36S

1. Baixe **`KPlayer-v2.0.2-R36S.zip`** nos anexos desta release.
2. Extraia e copie para `/roms/ports/` (ou `/roms2/ports/` no SD2):
   - `KPlayer.sh`
   - pasta `kplayer/`
   - `images/KPlayer-image.png`
   - `gamelist.xml` *(ou mescle `kplayer/KPlayer-metadata.xml` no seu `gamelist.xml` atual)*
3. Coloque suas músicas em `/roms/bgmusic` (ou `/roms2/bgmusic`), vídeos em `/roms/videos` (ou `/roms2/videos`), suas playlists IPTV em `ports/kplayer/iptv_usuario/` e suas rádios em `ports/kplayer/radios_usuario/`.
4. Abra **Ports → KPlayer v2.0.2** no R36S.

> **Importante:** Faça backup de `settings.cfg`, `preferences.cfg`, `favorites.cfg` e `radio-favorites.tsv` antes de atualizar uma instalação anterior. Consulte os termos e transparência completos em **[TERMS.md](../TERMS.md)**.

---

## English Summary

**KPlayer v2.0.2 for R36S / dArkOS (PortMaster):**
- **Transparency Notice & Updated Terms (`TERMS.md`):** Displays an in-app Transparency Notice before entering **Online Radio** or **IPTV**, clearly stating that all IPTV and Radio listings come from public internet aggregators or open sources, KPlayer hosts no content, and every user has the right to add their own links/playlists.
- **Unlocked Category-by-Category IPTV (245 TV Channels + Movies + Series + User IPTV):** Full live TV catalog (`catalogo.txt` + `canais.txt` reserves = 245 channels in 12 categories), ~30,000+ movies and ~13,000+ series with all seasons and episodes on demand, plus **User IPTV** via on-screen virtual keyboard or `ports/kplayer/iptv_usuario/`.
- **Animated Boot Splash, Slim Welcome Screen, Placar da Bola Match Center, Dedicated SD1/SD2 Media Folders, and dArkOS Cover/XML Metadata.**
