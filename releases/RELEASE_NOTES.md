# KPlayer v2.1.4 — Edição R36S (Áudio em Jogos — Teste Prévio & Leitor de PDF Compatível com PdfCraft R36S)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.1.4 (R36S Nativo)

- **Música e Rádio em Segundo Plano + Mini-Player no Jogo (`SELECT + R2`) (`Teste prévio`):**
  - Nova opção **`Áudio em jogos (Teste prévio)`** em **`SELECT → Opções`**, permitindo **ativar ou desativar** a qualquer momento (salva em `settings.cfg`, desativada por padrão).
  - Roda diretamente pelo próprio **`./kplayer --bg-audio`** usando a `libvlc.so.5` embarcada (sem depender de `cvlc`/`mpv`/`ffplay`), com mixagem compartilhada automática via **PulseAudio/PipeWire ou ALSA `dmix`** e isolamento de `LD_LIBRARY_PATH` para jogos `.sh` e EmulationStation.
  - **Mini-Player no Jogo sob demanda:** fica oculto durante a jogatina e **só abre ao pressionar `SELECT + R2`**. Com ele aberto: **`R2`** pula para a próxima música/estação, **`L2`** volta para a anterior, **`B`/`START`** pausa/retoma, **`↑`/`↓`** ajusta o volume (`10%–100%`) e **`A`** (ou **`SELECT + R2`**) fecha voltando imediatamente ao jogo. Ao fechar o jogo, o KPlayer retorna automaticamente.
- **Leitor de PDF Integrado Compatível com `PdfCraft R36S` (`github.com/kaiaum01/PdfReader-R36s`):**
  - Abra arquivos **`.pdf`** diretamente no Gerenciador de Arquivos (`Arquivos`).
  - Compatibilidade nativa com o motor **`pdfcraft-core.aarch64`** do projeto **`kaiaum01/PdfReader-R36s`** (via protocolo JSON IPC `serve`), opção de abrir no app externo **`PdfCraft.sh`** quando instalado em `/roms(2)/ports/`, suporte a PDFs com senha pelo teclado virtual e fallback automático via `pdftoppm`/`mutool` e extrator de texto Python integrado.
  - Controles no leitor PDF: **`L1`/`R1`** trocar página, **`X`** alternar zoom, **`Y`** alternar visualização de documento/texto, **`D-Pad`** rolar e **`A`** voltar.
- **Tudo da v2.1.3 & v2.1.2 Preservado:**
  - Editor de texto integrado (`.txt`, `.xml`, `.html`, `.sh`, `.cfg`, `.json`, `.m3u8`, `.pls`), execução de scripts `.sh`/EmulationStation, reprodução direta de vídeos/músicas/playlists/rádios, changelog em quadro único, 7-Zip oficial ARM64 (`7zzs`) com senha e barra de progresso/velocidade/ETA.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa o pacote da pasta `updates/` (ou GitHub Releases), valida o checksum SHA-256, mantém o lançador fixo **`KPlayer.sh`** atualizado internamente sem mexer em nenhum `gamelist.xml`, preserva favoritos, histórico, listas IPTV/Rádio, clima, tema e idioma, e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.1.4-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer** no R36S. As artes em alta resolução do disco K ficam em `kplayer/scraper/`.
