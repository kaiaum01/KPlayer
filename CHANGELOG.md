# Changelog

## v2.1.6 — Áudio em 2º Plano no EmulationStation, Silenciador Automático de BGM & Mini-Player Visual KPlayer (`L3 + R3`)

- **Áudio em 2º Plano Fora do KPlayer (EmulationStation & Jogos) — Controle Exclusivo no App KPlayer:**
  - Ative ou desative exclusivamente dentro do KPlayer em **`SELECT → Opções → Áudio em 2º plano (ES/Jogos)`** (não existe botão externo para ligar/desligar no menu flutuante).
  - Ao sair do KPlayer com a opção ativada, o lançador **`KPlayer.sh`** inicia um serviço nativo em segundo plano (`./kplayer --bg-audio <json> 0` via código de saída `44`), mantendo sua música ou rádio online tocando enquanto você navega no **EmulationStation** e entra em jogos.
  - Ao abrir o KPlayer novamente, o serviço em segundo plano encerra limpo devolvendo o controle ao app; desativar a opção dentro do KPlayer desliga o serviço e restaura a configuração original do EmulationStation.
- **Silenciamento Automático e Reversível da BGM do EmulationStation (`ports/kplayer/bg_audio.py`, `source/bg_miniplayer.h`):**
  - Evita conflito de duas músicas tocando juntas: silencia automaticamente `audio.bgmusic` / `BackgroundMusic` em `es_settings.cfg` (salvando backup reversível em `.es-bgm-state.json`), interrompe tocadores externos de BGM (`ogg123`/`mpg123`/`bgm.py`) e muta fluxos de áudio do `emulationstation` no PulseAudio/PipeWire via `pactl`, **sem jamais tocar em `gamelist.xml`**.
  - Ao desativar o áudio em 2º plano dentro do KPlayer, todas as configurações originais de BGM do EmulationStation são restauradas automaticamente.
- **Mini-Player Flutuante (`L3 + R3`) Redesenhado com a Identidade Visual do KPlayer (`source/kp_overlay_shared.h`):**
  - Visual fiel ao KPlayer: painel arredondado com gradiente escuro tingido pelo tema ativo, linha superior de destaque, emblema de disco de vinil **`K`**, cabeçalho **`K PLAYER · MINI-PLAYER`**, card arredondado **`TOCANDO AGORA`** com mini-equalizador animado e 5 cards de ação com borda e barra lateral de foco na cor do tema (`TOCAR / PAUSAR`, `PRÓXIMA MÚSICA/RÁDIO`, `VOLTAR MÚSICA/RÁDIO`, `VOLUME DO ÁUDIO`, `OCULTAR MENU`).
  - **Demonstração Interativa na Preview Web (`Demo Mini-Player (L3+R3)`):** Alterna ao vivo entre os cenários **EmulationStation** (com indicador `BGM do EmulationStation: Silenciada`) e **Jogo em execução**.

## v2.1.5 — Mini-Player Flutuante (`L3 + R3`) & Preview Interativo

- **Novo Combo de Ativação (`L3 + R3`) e Menu em 5 Ações (`source/bg_miniplayer.h`, `source/kp_overlay.c`):**
  - Clique nos dois analógicos ao mesmo tempo (`leftstick` + `rightstick` via `SDL_GAMECONTROLLERCONFIG` ou `BTN_THUMBL` + `BTN_THUMBR` via `EVIOCGKEY`, além de `F8` no teclado) para abrir ou ocultar o Mini-Player sobre jogos KMS/DRM, OpenGL ES 2.0 ou SDL2 sem interferir nos controles da partida.
  - Navegação completa: **`↑`/`↓`** move o cursor entre as 5 ações, **`←`/`→`** ajusta o volume (`10%–100%`) ou troca faixa, **`B`/`START`** confirma, **`R2`/`L2`** troca de faixa instantaneamente de qualquer linha e **`A`** ou **`L3 + R3`** oculta o menu.
  - Demonstração interativa na Preview Web com botões virtuais `L3`/`R3`.

## v2.1.4 — Base Estável R36S: Mini-Player no Jogo (`SELECT + R2`), Áudio em Jogos & Leitor de PDF Compatível com PdfCraft R36S

- **Mini-Player no Jogo Aprimorado (`libkp_overlay.so` + `EVIOCGKEY`):**
  - **Overlay Real Sobre Jogos KMS/DRM, OpenGL ES 2.0 e SDL2 (`source/kp_overlay.c` → `ports/kplayer/libkp_overlay.so`):** Preload ultraleve sem dependências extras que intercepta `SDL_RenderPresent`, `SDL_GL_SwapWindow` e `eglSwapBuffers` com preservação completa de estado GLES2/SDL2 (com fallback automático para `/dev/fb0`).
  - **Controles R36S Imunes ao `gptokeyb` (`source/bg_miniplayer.h`):** Leitura direta do estado de hardware via `EVIOCGKEY`/`EVIOCGABS` + mapeamento exato por `SDL_GAMECONTROLLERCONFIG` e `EVIOCGBIT` (`odroidgo3_joypad` / `GO-Super Gamepad`), reconexão automática e debounce anti-repique.
  - **Fila Completa de Músicas (`source/kplayer.c`):** Carrega automaticamente todas as músicas da pasta e da biblioteca em cache para que `R2` (próxima), `L2` (anterior) e avanço automático funcionem em toda a playlist.
- **Leitor de PDF Compatível com `PdfCraft R36S` (`kaiaum01/PdfReader-R36s`):** Suporte nativo a `.pdf` no Gerenciador de Arquivos com protocolo `serve` JSON IPC (`pdfcraft-core.aarch64`), integração com `PdfCraft.sh`, PDFs com senha, zoom (`X`), páginas (`L1`/`R1`) e modo texto (`Y`).
- **Base Completa Mantida:** Músicas e Vídeos com `.LRC` e 10 visualizadores, Gerenciador de Arquivos completo (raiz `/`, 7-Zip oficial ARM64 com senha, Editor de Texto, execução `.sh`/ELF, playlists `.m3u8` e rádios), Rádio Online, IPTV, Notícias, Placar da Bola, Clima Open-Meteo, 14 Temas, Sons das Teclas e Auto-Update R36S.
