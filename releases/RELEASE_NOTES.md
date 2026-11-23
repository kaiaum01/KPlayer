# KPlayer v2.1.1 — Edição R36S (Correção Crítica ALSA/Mídias, Lazy-Loading Assíncrono & Reinstalação com Aviso)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.1.1 (R36S Nativo)

- **Correção Crítica de Reprodução de Mídias (ALSA + Sons das Teclas):**
  - Corrigido o bug da v2.1.0 em que o dispositivo de áudio SDL2 dos sons das teclas mantinha o ALSA bloqueado e impedia músicas, vídeos, rádios online e IPTV de tocar na libVLC (`--aout=alsa`).
  - O sintetizador de cliques agora só ativa após a inicialização completa do player, libera o dispositivo ALSA imediatamente antes de qualquer reprodução (`sfx_release_device()`) e fecha automaticamente ~160ms após o término dos cliques.
- **Lazy-Loading Assíncrono da Biblioteca de Mídias na Inicialização:**
  - A varredura de músicas (`/roms/bgmusic`, `/roms2/bgmusic`) e vídeos (`/roms/videos`, `/roms2/videos`) agora roda de forma assíncrona em segundo plano (`pthread`), deixando o boot mais rápido em cartões SD cheios e evitando qualquer bloqueio na inicialização do áudio.
- **Atualização na Mesma Versão (com Aviso e Confirmação):**
  - Agora é possível atualizar/reinstalar o KPlayer mesmo já estando na versão mais recente (via `SELECT → Verificar atualizações`), com **aviso explícito** na tela e confirmação em 2 etapas (`B` duas vezes), preservando favoritos, histórico, listas IPTV/Rádio, clima, `news.cfg` e `gamelist.xml`.
- **Notícias com Imagens e Vídeos no R36S + Todas as Melhorias da Série 2.1:**
  - Aba **`Notícias`** (antes do `Placar da Bola`) com miniaturas em cache, reprodução de vídeos via libVLC e fallback RSS brasileiro ao vivo.
  - Dashboard unificada (**`Músicas e Vídeos`**), 14 temas R36S com gradiente suave sem listras e 10 visualizadores reativos ao áudio (+ Automático).

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
   - Caso já esteja na mesma versão e deseje reinstalar, leia o aviso na tela e pressione **`B`** duas vezes para confirmar.
3. O KPlayer baixa o pacote da pasta `updates/` (ou GitHub Releases), valida o checksum SHA-256, mantém o lançador fixo **`KPlayer.sh`** atualizado internamente sem mexer em nenhum `gamelist.xml`, preserva favoritos, histórico, listas IPTV/Rádio, clima, tema e idioma, e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.1.1-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer** no R36S. As artes em alta resolução do disco K (Capa PNG transparente `1200×1200`, Marquee PNG transparente `1600×490`, Boxart `900×1200` e Fanart `1920×1080`) ficam em `kplayer/scraper/`.
