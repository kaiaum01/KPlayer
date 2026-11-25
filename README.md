<p align="center">
  <img src="docs/images/banner.svg" alt="KPlayer v2.1.4 — Portable Media Center for R36S" width="100%" />
</p>

<h1 align="center">KPlayer v2.1.4</h1>

<p align="center">
  <strong>Native Portable Media Center for R36S (dArkOS / PortMaster — C + SDL2 + libVLC ARM64)</strong><br />
  Music &amp; Videos (.LRC) · File Manager + PDF (PdfCraft) + Editor + .sh + 7-Zip · Background Audio Preview · 10 Visualizers · 14 Themes · Radio · IPTV + EPG · News · Weather · Placar
</p>

<p align="center">
  <a href="README.pt-BR.md">Português (BR)</a> ·
  <a href="docs/INSTALL.md">Installation (R36S)</a> ·
  <a href="docs/CONTROLS.md">Controls</a> ·
  <a href="docs/MEDIA.md">Media &amp; Lyrics</a> ·
  <a href="docs/BUILD.md">Build Guide</a> ·
  <a href="TERMS.md">Terms &amp; Transparency</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="releases/RELEASE_NOTES.md">v2.1.4 Release Notes</a> ·
  <a href="THIRD_PARTY.md">Licenses</a>
</p>

---

## What's New in v2.1.4 (R36S Native)

- **Background Music & Online Radio while Launching `.sh` Games (`Teste prévio`):**
  - New toggleable option **`Áudio em jogos (Teste prévio)`** in **`SELECT → Opções`** (persisted in `settings.cfg`, disabled by default).
  - When enabled, launching a `.sh` game script or EmulationStation executable from the File Manager hands off via exit code `43` (`KPlayer.sh` + `bg_audio.py`), pauses `gptokeyb`, keeps local music or online radio playing softly in the background (`cvlc`/`mpv`/`ffplay`), and cleanly returns to KPlayer when you exit the game.
- **Built-in PDF Reader Compatible with `PdfCraft R36S` (`github.com/kaiaum01/PdfReader-R36s`):**
  - Open **`.pdf`** files directly inside the File Manager (`Arquivos`).
  - Speaks the native `serve` JSON IPC protocol of **`pdfcraft-core.aarch64`** (including password-protected PDFs via the on-screen keyboard), offers external launch into **`PdfCraft.sh`** when installed in `/roms(2)/ports/`, and includes automatic `pdftoppm`/`mutool`/pure-Python text fallbacks (`L1`/`R1` pages, `X` zoom, `Y` text/document toggle, `A` back).
- **All v2.1.3 & v2.1.2 File Manager Features Preserved:**
  - Built-in **Text Editor** (`.txt`, `.xml`, `.html`, `.sh`, `.cfg`, `.json`, `.m3u8`, `.pls`), `.sh` & EmulationStation launcher, direct playback of videos/music/playlists/radio files, unified single-frame Changelog, official **7-Zip** (`7zzs`) password-protected extraction, and live progress bar with speed & ETA.
- **Stripe-Free Smooth Gradients Across All 14 R36S Themes:**
  - Fixed alpha double-blending stripes inside translucent panels and screensaver HUD boxes across every theme by rewriting `rounded()`, converting `glow_rect()` to hollow rings (`rounded_outline()`), and using smooth theme-aware `rounded_gradient()` fills everywhere.
- **10 Audio-Reactive Screensaver Visualizers (+ Auto Cycle):**
  - Enhanced 5 classic WMP-inspired visualizers: **Barras e Ondas**, **Alquimia**, **Bateria / Pulso**, **Plenitude**, and **Ambience / Cosmos**.
  - Added **5 brand-new real-time effects**: **Túnel Neon** (3D hyperspace neon tunnel + laser rays), **Chuva Matrix** (luminous digital rain columns), **Chama / Fogo** (layered plasma flame curtains + rising embers), **Prisma 3D** (rotating 3D wireframe cube + holographic rings), and **Galáxia Espiral** (4-arm cosmic spiral nebula).
  - Enabled by default after **30s** idle during Music or Online Radio, with optional **Clock / Date / Weather** and synced **`.LRC` Lyrics** overlays (`L1`/`R1` switches visualizers live).
- **14 Exclusive R36S Themes:**
  - Keeps all 7 original themes (`Preto e verde`, `Preto e branco`, `Branco e preto`, `Verde e preto`, `Preto e azul`, `Preto e roxo`, `Preto e vermelho`) and adds **7 new palettes**: **Preto e dourado**, **Preto e ciano**, **Preto e laranja**, **Preto e rosa**, **Meia-noite Neon**, **Retrô Game Boy**, and **Oceano Profundo** — selectable live on Welcome or in `SELECT → Tema`.
- **Tactile Key Click Sounds (`Sons das teclas`):**
  - Lightweight procedural PCM click synthesizer in C/SDL2 (zero external WAV files) with distinct feedback tones for D-pad navigation, Confirm (`B`), Back (`A`), and Tab/Option switches. Enabled by default and toggleable in **`SELECT → Sons das teclas`**.
- **Richer UI Animations Everywhere:**
  - Smooth fade transitions between screens, gliding interpolated focus aura & subtle hover lift on Home tiles, animated tile arrows, living drifting bokeh backdrop, pulsing accent bar on focused cards, live animated mini-equalizer bars on playing tracks, and slide-in/fade-out toast notifications.
- **Stable Launcher, High-Res Transparent Scraper Art & Safe Auto-Updater:**
  - Fixed **`KPlayer.sh`** launcher (no spaces in filename, version stamped internally, auto-restarts safely via `bash` after updates) and **zero automatic edits to `gamelist.xml`**.
  - High-resolution vinyl-disc scraper artwork bundled in `kplayer/scraper/` (transparent `1200×1200` Cover PNG, transparent `1600×490` Marquee PNG, `900×1200` Boxart, and `1920×1080` Fanart).
  - In-app **Auto-Updater** (`SELECT → [A] Verificar atualizações`) with live 0%–100% progress bar, SHA-256 verification, GitHub Releases fallback, one-time post-update Changelog screen, and full preservation of user playlists, favorites, history, weather, and settings.
- **Smart Weather Hero & Open-Meteo Weather App (`X`):**
  - Full Open-Meteo forecast app (IP auto-location or manual city search), large Home weather card (invertible layout), and weather-reactive Home greetings with playful activity suggestions when Weather is active (falls back to *"Seu som. Sua tela."* when off).

---

## Core Features

| Module | Highlights |
| :--- | :--- |
| **Music Player** | Local ID3 tags & embedded/sidecar cover art, synced **`.LRC`** & embedded lyrics, Queue & Folder panes, Favorites, Speed, Repeat, Shuffle, Sleep Timer, libVLC Equalizer, and **10-visualizer Screensaver**. |
| **Video Player** | Hardware-friendly libVLC playback, Aspect Ratio (`Original / Fill / Stretch`), Speed, Repeat, and auto-hiding OSD. |
| **File Manager (`Arquivos`)** | Full console root (`/`) access separate from Music & Videos: **PDF Reader** (compatible with `kaiaum01/PdfReader-R36s` / `PdfCraft R36S`), built-in **Text Editor** (`.txt`, `.xml`, `.html`, `.sh`, `.cfg`), launch R36S `.sh` game scripts & EmulationStation executables (with optional **Background Music/Radio Preview**), play videos/music/`.m3u8` playlists/radio files directly, mkdir/copy/move/paste/rename/delete, official **7-Zip** (`7zzs`) password-protected extraction, and live progress/speed/ETA. |
| **Online Radio** | Powered by the open **Radio-Browser** directory (Brazil, Popular, Pop, Rock, News, Favorites) + personal stations in `ports/kplayer/radios_usuario/`. |
| **IPTV + Live EPG** | Unlimited category-by-category **Canais** (with live Brazilian EPG), **Filmes**, **Séries** (full seasons/episodes), and **User IPTV** (on-screen virtual keyboard + `ports/kplayer/iptv_usuario/`). |
| **Brazil News (`Notícias`)** | Latest Portuguese headlines from Brazil (**Todas, Urgente, Mundo, Polícia, Entretenimento, Esportes**) via **NewsData.io** (configure `ports/kplayer/news.cfg` or `NEWSDATA_API_KEY`) with automatic live RSS fallback and full D-pad article reader. |
| **Placar da Bola** | Live, finished, and upcoming football scores across Brasileirão, Libertadores, Champions League, Premier League & more, with **Stats**, **Events**, and **Lineups**. |
| **Weather (Open-Meteo)** | Press **`X`** on Home for current conditions, hourly/daily forecast, IP geolocation or manual city search, plus dynamic weather hero greetings. |

---

## Installation on R36S (dArkOS / PortMaster)

1. Download **`KPlayer-v2.1.4-R36S.zip`** from **[Releases](../../releases)**. *(Do not install the GitHub source archive.)*
2. Extract it and copy **`KPlayer.sh`** and the **`kplayer/`** directory to `/roms/ports/` (or `/roms2/ports/` on SD2).
3. Add your media to the dedicated folders (fast boot — ROMs/BIOS/saves are never scanned):

| Media Type | SD1 Path | SD2 Path | Recognized Formats |
| :--- | :--- | :--- | :--- |
| **Music (+ `.lrc`)** | `/roms/bgmusic` | `/roms2/bgmusic` | MP3, FLAC, OGG, WAV, M4A, AAC, OPUS |
| **Videos** | `/roms/videos` | `/roms2/videos` | MP4, MKV, AVI, MOV, WEBM |
| **User Radio** | `ports/kplayer/radios_usuario/` | — | `.pls`, `.m3u`, `.m3u8`, `.asx` |
| **User IPTV** | `ports/kplayer/iptv_usuario/` | — | `.m3u`, `.m3u8`, `.txt` (or URL via on-screen keyboard) |

4. Launch **Ports → KPlayer** on your R36S.
5. For future releases, update directly inside the app via **`SELECT → [A] Verificar atualizações`**.

> **Requirements:** ARM64 R36S running dArkOS with PortMaster, SDL2, ALSA, and compatible VLC plugins in `/usr/lib/aarch64-linux-gnu/vlc/plugins`. See [docs/INSTALL.md](docs/INSTALL.md) for full details.

---

## Main Controls

| Button | Action |
| :---: | :--- |
| **D-pad** | Navigate menus, switch tabs, pick language/theme, or seek ±10s |
| **B** | Confirm / Open / Play / Match details |
| **A** | Back / Cancel |
| **X** | Weather on Home · Queue/Folder in Music · Filter in Football/IPTV · Favorite Radio · Toggle Lyrics in Screensaver |
| **Y** | Lyrics in Music · Refresh data · Toggle Clock/Weather in Screensaver · Terms on Welcome |
| **L1 / R1** | Previous / next track, video, radio station, or live Visualizer in Screensaver |
| **START** | Pause / Resume playback |
| **SELECT** | Open / Close contextual Settings |

See [docs/CONTROLS.md](docs/CONTROLS.md) for the complete screen-by-screen control map.

---

## Transparency, Open Sources & Licenses

- **Public Aggregators & User Freedom:** All IPTV and Online Radio listings come from public internet aggregators or open sources (such as **Radio-Browser**). KPlayer acts strictly as a media player, hosts no media content, displays a **Transparency Notice** before streaming sections, and lets you add your own links/playlists anytime. Read **[TERMS.md](TERMS.md)**.
- **Build & Packaging:** See [docs/BUILD.md](docs/BUILD.md) and [PUBLICAR_NO_GITHUB.md](PUBLICAR_NO_GITHUB.md).
- **License:** Original KPlayer code is licensed under **GPL-2.0-or-later** ([LICENSE](LICENSE)). VLC/libVLC, SDL2, stb, and bundled fonts retain their licenses in [THIRD_PARTY.md](THIRD_PARTY.md) and `ports/kplayer/licencas/`.
- Independent project — not affiliated with VideoLAN, PortMaster, Open-Meteo, or SofaScore.
