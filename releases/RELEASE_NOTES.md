# KPlayer v2.0.8 — Edição R36S (Artes de Scraper Completas, Merge Automático em gamelist.xml e .sh Versionado)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.0.8 (R36S Nativo)

- **Pacote Completo de Imagens de Scraper dentro de `kplayer/scraper/`:**
  - **Capa Principal (`<image>`)**: `kplayer/scraper/kplayer-image.png` (640×480)
  - **Boxart / Miniatura (`<thumbnail>`)**: `kplayer/scraper/kplayer-thumb.png` (480×640)
  - **Marquee / Logo (`<marquee>`)**: `kplayer/scraper/kplayer-marquee.png` (640×360)
  - **Fanart / Papel de Parede (`<fanart>`)**: `kplayer/scraper/kplayer-fanart.png` (854×480)
  - Todas as artes e metadados (`KPlayer-metadata.xml` e `gamelist.xml` interno) ficam organizados dentro da pasta `kplayer/`.
- **Inserção Automática de Metadados em `/roms/ports/gamelist.xml` e `/roms2/ports/gamelist.xml` (Sem Apagar Nada):**
  - Ao iniciar ou atualizar, o KPlayer executa automaticamente `kplayer/scraper_sync.py` e insere ou atualiza apenas o bloco `<game>` do KPlayer no `gamelist.xml` existente em `/roms/ports` e `/roms2/ports`, preservando 100% dos seus outros ports e jogos.
  - Se o arquivo `gamelist.xml` ainda não existir na pasta `ports`, o KPlayer cria automaticamente um `gamelist.xml` válido já com todos os metadados completos (`name`, `sortname`, `desc`, `image`, `thumbnail`, `marquee`, `fanart`, `rating`, `releasedate`, `developer`, `publisher`, `genre`, `family`, `players`, `lang`, `region`, `kidgame`).
- **Lançador `.sh` Atualizado Automaticamente a Cada Versão (`KPlayer v2.0.8.sh`):**
  - A cada nova versão instalada ou atualizada via Auto-Update, o script lançador é automaticamente atualizado/renomeado para **`KPlayer vX.Y.Z.sh`** (com `KPLAYER_VERSION="X.Y.Z"` gravado dentro dele), removendo lançadores antigos do KPlayer para não gerar duplicatas no EmulationStation e sincronizando o `<path>` no `gamelist.xml`.
- **Inclui Tudo da v2.0.7:**
  - Changelog pós-atualização exibido uma única vez, protetor de tela com visualizadores (30s ativado por padrão), tela inicial inteligente com saudação do clima + sugestões aleatórias e barra de carregamento ao vivo (0%–100%) no atualizador.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Quando o aviso aparecer na barra superior, pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa da pasta `updates/`, valida o SHA-256, atualiza o lançador `.sh` para **`KPlayer v2.0.8.sh`**, insere os metadados/artes no `gamelist.xml` preservando todos os outros jogos e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.0.8-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer v2.0.8.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer v2.0.8** no R36S — na primeira abertura o próprio player insere os metadados e imagens de scraper no seu `gamelist.xml` automaticamente!
