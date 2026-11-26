# KPlayer v2.1.7 — Edição R36S (Mini-Player Nativo nos Ports & Injeção no Sistema Inteiro `L3 + R3`)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.1.7 (R36S Nativo)

- **Mini-Player KPlayer (`L3 + R3`) Nativo Sempre Disponível nos Ports:**
  - Ao abrir qualquer jogo `.sh` ou executável pelo **Gerenciador de Arquivos (`Arquivos`)**, você escolhe direto na hora:
    - **`Executar com Mini-Player KPlayer (L3 + R3)`** *(padrão)* — inicia o port com sua música ou rádio em segundo plano e o Mini-Player pronto ao apertar **`L3 + R3`**.
    - **`Executar sem Mini-Player (padrão)`** — inicia o jogo de forma convencional, desativando o overlay (`KPLAYER_DISABLE_OVERLAY=1`).
    - **`Abrir no Editor de Texto`** *(para arquivos `.sh`)*.
- **Mini-Player no Sistema Inteiro (Injeção Persistente no Console):**
  - Nova opção **`SELECT → Opções → Mini-Player no Sistema Inteiro`** (`ports/kplayer/system_inject.py`), controlada **exclusivamente dentro do KPlayer**:
    - Desativa a música de fundo do EmulationStation de forma limpa e reversível (com backup do `es_settings.cfg` e sem jamais mexer em nenhum `gamelist.xml`).
    - Injeta o Mini-Player KPlayer no sistema inteiro (`/usr/local/lib/libkp_overlay.so`, `/etc/ld.so.preload`, `/etc/profile.d/kplayer-miniplayer.sh` e serviço `kplayer-miniplayer.service` com fallback `/etc/rc.local`) para permanecer nativo no console mesmo após reiniciar o R36S.
    - Quando você abre o KPlayer, o daemon do sistema pausa automaticamente (`/dev/shm/kplayer-main.lock`) e sincroniza sua playlist e tema ao sair.
    - Para remover tudo e restaurar a música original do EmulationStation, basta desativar a opção novamente em **`SELECT → Opções → Mini-Player no Sistema Inteiro`**.
- **Controles do Mini-Player KPlayer (`L3 + R3` / `F8`):**
  - **`L3 + R3`** abre/oculta; **`↑`/`↓`** navega nas 5 ações; **`←`/`→`** ajusta volume (`10%–100%`) ou troca faixa; **`B`/`START`** confirma; **`R2`/`L2`** avança/volta faixa direto; **`A`** oculta.
- **Preview Web v2.1.7 & Base Estável R36S:**
  - Botão **`Demo Mini-Player (L3+R3)`** com alternância entre **Port / Jogo** e **EmulationStation (Sistema Injetado)**.
  - Mantidos: Leitor nativo de **`.pdf`** compatível com **`pdfcraft-core.aarch64`** (`kaiaum01/PdfReader-R36s`), Editor de Texto, 7-Zip ARM64 (`7zzs`) com senha, 10 Visualizadores, 14 Temas, Rádio Online, IPTV + EPG, Notícias, Placar da Bola e Clima Open-Meteo.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa o pacote da pasta `updates/` (ou GitHub Releases), valida o checksum SHA-256, mantém o lançador fixo **`KPlayer.sh`** atualizado internamente sem mexer em nenhum `gamelist.xml`, preserva favoritos, histórico, listas IPTV/Rádio, clima, tema, idioma e o estado da injeção do sistema, e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.1.7-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer** no R36S. As artes em alta resolução do disco K ficam em `kplayer/scraper/`.
