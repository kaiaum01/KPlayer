# Changelog

## v2.1.7 — Mini-Player Nativo nos Ports & Injeção no Sistema Inteiro do R36S (`L3 + R3`)

- **Mini-Player KPlayer Nativo Sempre Disponível nos Ports (`source/file_manager.h`, `source/kplayer.c`, `ports/kplayer/bg_audio.py`):**
  - Ao abrir qualquer script `.sh` ou executável pelo **Gerenciador de Arquivos (`Arquivos`)**, escolha diretamente entre **`Executar com Mini-Player KPlayer (L3 + R3)`** (opção padrão, sempre pronta) ou **`Executar sem Mini-Player (padrão)`** (define `KPLAYER_DISABLE_OVERLAY=1` e executa limpo sem o Mini-Player), mantendo **`Abrir no Editor de Texto`** para scripts `.sh`.
- **Injeção Persistente no Sistema Inteiro (`SELECT → Opções → Mini-Player no Sistema Inteiro`, `ports/kplayer/system_inject.py`, `source/kp_overlay.c`, `source/bg_miniplayer.h`):**
  - Novo script seguro e 100% reversível **`system_inject.py`** controlado exclusivamente pelas opções do KPlayer:
    - Desativa a música de fundo do EmulationStation com backup prévio (`es_settings.cfg`, serviços BGM e silenciamento de áudio do ES), sem jamais alterar `gamelist.xml`.
    - Instala `libkp_overlay.so` (validado ELF e seguro para boot/preload) em `/usr/local/lib/libkp_overlay.so` + `/etc/ld.so.preload` + `/etc/profile.d/kplayer-miniplayer.sh` e serviço persistente `kplayer-miniplayer.service` (com fallback em `/etc/rc.local`), mantendo o Mini-Player KPlayer nativo no console inteiro mesmo após reiniciar o R36S.
    - Coordena automaticamente com a interface principal do KPlayer via `/dev/shm/kplayer-main.lock` e sincroniza a playlist/tema ao sair.
    - Só pode ser desativado dentro do próprio **KPlayer → `SELECT → Opções → Mini-Player no Sistema Inteiro`**, removendo completamente a injeção e restaurando a música original do EmulationStation.
- **Preview Web Atualizada para v2.1.7 (`src/App.tsx`, `src/components/FileManagerScreen.tsx`, `src/components/OptionsMenu.tsx`, `src/components/GameTrainerOverlay.tsx`, `server.ts`):**
  - Escolha direta com/sem Mini-Player no Gerenciador de Arquivos, opção **`Mini-Player no Sistema Inteiro`** integrada a `/api/system-miniplayer` e demonstração interativa alternando entre **Port / Jogo** e **EmulationStation (Sistema Injetado)**.

## v2.1.6 — Mini-Player Visual KPlayer no Jogo (`L3 + R3`) & Fluxo Estável de Áudio em Jogos

- **Mini-Player no Jogo (`L3 + R3`) Redesenhado com a Identidade Visual do KPlayer (`source/kp_overlay_shared.h`):**
  - Visual fiel ao KPlayer: painel arredondado com gradiente escuro tingido pelo tema ativo, linha superior de destaque, emblema de disco de vinil **`K`**, cabeçalho **`K PLAYER · MINI-PLAYER`**, card arredondado **`TOCANDO AGORA`** com mini-equalizador animado e 5 cards de ação com borda e barra lateral de foco na cor do tema (`TOCAR / PAUSAR`, `PRÓXIMA MÚSICA/RÁDIO`, `VOLTAR MÚSICA/RÁDIO`, `VOLUME DO ÁUDIO`, `OCULTAR MENU`).
- **Fluxo Estável de Áudio em Jogos Restaurado (`source/kplayer.c`, `ports/KPlayer.sh`, `ports/kplayer/bg_audio.py`, `source/bg_miniplayer.h`):**
  - Ative em **`SELECT → Opções → Áudio em jogos (Teste prévio)`** e abra seus jogos ou scripts `.sh` diretamente pelo **Gerenciador de Arquivos (`Arquivos`)** com sua música ou rádio online tocando em segundo plano (`./kplayer --bg-audio` + `libkp_overlay.so` via código de saída `43`).
  - Ao fechar o jogo, o áudio em segundo plano encerra limpo e o KPlayer retorna automaticamente.
  - **Demonstração Interativa na Preview Web (`Demo Mini-Player (L3+R3)`):** Exibe o novo Mini-Player visual KPlayer diretamente sobre o jogo em execução com botões virtuais `L3`/`R3`.

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
