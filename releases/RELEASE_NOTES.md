# KPlayer v2.1.3 — Edição R36S (Editor de Texto, Scripts `.sh` & EmulationStation, Mídias/Playlists/Rádios nos Arquivos & Changelog Unificado)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.1.3 (R36S Nativo)

- **Editor de Texto Integrado no Gerenciador de Arquivos (`Arquivos`):**
  - Abra, visualize, edite e salve arquivos `.txt`, `.xml`, `.html`, `.htm`, `.sh`, `.cfg`, `.conf`, `.ini`, `.json`, `.log`, `.md`, `.m3u8`, `.m3u`, `.pls`, `.xspf` e `.tsv` diretamente no console.
  - Salvamento atômico com confirmação ao sair caso existam alterações não salvas e bloqueio seguro contra arquivos binários.
- **Execução de Scripts `.sh` de Jogos do R36S e Executáveis do EmulationStation:**
  - Detecta scripts `.sh` e binários ELF (`\x7fELF`, sem falsos positivos em `/roms` FAT32/exFAT).
  - Ao abrir, permite escolher entre **Executar no console** (encerrando SDL2/libVLC/ALSA de forma limpa e transferindo o controle com `execv`) ou **Editar script** no Editor de Texto.
- **Vídeos, Músicas, Playlists `.m3u8` e Arquivos de Rádio Direto no Gerenciador de Arquivos:**
  - Reproduza vídeos e músicas direto do Gerenciador de Arquivos pressionando `B` (retornando para `Arquivos` ao pressionar `A`).
  - Abra playlists `.m3u8`/`.m3u` e arquivos de rádio (`.pls`, `.xspf`, `.tsv`) para escolher e tocar canais, faixas ou estações — ou pressione `X` para editar o conteúdo no Editor de Texto.
- **Changelog Unificado em Um Único Quadro:**
  - A tela de novidades pós-atualização agora agrupa todas as notas dentro de **um único quadro contínuo** com divisórias sutis e rolagem no direcional, substituindo os múltiplos quadros individuais.
- **Tudo da v2.1.2 Preservado:**
  - Gerenciador de Arquivos separado de `Músicas e Vídeos` com acesso à raiz `/`, 7-Zip oficial ARM64 (`7zzs`) com suporte a senha e barra de progresso em tempo real com velocidade e ETA.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa o pacote da pasta `updates/` (ou GitHub Releases), valida o checksum SHA-256, mantém o lançador fixo **`KPlayer.sh`** atualizado internamente sem mexer em nenhum `gamelist.xml`, preserva favoritos, histórico, listas IPTV/Rádio, clima, tema e idioma, e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.1.3-R36S.zip`** nos anexos desta release.
2. Extraia e copie **`KPlayer.sh`** e a pasta **`kplayer/`** para `/roms/ports/` (ou `/roms2/ports/` no SD2).
3. Abra **Ports → KPlayer** no R36S. As artes em alta resolução do disco K ficam em `kplayer/scraper/`.
