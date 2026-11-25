# KPlayer v2.1.4 — Edição R36S (Áudio em Jogos — Teste Prévio & Leitor de PDF Compatível com PdfCraft R36S)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.1.4 (R36S Nativo)

- **Música e Rádio em Segundo Plano ao Abrir Jogos `.sh` (`Teste prévio`):**
  - Nova opção **`Áudio em jogos (Teste prévio)`** em **`SELECT → Opções`**, permitindo **ativar ou desativar** a qualquer momento (salva em `settings.cfg`, desativada por padrão).
  - Quando ativada e uma música local ou rádio online estiver tocando, ao lançar um script `.sh` de jogo ou executável pelo Gerenciador de Arquivos (`Arquivos`), o `KPlayer.sh` + `bg_audio.py` mantém o áudio em segundo plano (volume reduzido) via `cvlc`/`mpv`/`ffplay`, pausa o `gptokeyb` para o jogo assumir o controle e retoma o KPlayer automaticamente ao sair do jogo.
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
