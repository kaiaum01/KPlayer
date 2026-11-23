# KPlayer v2.1.0 — Edição R36S (Notícias, Músicas e Vídeos Unificados, Gradientes Corrigidos, 10 Visualizadores & 14 Temas)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.1.0 (R36S Nativo)

- **Nova Aba `Notícias` (antes do `Placar da Bola`):**
  - Manchetes do Brasil em português com filtros rápidos (**Todas**, **Urgente**, **Mundo**, **Polícia**, **Entretenimento** e **Esportes**) via API **NewsData.io** (configurável por `news.cfg` no R36S ou `NEWSDATA_API_KEY`, com fallback automático para feeds RSS brasileiros ao vivo) e leitor completo de matérias pelo controle.
- **Dashboard Reorganizada (`Músicas e Vídeos` Unificados):**
  - Os cards de músicas e vídeos foram unidos em **`Músicas e Vídeos`**, deixando a Home com **Músicas e Vídeos**, **Arquivos**, **Rádio Online**, **IPTV**, **Notícias** e **Placar da Bola**.
- **Correção Visual em Todos os 14 Temas do R36S:**
  - Eliminado o artefato de listras horizontais dentro das caixas translúcidas e dos painéis do Protetor de Tela (relógio/clima, barra "tocando agora", letras e badges). Todas as caixas agora usam gradiente vertical suave fiel ao tema e borda nítida de 1px sem sobreposição de transparência.
- **10 Visualizadores Reativos ao Áudio (+ Modo Automático) no Protetor de Tela:**
  - Os 5 clássicos inspirados no Windows Media Player foram aprimorados com mais brilho, profundidade e fluidez: **Barras e Ondas**, **Alquimia**, **Bateria / Pulso**, **Plenitude** e **Ambience / Cosmos**.
  - **5 novos visualizadores adicionados:** **Túnel Neon** (hiperespaço 3D com raios laser), **Chuva Matrix** (cascatas digitais luminosas reativas ao ritmo), **Chama / Fogo** (cortinas de plasma em camadas com brasas ascendentes), **Prisma 3D** (cubo wireframe 3D rotativo com anéis holográficos) e **Galáxia Espiral** (nebulosa espiral em 4 braços com estrelas pulsantes).
  - Continua ativado por padrão após **30 segundos** de inatividade durante músicas ou rádio, com opção de exibir relógio/data/clima e letras `.LRC` sincronizadas sobre os visualizadores (`L1`/`R1` troca o efeito ao vivo).
- **14 Temas Exclusivos no R36S:**
  - Mantidos os 7 temas clássicos (`Preto e verde`, `Preto e branco`, `Branco e preto`, `Verde e preto`, `Preto e azul`, `Preto e roxo`, `Preto e vermelho`).
  - **7 novos temas adicionados:** **Preto e dourado**, **Preto e ciano**, **Preto e laranja**, **Preto e rosa**, **Meia-noite Neon**, **Retrô Game Boy** e **Oceano Profundo** — todos com troca instantânea na tela de Boas-Vindas e em `SELECT → Tema`.
- **Sons Táteis das Teclas (`Sons das teclas`):**
  - Sintetizador PCM procedural leve (sem arquivos WAV externos) com cliques suaves distintos para navegação, confirmação, voltar e troca de abas.
  - Ativado por padrão e configurável a qualquer momento em **`SELECT → Sons das teclas`** (salvo em `settings.cfg`).
- **Mais Animações em Toda a Interface:**
  - Transições suaves entre telas, aura de foco deslizante com elevação sutil nos cards da tela inicial, seta animada no card focado, fundo bokeh ambiente vivo, cards com barra lateral pulsante, equalizador animado na lista de músicas e toasts com entrada/saída suave.
- **Documentação Completa Atualizada no GitHub:**
  - `README.md`, `README.pt-BR.md`, `CHANGELOG.md`, `docs/INSTALL.md`, `docs/CONTROLS.md`, `docs/MEDIA.md` e `docs/BUILD.md` totalmente revisados para a v2.1.0.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa o pacote da pasta `updates/` (ou GitHub Releases), valida o checksum SHA-256, mantém o lançador fixo **`KPlayer.sh`** atualizado internamente sem mexer em nenhum `gamelist.xml`, preserva favoritos, histórico, listas IPTV/Rádio, clima, tema e idioma, e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.1.0-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer** no R36S. As artes em alta resolução do disco K (Capa PNG transparente `1200×1200`, Marquee PNG transparente `1600×490`, Boxart `900×1200` e Fanart `1920×1080`) ficam em `kplayer/scraper/`.
