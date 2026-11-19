# Publicar KPlayer v2.0.0 no GitHub

Tudo já está pronto, compilado, testado, documentado e com o **commit** e a **tag `v2.0.0`** criados no repositório local.

---

## 1. Enviar o Commit e a Tag `v2.0.0` (Terminal)

Substitua `<SEU_USUARIO>/<SEU_REPO>` pelo endereço do seu repositório no GitHub:

```bash
git remote add origin https://github.com/<SEU_USUARIO>/<SEU_REPO>.git
# Se já tiver origin configurado, use: git remote set-url origin https://github.com/<SEU_USUARIO>/<SEU_REPO>.git

git push -u origin main
git push origin v2.0.0
```

> **Automação via GitHub Actions:** assim que você fizer `git push origin v2.0.0`, o workflow **KPlayer - Compilar e preparar release R36S** (`.github/workflows/release-r36s.yml`) compila automaticamente o binário ARM64, gera `KPlayer-v2.0.0-R36S.zip` + `.sha256` e cria um **rascunho da Release `KPlayer v2.0.0`** já preenchido com `releases/RELEASE_NOTES.md`!

---

## 2. Ou Publicar Manualmente (GitHub Desktop + Web)

1. Abra o **GitHub Desktop → File → Add local repository** e selecione a pasta do projeto.
2. Clique em **Publish repository** (ou **Push origin** se já conectado).
   - **Nome sugerido:** `KPlayer`
   - **Descrição sugerida:** `Portable media center for R36S (dArkOS / PortMaster) — Music with LRC, Video, Online Radio, IPTV & Placar da Bola (C + SDL2 + libVLC)`
3. No navegador, abra seu repositório no GitHub e vá em **Releases → Draft a new release**:
   - **Tag:** `v2.0.0` (branch `main`)
   - **Release title:** `KPlayer v2.0.0 — R36S / dArkOS`
   - **Description:** copie e cole todo o conteúdo de **`releases/RELEASE_NOTES.md`**
   - **Anexos (Attach binaries):**
     - `releases/KPlayer-v2.0.0-R36S.zip`
     - `releases/KPlayer-v2.0.0-R36S.zip.sha256`
4. Clique em **Publish release**.

---

## 3. Mensagem de Commit Utilizada

```text
release: KPlayer v2.0.0 for R36S / dArkOS

- Animated boot splash screen with upfront library, radio, IPTV & football preloading
- Slim animated first-run welcome screen with unified language capsule and 7 live theme color dots
- Replace YouTube with Placar da Bola (SofaScore-style live scores, stats, events & lineups)
- Re-center music player transport bar and polish playback/category icons
- Restrict media scan to dedicated folders: /roms(2)/bgmusic (audio) and /roms(2)/videos (video)
- Bundle 640x480 dArkOS port cover (images/KPlayer-image.png), gamelist.xml and KPlayer-metadata.xml
- Refresh all v2.0.0 screenshots, banner, bilingual documentation, unit tests and release notes
```

---

## 4. Verificação do Pacote Gerado

- **ZIP instalável:** `releases/KPlayer-v2.0.0-R36S.zip` (`7.006.362 bytes`)
- **SHA-256:** `332eb575876f27f1cc50537119ac185c62b13ea8b543dc8b9dd94f929f585ed6`
- **Conteúdo do ZIP:** `KPlayer.sh`, `gamelist.xml`, `images/KPlayer-image.png`, `kplayer/kplayer` (ARM64), `kplayer/cover.png`, `kplayer/KPlayer-metadata.xml`, `kplayer/lib/libvlc*`, `kplayer/football_fetch.py`, `kplayer/golazo`, `kplayer/iptv_fetch.py`, fontes, sprites, rádios de exemplo e licenças.
