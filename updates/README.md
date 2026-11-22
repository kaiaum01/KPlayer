# KPlayer Auto-Update Channel (`updates/`)

Esta pasta é o canal oficial de **Auto-Update** do **KPlayer** (R36S, Android e Web).

## Como funciona a cada nova versão

1. Atualize a versão em `source/version.h` (por exemplo, de `2.0.3` para `2.0.4`), `package.json` e `android/app/build.gradle.kts`, e faça commit/push na branch `main` (ou crie a tag `v2.0.4`).
2. O workflow automático `.github/workflows/auto-update.yml`:
   - Compila **KPlayer R36S** (`KPlayer-vX.Y.Z-R36S.zip` + `.sha256`) e **KPlayer Android** (`KPlayer-vX.Y.Z-Android.apk` + `.sha256`).
   - Copia os pacotes compilados para `updates/vX.Y.Z/`.
   - Atualiza `updates/latest.json` e `updates/history.json` apontando para os downloads da pasta `updates/` no GitHub.
   - Faz commit automático na pasta `updates/` (`[skip ci]`).
3. Ao iniciar qualquer versão anterior do KPlayer (`v2.0.3`, `v2.0.4`, etc.), o app consulta `updates/latest.json`:
   - Se encontrar uma versão maior, exibe o aviso **Nova versão disponível** na barra superior.
   - Ao abrir **Opções (`SELECT`) → Atualizar KPlayer**, o app baixa o pacote desta pasta, valida a integridade (SHA-256), **mantém todos os dados, favoritos, playlists e histórico do usuário** e reinicia automaticamente na nova versão.

## Dados do usuário preservados durante o update
- `iptv_usuario/` (playlists `.m3u`/`.m3u8` e URLs do usuário)
- `radios_usuario/` (rádios `.pls` do usuário)
- `midias/` (mídias locais)
- `settings.cfg`, `preferences.cfg`, `history.txt` e `favorites.txt`
- Preferências e histórico salvos no navegador/Android
