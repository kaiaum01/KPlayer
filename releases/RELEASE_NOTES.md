# KPlayer v2.1.6 — Edição R36S (Áudio em 2º Plano no EmulationStation & Mini-Player Visual KPlayer `L3 + R3`)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.1.6 (R36S Nativo)

- **Áudio em 2º Plano Fora do KPlayer (EmulationStation & Jogos):**
  - **Ativação e desativação exclusivas dentro do app KPlayer:** ligue ou desligue em **`SELECT → Opções → Áudio em 2º plano (ES/Jogos)`**.
  - Ao sair do KPlayer com a opção ativada, o lançador **`KPlayer.sh`** inicia o serviço nativo em segundo plano (`./kplayer --bg-audio`), mantendo sua música ou rádio online tocando enquanto você navega no **EmulationStation** e abre seus jogos.
  - Ao reabrir o KPlayer, o serviço em segundo plano para de forma limpa; ao desativar a opção no KPlayer, tudo volta ao padrão do console.
- **Silenciamento Automático da Música de Fundo do EmulationStation:**
  - Para impedir que a BGM do EmulationStation toque junto com o KPlayer, o `bg_audio.py` desativa temporariamente `audio.bgmusic`/`BackgroundMusic` em `es_settings.cfg` (com backup reversível), para players de BGM externos (`ogg123`/`mpg123`/`bgm.py`) e silencia fluxos de áudio do `emulationstation` no PulseAudio/PipeWire — **sem jamais alterar nenhum `gamelist.xml`**.
  - Assim que você desativa o áudio em 2º plano dentro do KPlayer, a música original do EmulationStation é restaurada automaticamente.
- **Mini-Player Flutuante (`L3 + R3`) com o Design do KPlayer:**
  - Painel arredondado no canto superior esquerdo (`libkp_overlay.so` + fallback `/dev/fb0`) com gradiente do tema ativo, emblema de disco de vinil **`K`** (`K PLAYER · MINI-PLAYER`), card **`TOCANDO AGORA`** com mini-equalizador e 5 cards navegáveis com barra lateral de foco (`Tocar / Pausar`, `Próxima Música/Rádio`, `Voltar Música/Rádio`, `Volume do Áudio`, `Ocultar Menu`).
  - **Controles:** **`L3 + R3`** abre/oculta; **`↑`/`↓`** navega; **`←`/`→`** ajusta volume (`10%–100%`) ou troca faixa; **`B`/`START`** confirma; **`R2`/`L2`** avança/volta faixa direto; **`A`** oculta.
  - **Demonstração na Preview Web:** Botão **`Demo Mini-Player (L3+R3)`** exibindo o Mini-Player ao vivo sobre o **EmulationStation** (com BGM silenciada) e sobre um **Jogo em execução**.
- **Base Estável R36S Preservada:**
  - Leitor nativo de **`.pdf`** no Gerenciador de Arquivos compatível com **`pdfcraft-core.aarch64`** (`kaiaum01/PdfReader-R36s`), Editor de Texto, 7-Zip ARM64 (`7zzs`) com senha, 10 Visualizadores, 14 Temas, Rádio Online, IPTV + EPG, Notícias, Placar da Bola e Clima Open-Meteo.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa o pacote da pasta `updates/` (ou GitHub Releases), valida o checksum SHA-256, mantém o lançador fixo **`KPlayer.sh`** atualizado internamente sem mexer em nenhum `gamelist.xml`, preserva favoritos, histórico, listas IPTV/Rádio, clima, tema e idioma, e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.1.6-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer** no R36S. As artes em alta resolução do disco K ficam em `kplayer/scraper/`.
