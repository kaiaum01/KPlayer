# KPlayer v2.1.5 — Edição R36S (Mini-Player Estilo GTA Trainer `L3 + R3` & Áudio em Jogos)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.1.5 (R36S Nativo)

- **Mini-Player no Jogo Estilo GTA Trainer (`L3 + R3`) (`Teste prévio`):**
  - **Visual de Mod Menu / Cheat Trainer no Canto Superior Esquerdo:** Painel vertical translúcido (`libkp_overlay.so` sobre KMS/DRM, OpenGL ES 2.0 e SDL2, com fallback `/dev/fb0`) com banner colorido do tema (`KPLAYER TRAINER`), contador de opções (`1/5`), subcabeçalho preto com a faixa/estação atual e barra branca de seleção de alto contraste.
  - **Ativação por `L3 + R3` (clique nos dois analógicos):** Fica 100% invisível durante a jogatina sem atrapalhar nenhum botão do jogo; aperte **`L3 + R3`** juntos para abrir ou fechar instantaneamente.
  - **Controles do Menu Trainer:** **`↑`/`↓`** navega pelas 5 ações (`Tocar / Pausar`, `Próxima Música/Rádio`, `Voltar Música/Rádio`, `Volume do Áudio`, `Fechar Trainer`), **`←`/`→`** ajusta o volume (`10%–100%`) ou troca a faixa, **`B`/`START`** confirma a linha destacada, **`R2`/`L2`** avança/volta faixa direto de qualquer linha e **`A`** ou **`L3 + R3`** fecha voltando ao jogo.
  - **Demonstração na Preview Web:** Botão **`Demo Trainer (L3+R3)`** na barra superior e botões **`L3`/`R3`** no controle virtual para testar o menu sobre um jogo retrô estilo GTA ao vivo.
- **Áudio em Jogos + Leitor de PDF (`PdfCraft R36S`) Preservados:**
  - Opção **`Áudio em jogos (Teste prévio)`** em **`SELECT → Opções`** rodando diretamente via `./kplayer --bg-audio` com `libvlc.so.5` embarcada, fila completa da pasta e leitura de controle imune ao `gptokeyb` (`EVIOCGKEY`/`SDL_GAMECONTROLLERCONFIG`).
  - Leitor nativo de **`.pdf`** no Gerenciador de Arquivos compatível com **`pdfcraft-core.aarch64`** (`kaiaum01/PdfReader-R36s`), Editor de Texto, 7-Zip ARM64 (`7zzs`) com senha, 10 Visualizadores, 14 Temas, Rádio Online, IPTV + EPG, Notícias, Placar da Bola e Clima Open-Meteo.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa o pacote da pasta `updates/` (ou GitHub Releases), valida o checksum SHA-256, mantém o lançador fixo **`KPlayer.sh`** atualizado internamente sem mexer em nenhum `gamelist.xml`, preserva favoritos, histórico, listas IPTV/Rádio, clima, tema e idioma, e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.1.5-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer** no R36S. As artes em alta resolução do disco K ficam em `kplayer/scraper/`.
