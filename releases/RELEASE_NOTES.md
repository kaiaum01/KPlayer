# KPlayer v2.0.9 — Edição R36S (Novas Artes Transparentes do Disco K + Lançador .sh Versionado)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.0.9 (R36S Nativo)

- **Novas Imagens de Alta Resolução Fiéis ao Disco de Vinil K Original (dentro de `kplayer/scraper/`):**
  - **Capa Principal (Fundo Transparente PNG32)**: `kplayer/scraper/kplayer-image.png` (**1200×1200** RGBA) — disco de vinil preto com centro verde esmeralda `K`, anel duplo branco e legenda `PLAYER` recortados com fundo transparente (também sincronizada em `images/KPlayer-image.png` e `kplayer/cover.png`).
  - **Marquee / Logo (Fundo Transparente PNG32)**: `kplayer/scraper/kplayer-marquee.png` (**1600×490** RGBA) — logo horizontal grande com o disco de vinil `K` + tipografia **`K PLAYER`** com contorno escuro nítido para se destacar em qualquer tema do EmulationStation.
  - **Boxart Vertical**: `kplayer/scraper/kplayer-thumb.png` (**900×1200**) — arte vertical fiel ao disco de vinil K original (`PLAYER · R36S EDITION`).
  - **Fanart Full HD**: `kplayer/scraper/kplayer-fanart.png` (**1920×1080**) — papel de parede widescreen escuro com o disco de vinil K à direita e ondas acústicas verdes sutis.
- **Sem Edição Automática de XML (`gamelist.xml` 100% Intacto):**
  - A edição automática de metadados no `gamelist.xml` foi totalmente removida — o KPlayer nunca modifica nem sobrescreve seus arquivos `gamelist.xml`.
- **Lançador `.sh` Atualizado Automaticamente a Cada Versão (`KPlayer v2.0.9.sh`):**
  - A cada nova versão instalada ou atualizada via Auto-Update, o script lançador é automaticamente atualizado/renomeado para **`KPlayer vX.Y.Z.sh`** (com `KPLAYER_VERSION="X.Y.Z"` gravado dentro dele), removendo lançadores antigos do KPlayer para evitar duplicatas.
- **Inclui Tudo da v2.0.7:**
  - Changelog pós-atualização exibido uma única vez, protetor de tela com visualizadores (30s ativado por padrão), tela inicial inteligente com saudação do clima + sugestões aleatórias e barra de carregamento ao vivo (0%–100%) no atualizador.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Quando o aviso aparecer na barra superior, pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa da pasta `updates/`, valida o SHA-256, atualiza o lançador `.sh` para **`KPlayer v2.0.9.sh`**, atualiza as novas artes em `kplayer/scraper/` preservando todos os seus dados e `gamelist.xml` e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.0.9-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer v2.0.9.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer v2.0.9** no R36S. As artes em alta resolução (Capa e Marquee transparentes, Boxart e Fanart) ficam prontas em `kplayer/scraper/` para uso livre no seu scraper/tema.
