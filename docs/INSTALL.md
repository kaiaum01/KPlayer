# Instalação / Installation — KPlayer 1.0.4

## Português

1. No GitHub execute **Actions → Compilar KPlayer R36S → Run workflow**.
2. Quando terminar com sucesso, baixe o artefato e extraia
   `KPlayer-v1.0.4-R36S.zip`.
3. Copie `KPlayer.sh` e `kplayer/` lado a lado para `ports/` no cartão.
4. Abra Ports → KPlayer. Escolha o idioma e confirme com B.
5. Suas músicas e vídeos podem ficar em `ports/kplayer/midias/`; suas listas
   de rádio podem ficar em `ports/kplayer/radios_usuario/`.

Requer R36S ARM64, dArkOS/PortMaster, SDL2, ALSA e plugins VLC compatíveis em
`/usr/lib/aarch64-linux-gnu/vlc/plugins`. Rádio requer internet; `curl` é
opcional para capas. Outros sistemas não foram validados.

Antes de atualizar, faça backup de músicas, rádios e dos arquivos
`settings.cfg`, `preferences.cfg` e `favorites.cfg`. Não substitua arquivos
pessoais sem conferir. O auto-update é experimental; veja
`ATUALIZADOR-EXPERIMENTAL.md` no código-fonte. Se houver
erro, procure `ports/kplayer/log.txt`.

## English

Run the R36S GitHub Actions workflow, download its artifact, extract
`KPlayer-v1.0.4-R36S.zip` and copy `KPlayer.sh` and `kplayer/` to
`ports/`. Select language with B. R36S ARM64 with dArkOS/PortMaster, SDL2,
ALSA and matching VLC plugins are required. Back up media, radio playlists and
settings before updating. Auto-update is experimental and requires Python 3.
