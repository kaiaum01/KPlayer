# Changelog

## v2.1.5 — Mini-Player no Jogo Estilo GTA Trainer (`L3 + R3`) & Preview Interativo

- **Mini-Player no Jogo Redesenhado Estilo GTA Cheat Trainer (`L3 + R3`):**
  - **Painel Vertical Flutuante no Canto Superior Esquerdo (`source/kp_overlay_shared.h`, `source/kp_overlay.c`):** Inspirado nos menus Trainer de cheats do GTA, com faixa superior sólida na cor do tema (`KPLAYER TRAINER`), contador de cursor (`1/5`), subcabeçalho preto com o nome da música/rádio ativa, 5 linhas navegáveis com barra de seleção branca de alto contraste e legenda compacta de atalhos no rodapé.
  - **Novo Combo de Ativação (`L3 + R3`):** Clique nos dois analógicos ao mesmo tempo (`leftstick` + `rightstick` via `SDL_GAMECONTROLLERCONFIG` ou `BTN_THUMBL` + `BTN_THUMBR` via `EVIOCGKEY`, além de `F8` no teclado) para abrir ou fechar o Trainer sobre qualquer jogo KMS/DRM, OpenGL ES 2.0 ou SDL2 sem interferir nos controles da partida.
  - **Navegação Completa no Trainer:** **`↑`/`↓`** move o cursor entre as 5 ações (`TOCAR / PAUSAR`, `PRÓXIMA MÚSICA/RÁDIO`, `VOLTAR MÚSICA/RÁDIO`, `VOLUME DO ÁUDIO`, `FECHAR TRAINER`), **`←`/`→`** ajusta o volume (`10%–100%`) ou troca faixa, **`B`/`START`** ativa a opção selecionada, **`R2`/`L2`** troca de faixa instantaneamente de qualquer linha e **`A`** ou **`L3 + R3`** fecha o menu.
  - **Demonstração Interativa na Preview Web:** Novo botão **`Demo Trainer (L3+R3)`** e controles virtuais `L3`/`R3` na Preview simulando um jogo retrô estilo GTA em 640×480 com o KPlayer Trainer funcionando ao vivo por cima.
- **Base v2.1.4 Preservada:** Áudio em jogos nativo via `./kplayer --bg-audio` (`libvlc.so.5`), overlay `libkp_overlay.so`, Leitor de PDF compatível com `PdfCraft R36S`, 10 visualizadores, 14 temas, 7-Zip ARM64, Rádio Online, IPTV + EPG, Notícias, Placar da Bola e Clima Open-Meteo.

## v2.1.4 — Base Estável R36S: Mini-Player no Jogo (`SELECT + R2`), Áudio em Jogos (Teste Prévio) & Leitor de PDF Compatível com PdfCraft R36S

- **Mini-Player no Jogo Aprimorado (`SELECT + R2` com `libkp_overlay.so` + `EVIOCGKEY`):**
  - **Overlay Real Sobre Jogos KMS/DRM, OpenGL ES 2.0 e SDL2 (`source/kp_overlay.c` → `ports/kplayer/libkp_overlay.so`):** Preload ultraleve sem dependências extras que intercepta `SDL_RenderPresent`, `SDL_GL_SwapWindow` e `eglSwapBuffers` com preservação completa de estado GLES2/SDL2, exibindo o Mini-Player sobre jogos do PortMaster e RetroArch (com fallback automático para `/dev/fb0` quando necessário).
  - **Controles R36S Imunes ao `gptokeyb` (`source/bg_miniplayer.h`):** Leitura direta do estado de hardware via `EVIOCGKEY`/`EVIOCGABS` (contornando `EVIOCGRAB` do `gptokeyb`) + mapeamento exato por `SDL_GAMECONTROLLERCONFIG` e tabela `EVIOCGBIT` do Linux (compatível com `odroidgo3_joypad` / `GO-Super Gamepad`), reconexão automática de controles e debounce anti-repique.
  - **Fila Completa de Músicas (`source/kplayer.c`):** Ao lançar jogos tocando uma faixa avulsa, carrega automaticamente todas as músicas da pasta (em ordem alfabética) e da biblioteca em cache para que `R2` (próxima), `L2` (anterior) e avanço automático funcionem em toda a playlist.
- **Música e Rádio em Segundo Plano (Teste Prévio):** Opção ativável em `SELECT → Opções → Áudio em jogos (Teste prévio)`, rodando via `./kplayer --bg-audio` com `libvlc.so.5` embarcada, mixagem ALSA `dmix`/PulseAudio e isolamento de `LD_LIBRARY_PATH`.
- **Leitor de PDF Compatível com `PdfCraft R36S` (`kaiaum01/PdfReader-R36s`):** Suporte nativo a `.pdf` no Gerenciador de Arquivos com protocolo `serve` JSON IPC (`pdfcraft-core.aarch64`), integração com `PdfCraft.sh`, PDFs com senha, zoom (`X`), páginas (`L1`/`R1`) e modo texto (`Y`).
- **Base Completa Mantida:** Músicas e Vídeos com `.LRC` e 10 visualizadores, Gerenciador de Arquivos completo (raiz `/`, 7-Zip oficial ARM64 com senha, Editor de Texto, execução `.sh`/ELF, playlists `.m3u8` e rádios), Rádio Online, IPTV, Notícias, Placar da Bola, Clima Open-Meteo, 14 Temas, Sons das Teclas e Auto-Update R36S.
