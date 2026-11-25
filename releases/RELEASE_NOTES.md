# KPlayer v2.1.2 — Edição R36S (Gerenciador de Arquivos Completo, 7-Zip Oficial com Senha & Progresso ao Vivo)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.1.2 (R36S Nativo)

- **Novo Gerenciador de Arquivos Completo (`Arquivos` na Home — Separado de `Músicas e Vídeos`):**
  - Mantém o gerenciador de **`Músicas e Vídeos`** 100% intacto e adiciona um **Gerenciador de Arquivos independente** com acesso à **pasta raiz do console (`/`)** e a todos os arquivos e diretórios (`/roms`, `/roms2`, `/roms/ports`, `/home` e pasta do KPlayer via atalhos rápidos em `L1`).
  - Operações completas: **criar pastas**, **apagar** arquivos e pastas (com confirmação explícita e proteção contra exclusão de pastas críticas do sistema), **copiar**, **mover/recortar**, **colar** (`R1`), **renomear**, **seleção múltipla** (`Y`), **compactar em `.zip`** e exibir/ocultar arquivos ocultos (`.dotfiles`).
- **Integração Oficial do 7-Zip Público (`github.com/ip7z/7zip`):**
  - Inclui o binário oficial estático ARM64 **`7zzs`** (com fallback automático em Python `zipfile`/`tarfile`) para **abrir/navegar e descompactar** `.zip`, `.7z`, `.rar`, `.tar.*`, `.cbz`, `.cbr` e `.iso`.
  - **Suporte completo a arquivos protegidos por senha:** detecta automaticamente arquivos criptografados, abre prompt de senha com máscara (`Y` para exibir/ocultar) e envia a senha de forma segura por `stdin` (nunca exposta em argumentos de processo).
  - Proteção contra *Zip Slip* / *path traversal* ao validar todos os caminhos internos antes da extração.
- **Barra de Carregamento em Tempo Real com Velocidade e Tempo Restante (ETA):**
  - Todas as operações pesadas (copiar, mover, apagar, descompactar e compactar) rodam de forma assíncrona em segundo plano exibindo **barra de progresso (`0%–100%`)**, **velocidade ao vivo (`KB/s`, `MB/s`)**, **tempo restante estimado (ETA)**, bytes/itens transferidos, nome do arquivo atual e opção de **cancelar (`A`)**.
- **Estabilidade da Série 2.1 Preservada:**
  - Correção crítica de áudio ALSA/libVLC nos sons das teclas, lazy-loading assíncrono da biblioteca de mídias, reinstalação na mesma versão com aviso e aba Notícias com fotos/vídeos mantidos.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa o pacote da pasta `updates/` (ou GitHub Releases), valida o checksum SHA-256, mantém o lançador fixo **`KPlayer.sh`** atualizado internamente sem mexer em nenhum `gamelist.xml`, preserva favoritos, histórico, listas IPTV/Rádio, clima, tema e idioma, e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.1.2-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer** no R36S. As artes em alta resolução do disco K ficam em `kplayer/scraper/`.
