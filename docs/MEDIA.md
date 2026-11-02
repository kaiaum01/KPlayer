# Media and metadata / Mídias e metadados

## English

The Music and Video dashboard cards recursively scan `kplayer/midias`, `/roms` and `/roms2`. Files smaller than 50 KB are excluded from this automatic view, and results are bounded to 4096 entries. The Files card keeps manual folder navigation and can still show smaller supported files.

The extension list in the README is the browser filter, not a codec guarantee. Decoding, subtitle rendering, smooth playback and supported profiles depend on installed VLC plugins and device performance.

MP3 tags are read locally: ID3v2.2/2.3/2.4 and ID3v1 title/artist/album; APIC/PIC JPEG or PNG artwork; USLT/ULT lyrics. UTF-8, Latin-1 and UTF-16 text are handled. Valid local metadata is kept rather than replaced by the engine's filename fallback. Other formats continue to use libVLC metadata; direct embedded artwork/lyrics extraction in this version is specific to ID3 tags.

For external artwork, use the media basename plus `.jpg`/`.png`, or `cover.jpg`, `cover.png`, `folder.jpg`, `folder.png`, `front.jpg`, `front.png` in the same folder. External covers have priority. The display crops the centre of the image into a square while preserving its proportions. Images are limited to 2048 × 2048; ID3 tags to 16 MiB and embedded picture data to 8 MiB.

Use UTF-8 `Song.lrc` / `Song.LRC` alongside `Song.mp3`, with `[mm:ss.xx]` timestamps. Multiple timestamps and `[offset:milliseconds]` are accepted. Valid external LRC lines take precedence over embedded lyrics. Embedded USLT containing timestamps synchronizes too; plain embedded text can be scrolled. Lyrics are not downloaded from the internet.

The queue is a snapshot of media of the same type in the selected folder. Browsing alone preserves it. Playing a track through the music Folder pane rebuilds the queue. Settings offer repeat off, current track or queue and a shuffle option for music. When shuffle is on, R1 advances through unvisited tracks and L1 moves sequentially. The My favorites entry scans the automatic roots for marked audio files, with the same scan limits; moving a file can lose its mark.

## Português

Os cartões Músicas e Vídeos pesquisam recursivamente em `kplayer/midias`, `/roms` e `/roms2`. Arquivos menores que 50 KB ficam fora desta visualização automática, limitada a 4096 resultados. O cartão Arquivos mantém a navegação manual e pode mostrar arquivos compatíveis menores.

As extensões listadas no README são filtros do explorador. Codecs, perfis, legendas e fluidez dependem dos plugins VLC instalados e do desempenho do aparelho.

MP3: leitura local de ID3v2.2/2.3/2.4 e ID3v1 para título/artistas/álbum; APIC/PIC para capa JPEG/PNG; USLT/ULT para letras. Texto UTF-8, Latin-1 e UTF-16. Metadados locais válidos são preservados. Outros formatos continuam usando os metadados da libVLC; a extração direta de capa e letras embutidas desta versão é específica de tags ID3.

Capas externas: mesmo nome da mídia com `.jpg`/`.png`, ou `cover.jpg`, `cover.png`, `folder.jpg`, `folder.png`, `front.jpg`, `front.png` na pasta. Têm prioridade sobre a capa embutida. A imagem mantém a proporção e é recortada no centro para ocupar o quadrado. Limites: imagem 2048 × 2048; tag ID3 16 MiB; imagem embutida 8 MiB.

Letras: `Musica.lrc` / `Musica.LRC` UTF-8 ao lado de `Musica.mp3`, com tempos `[mm:ss.xx]`. Aceita múltiplos tempos e `[offset:milissegundos]`. Linhas válidas no LRC externo têm prioridade. USLT embutido com tempos também sincroniza; texto simples permite rolagem. As letras não são baixadas da internet.

A fila preserva os arquivos do mesmo tipo da pasta selecionada. Explorar outras pastas não a altera. Tocar pelo painel Pasta refaz a fila. Em Opções, escolha repetição desligada, da faixa ou da fila e ative o aleatório para música. Com aleatório, R1 avança entre faixas ainda não visitadas e L1 volta sequencialmente. Minhas favoritas procura arquivos de áudio marcados nas pastas da busca automática, com os mesmos limites; mover o arquivo pode perder a marcação.

## Transport metadata / Metadados da barra

The format badge is the uppercase filename extension, not a decoded codec/profile report. File size is read from `stat` when the file opens. It uses 1024-byte KB and 1024²-byte MB and shows `-- MB` when unavailable. No bitrate, channel count or sample rate is invented.

A etiqueta mostra a extensão em maiúsculas, não um relatório do codec/perfil. O tamanho vem de `stat` ao abrir o arquivo; usa KB de 1024 bytes e MB de 1024² bytes, com `-- MB` quando indisponível. Bitrate, canais e taxa de amostragem não são estimados.
