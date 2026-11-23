# KPlayer v2.0.9 — Edição R36S (Correção do Lançador KPlayer.sh + Novas Artes Transparentes do Disco K)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.0.9 (R36S Nativo)

- **Correção Crítica do Lançador `KPlayer.sh` (Abre e Reinicia Sempre):**
  - Corrigido o problema da v2.0.8 em que o script `.sh` mudava de nome (`KPlayer v2.0.8.sh`), procurava um arquivo versionado e impedia o EmulationStation de abrir o KPlayer.
  - Restaurado o lançador fixo **`KPlayer.sh`** (sem espaços no nome, com a versão `v2.0.9` gravada internamente), reinício seguro via `exec bash "$script_dir/KPlayer.sh"`, proteção contra erros de `chmod` em cartões FAT32/exFAT e limpeza automática de sobras `KPlayer v*.sh`.
- **Novas Imagens de Alta Resolução Fiéis ao Disco de Vinil K Original (dentro de `kplayer/scraper/`):**
  - **Capa Principal (Fundo Transparente PNG32)**: `kplayer/scraper/kplayer-image.png` (**1200×1200** RGBA) — disco de vinil preto com centro verde esmeralda `K`, anel duplo branco e legenda `PLAYER` recortados com fundo transparente (também sincronizada em `images/KPlayer-image.png` e `kplayer/cover.png`).
  - **Marquee / Logo (Fundo Transparente PNG32)**: `kplayer/scraper/kplayer-marquee.png` (**1600×490** RGBA) — logo horizontal grande com o disco de vinil `K` + tipografia **`K PLAYER`** com contorno escuro nítido.
  - **Boxart Vertical**: `kplayer/scraper/kplayer-thumb.png` (**900×1200**) — arte vertical fiel ao disco de vinil K original (`PLAYER · R36S EDITION`).
  - **Fanart Full HD**: `kplayer/scraper/kplayer-fanart.png` (**1920×1080**) — papel de parede widescreen escuro com o disco de vinil K à direita e ondas acústicas verdes sutis.
- **Sem Edição Automática de XML (`gamelist.xml` 100% Intacto):**
  - A edição automática de metadados no `gamelist.xml` foi removida — o KPlayer nunca modifica nem sobrescreve seus arquivos `gamelist.xml`.
- **Inclui Tudo da v2.0.7:**
  - Changelog pós-atualização exibido uma única vez, protetor de tela com visualizadores (30s ativado por padrão), tela inicial inteligente com saudação do clima + sugestões aleatórias e barra de carregamento ao vivo (0%–100%) no atualizador.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa da pasta `updates/`, valida o SHA-256, restaura o lançador fixo **`KPlayer.sh`** (removendo sobras `KPlayer v*.sh`), atualiza as novas artes em `kplayer/scraper/` preservando todos os seus dados e `gamelist.xml` e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.0.9-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer** no R36S.
