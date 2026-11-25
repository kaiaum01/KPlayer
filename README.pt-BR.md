<p align="center">
  <img src="docs/images/banner.svg" alt="KPlayer v2.1.3 — Central de Mídia Portátil para R36S" width="100%" />
</p>

<h1 align="center">KPlayer v2.1.3</h1>

<p align="center">
  <strong>Central de mídia portátil nativa para R36S (dArkOS / PortMaster — C + SDL2 + libVLC ARM64)</strong><br />
  Músicas e Vídeos (.LRC) · Arquivos + Editor + .sh + 7-Zip · 10 Visualizadores · 14 Temas · Rádio · IPTV + EPG · Notícias · Clima · Placar
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="docs/INSTALL.md">Instalação (R36S)</a> ·
  <a href="docs/CONTROLS.md">Controles</a> ·
  <a href="docs/MEDIA.md">Mídias e Letras</a> ·
  <a href="docs/BUILD.md">Compilação</a> ·
  <a href="TERMS.md">Termos e Transparência</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="releases/RELEASE_NOTES.md">Notas da Release v2.1.3</a> ·
  <a href="THIRD_PARTY.md">Licenças</a>
</p>

---

## Novidades da v2.1.3 (R36S Nativo)

- **Editor de Texto Integrado no Gerenciador de Arquivos (`Arquivos`):**
  - Suporte completo para abrir, editar e salvar arquivos `.txt`, `.xml`, `.html`, `.htm`, `.sh`, `.cfg`, `.json`, `.m3u8`, `.pls` e mais diretamente no console, com salvamento atômico e proteção contra arquivos binários.
- **Execução de Scripts `.sh` de Jogos do R36S e Executáveis do EmulationStation:**
  - Detecta scripts `.sh` e binários ELF (`\x7fELF`), perguntando se você deseja **Executar no console** (encerrando SDL2/libVLC/ALSA e entregando controle via `execv`) ou **Editar script**.
- **Vídeos, Músicas, Playlists `.m3u8` e Arquivos de Rádio no Gerenciador de Arquivos:**
  - Pressione `B` em vídeos ou músicas para tocar direto no KPlayer (e `A` para voltar ao Gerenciador), ou abra playlists `.m3u8`/`.m3u` e arquivos de rádio (`.pls`, `.xspf`, `.tsv`) com reprodução direta e atalho `X` para editar.
- **Changelog em Um Único Quadro:**
  - A tela de novidades pós-atualização reúne todas as notas em um único quadro limpo e contínuo em vez de múltiplos quadros separados.
- **Gerenciador de Arquivos + 7-Zip da v2.1.2 Preservados:**
  - Acesso à pasta raiz (`/`), criar pastas, apagar com confirmação, copiar, mover, colar, renomear, seleção múltipla, **7-Zip oficial (`7zzs`)** para ZIP/7Z/RAR com senha e barra de progresso com velocidade (MB/s) e tempo restante (ETA).
- **Gradientes Suaves sem Listras em Todos os 14 Temas do R36S:**
  - Corrigido o artefato de listras horizontais nas caixas translúcidas e painéis do protetor de tela em todo o aplicativo: caixas e HUDs agora usam preenchimento sem sobreposição de transparência, gradiente vertical suave fiel ao tema e borda nítida de 1px.
- **10 Visualizadores Reativos ao Áudio (+ Modo Automático) no Protetor de Tela:**
  - Os 5 clássicos inspirados no Windows Media Player foram aprimorados: **Barras e Ondas**, **Alquimia**, **Bateria / Pulso**, **Plenitude** e **Ambience / Cosmos**.
  - **5 novos efeitos em tempo real:** **Túnel Neon** (túnel 3D com raios laser), **Chuva Matrix** (colunas digitais luminosas), **Chama / Fogo** (cortinas de plasma com brasas subindo), **Prisma 3D** (cubo wireframe 3D rotativo com anéis holográficos) e **Galáxia Espiral** (nebulosa em 4 braços).
  - Ativado por padrão após **30 segundos** de inatividade durante Músicas ou Rádio Online, com opção de **Relógio / Data / Clima** e **Letras sincronizadas (`.LRC`)** sobre o visualizador (`L1`/`R1` troca o efeito na hora).
- **14 Temas Exclusivos no R36S:**
  - Todos os 7 temas originais preservados (`Preto e verde`, `Preto e branco`, `Branco e preto`, `Verde e preto`, `Preto e azul`, `Preto e roxo`, `Preto e vermelho`) + **7 novos temas:** **Preto e dourado**, **Preto e ciano**, **Preto e laranja**, **Preto e rosa**, **Meia-noite Neon**, **Retrô Game Boy** e **Oceano Profundo** — com troca instantânea nas Boas-Vindas ou em `SELECT → Tema`.
- **Sons Táteis das Teclas (`Sons das teclas`):**
  - Sintetizador PCM procedural leve (sem arquivos WAV externos) que emite cliques suaves ao navegar no direcional, confirmar (`B`), voltar (`A`) e alternar abas. Ativado por padrão e configurável em **`SELECT → Sons das teclas`**.
- **Mais Animações em Toda a Interface:**
  - Transições suaves entre telas, aura de foco deslizante com elevação sutil nos cards da Home, setas animadas, fundo bokeh ambiente em movimento, barra lateral pulsante em cards focados, mini-equalizador animado nas faixas em reprodução e toasts deslizantes.
- **Lançador Estável, Artes PNG Transparentes e Auto-Update Seguro:**
  - Lançador fixo **`KPlayer.sh`** (sem espaços, versão atualizada internamente, reinício automático seguro via `bash`) sem jamais alterar seus arquivos `gamelist.xml`.
  - Artes em alta resolução fiéis ao disco de vinil K em `kplayer/scraper/` (Capa PNG transparente `1200×1200`, Marquee PNG transparente `1600×490`, Boxart `900×1200` e Fanart Full HD `1920×1080`).
  - **Atualizador interno (`SELECT → [A] Verificar atualizações`)** com barra de progresso ao vivo (0%–100%), validação SHA-256, fallback no GitHub Releases, tela de Changelog pós-atualização exibida uma única vez e preservação total de favoritos, histórico, listas e ajustes.
- **Clima Open-Meteo (`X`) e Tela Inicial Inteligente:**
  - Aplicativo completo de Clima via IP ou busca manual de cidade, card grande de clima na Home (layout invertível nas Opções) e saudação climática dinâmica com sugestões descontraídas aleatórias (ou *"Seu som. Sua tela."* quando o clima está desativado).

---

## Recursos Principais

| Módulo | Destaques |
| :--- | :--- |
| **Player de Música** | Tags ID3 locais, capa embutida/sidecar, **Letras `.LRC` sincronizadas**, painéis de Fila e Pasta, Favoritas, Velocidade, Repetição, Aleatório, Timer de sono, Equalizador libVLC e **Protetor de Tela com 10 visualizadores**. |
| **Player de Vídeo** | Reprodução via libVLC, Formato da imagem (`Original / Preencher / Esticar`), Velocidade, Repetição e controles OSD que se ocultam automaticamente. |
| **Gerenciador de Arquivos (`Arquivos`)** | Acesso completo à raiz (`/`) separado de Músicas e Vídeos: **Editor de Texto** (`.txt`, `.xml`, `.html`, `.sh`, `.cfg`), execução de scripts `.sh` de jogos e binários do EmulationStation, reprodução direta de vídeos, músicas, playlists `.m3u8` e rádios (`.pls`/`.xspf`/`.tsv`), criar/copiar/mover/renomear/apagar, **7-Zip (`7zzs`)** com senha e barra de progresso/velocidade/ETA. |
| **Rádio Online** | Diretório aberto **Radio-Browser** (Brasil, Mais ouvidas, Pop, Rock, Notícias, Favoritas) + estações pessoais em `ports/kplayer/radios_usuario/`. |
| **IPTV + EPG ao Vivo** | Catálogo ilimitado por categorias: **Canais** (com guia EPG ao vivo), **Filmes**, **Séries** (todas as temporadas e episódios) e **IPTV do Usuário** (teclado virtual + pasta `ports/kplayer/iptv_usuario/`). |
| **Notícias (Brasil)** | Manchetes em português (**Todas, Urgente, Mundo, Polícia, Entretenimento, Esportes**) via **NewsData.io** (`ports/kplayer/news.cfg` ou `NEWSDATA_API_KEY`) com fallback RSS ao vivo e leitor completo pelo controle. |
| **Placar da Bola** | Jogos ao vivo, encerrados e futuros do Brasileirão, Libertadores, Champions League, Premier League e mais, com **Estatísticas**, **Eventos** e **Escalações**. |
| **Clima Open-Meteo** | Pressione **`X`** na tela inicial para previsão completa por hora e 7 dias, detecção por IP ou busca manual de cidade. |

---

## Instalação no R36S (dArkOS / PortMaster)

1. Baixe **`KPlayer-v2.1.3-R36S.zip`** na aba **[Releases](../../releases)**. *(Não use o ZIP de código-fonte do GitHub como instalador.)*
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Coloque suas mídias nas pastas dedicadas (boot rápido — sem varrer ROMs/BIOS/saves):

| Tipo de Mídia | Cartão SD1 | Cartão SD2 | Formatos reconhecidos |
| :--- | :--- | :--- | :--- |
| **Músicas (+ `.lrc`)** | `/roms/bgmusic` | `/roms2/bgmusic` | MP3, FLAC, OGG, WAV, M4A, AAC, OPUS |
| **Vídeos** | `/roms/videos` | `/roms2/videos` | MP4, MKV, AVI, MOV, WEBM |
| **Rádios pessoais** | `ports/kplayer/radios_usuario/` | — | `.pls`, `.m3u`, `.m3u8`, `.asx` |
| **IPTV do Usuário** | `ports/kplayer/iptv_usuario/` | — | `.m3u`, `.m3u8`, `.txt` (ou link pelo teclado virtual) |

4. Abra **Ports → KPlayer** no R36S.
5. Para futuras versões, basta atualizar por dentro do próprio player em **`SELECT → [A] Verificar atualizações`**.

> **Requisitos:** R36S ARM64 com dArkOS e PortMaster, SDL2, ALSA e plugins VLC compatíveis em `/usr/lib/aarch64-linux-gnu/vlc/plugins`. Veja o guia completo em [docs/INSTALL.md](docs/INSTALL.md).

---

## Controles Principais

| Botão | Ação |
| :---: | :--- |
| **Direcional** | Navegar menus, alternar abas, mudar idioma/tema ou avançar ±10s |
| **B** | Confirmar / Abrir / Tocar / Detalhes da partida |
| **A** | Voltar / Cancelar |
| **X** | Clima na Home · Fila/Pasta na música · Filtro no Placar/IPTV · Favoritar rádio · Letras no Protetor de Tela |
| **Y** | Letras na música · Atualizar dados · Relógio/Clima no Protetor de Tela · Termos nas Boas-Vindas |
| **L1 / R1** | Faixa, vídeo ou estação anterior/seguinte · Trocar Visualizador ao vivo no Protetor de Tela |
| **START** | Pausar / Retomar reprodução |
| **SELECT** | Abrir / Fechar Opções contextuais |

Veja o mapa completo tela por tela em [docs/CONTROLS.md](docs/CONTROLS.md).

---

## Transparência, Fontes Abertas e Licenças

- **Agregadores Públicos e Liberdade do Usuário:** todos os dados de IPTV e Rádio Online vêm de agregadores públicos ou fontes abertas (como **Radio-Browser**). O KPlayer atua apenas como reprodutor, não hospeda conteúdo, exibe um **Aviso de Transparência** antes de entrar em streaming e garante liberdade total para usar seus próprios links e listas. Leia **[TERMS.md](TERMS.md)**.
- **Compilação e Empacotamento:** consulte [docs/BUILD.md](docs/BUILD.md) e [PUBLICAR_NO_GITHUB.md](PUBLICAR_NO_GITHUB.md).
- **Licença:** código original sob **GPL-2.0-or-later** ([LICENSE](LICENSE)). VLC/libVLC, SDL2, stb e fontes seguem suas licenças em [THIRD_PARTY.md](THIRD_PARTY.md) e `ports/kplayer/licencas/`.
- Projeto independente, sem afiliação com VideoLAN, PortMaster, Open-Meteo ou SofaScore.
