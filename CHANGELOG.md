# Changelog

## v2.0.3 — Adaptive R36S & Android Displays, CI Sanitizer Hardening & Cross-Device Scaling

- **Adaptive R36S Display & Viewport Scaling (Native C/SDL2 + Web):** Upgraded the primary R36S edition (`source/kplayer.c`) to detect the user's actual screen resolution via `SDL_GetDesktopDisplayMode` / `SDL_GetRendererOutputSize`, use `SDL_WINDOW_FULLSCREEN_DESKTOP` + `SDL_RenderSetLogicalSize(renderer, W, H)` with smooth linear filtering, and adapt `format_video()` decode resolution dynamically up to `1920×1080` while preserving crisp aspect ratios on 640×480 handhelds, 720p/1080p screens, and external displays. Updated the web R36S stage with a responsive adaptive viewport (`Auto`, `4:3`, `1:1`, `16:9`) powered by CSS container queries (`@container`).
- **Adaptive Android Edition (Portrait, Landscape, Foldables & Tablets):** Unlocked `fullUser` orientation and resizable multi-window support in `android/` (`AndroidManifest.xml`, `MainActivity.kt`, `AndroidScreens.kt`) with dynamic `BoxWithConstraints` layout breakpoints — compact bottom navigation on portrait phones (`< 600dp`), adaptive left Navigation Rail on landscape phones/foldables (`>= 600dp`) and expanded rail on tablets (`>= 840dp`), responsive 1/2/3-column `LazyVerticalGrid` catalogs, and a 2-pane Now Playing screen with vinyl + controls on the left and live `.LRC` lyrics/queue/EQ on the right. Upgraded the web Android preview to fill the user's device adaptively with `Auto` / `Celular` / `Paisagem` / `Tablet` modes.
- **Native Sanitizer & Compiler Hardening:** Fixed `-Wformat-truncation` in `source/iptv.h` via bounded string copy (`iptv_copy_str`), hardened `tests/test_native.c` automatic media discovery test state reset (`favorites_view`, `clear_cached_media`, `media_preloaded`), and added `tests/**` trigger paths to `.github/workflows/r36s-build.yml`.
- **Version Bump to `2.0.3`:** Updated native `KPLAYER_VERSION`, Android `versionCode` (`203`) & `versionName` (`2.0.3`), web UI badges, Express server endpoints/User-Agents, EmulationStation XML metadata, `banner.svg`, release notes, and documentation to `v2.0.3`.

## v2.0.2 — Transparency Notice, Full 245-Channel TV Catalog, User IPTV & Android Portrait Edition

- **Native Android Portrait Edition (`android/` — Side-by-Side with R36S):** Added a complete modern portrait Android app built with Kotlin, Jetpack Compose, Material 3, and Media3 (ExoPlayer) alongside the primary R36S edition — featuring floating Mini-Player, full-screen Now Playing with tap-to-seek `.LRC` lyrics, 5-band hardware Equalizer, playback speed, sleep timer, `MediaStore` local music & video scanning, unlocked 245-channel Live TV + Movies + Series + User IPTV, Online Radio, Placar da Bola match center, Transparency Notice, all 7 color themes, and 3 languages. Added `.github/workflows/android-build.yml` and updated `.github/workflows/release-r36s.yml` to build and attach `KPlayer-v2.0.2-Android.apk` side-by-side with `KPlayer-v2.0.2-R36S.zip`, plus a live side-by-side switcher (`R36S (Principal)` | `Android (Retrato)` | `Lado a Lado`) in the web preview.
- **In-App Transparency Notice Screen (`Aviso de Transparência`):** Added a dedicated notice screen displayed before entering **IPTV** or **Online Radio** (in the native R36S C/SDL2 app, native Android app, and web preview), clearly declaring that all IPTV and Radio listings come from public internet aggregators or open sources, that KPlayer hosts no content, and that users always have the right to add their own links/playlists.
- **Terms of Use & Documentation (`TERMS.md`, `docs/ANDROID.md` + 4-Page In-App Terms):** Added bilingual `TERMS.md`, `docs/ANDROID.md`, and expanded the in-app Terms of Use to 4 pages (PT-BR / EN / ES) explicitly documenting open-source/aggregator data provenance and user freedom to insert custom links (`iptv_usuario/` + on-screen/native keyboard, `radios_usuario/`).
- **Full 245-Channel Live TV Catalog:** Fixed live TV loading to parse `catalogo.txt` (244 channels across 11 categories: Esportes, Filmes e Séries, TV Aberta, Variedades, Infantil, Documentários, 24 Horas, Notícias, PPV, Músicas, Séries) merged with `canais.txt` reserve sources (totaling **245 channels** across 12 categories), with automatic multi-mirror fallback and trusted CDN `Referer`/`User-Agent` header forwarding in the proxy.
- **Version Bump to `2.0.2`:** Updated native `KPLAYER_VERSION`, Android `versionName`, web UI badges, package metadata, `banner.svg`, release notes, and documentation to `v2.0.2`.

## v2.0.0 — R36S / dArkOS Major Release

- **Animated Boot Splash Screen:** Added an animated startup splash (spinning vinyl, sonar rings, orbiting glowing sparks, 28-bar equalizer, progress bar with shimmer, and module status chips) that runs on every boot and preloads media, radio, IPTV, and Placar da Bola upfront so internal navigation is instant.
- **Slim Animated Welcome Screen:** Redesigned the first-run onboarding screen to match the boot splash animation with a compact unified language selector (PT-BR / English / Español) and live theme color dots ("bolinhas") for all 7 themes; removed the oversized 3-card grid, `B Iniciar KPlayer` button box, and bottom bar.
- **Placar da Bola (SofaScore-style Match Center):** Replaced the experimental YouTube player with **Placar da Bola**, featuring live/finished/scheduled football matches, category filters (`Todos`, `Ao vivo`, `Brasil`, `Europa`), and a 3-tab Match Detail screen (**Estatísticas** with comparison bars, **Eventos** timeline, and **Escalações**).
- **Music Player Alignment & Icon Polish:** Re-centered the middle transport controls (previous / white play-pause circle / next) directly above the progress bar and sharpened playback/category icons across native C/SDL2 and the web preview.
- **Dedicated Fast-Loading Media Folders:** Replaced full-SD recursive scanning with dedicated media-type roots (`/roms/bgmusic` and `/roms2/bgmusic` for audio only; `/roms/videos` and `/roms2/videos` for video only) with capped recursion depth to keep R36S startup fast and lightweight.
- **IPTV — Unlimited Category-by-Category (`Canais`, `Filmes`, `Séries`, `IPTV do Usuário`):** Removed all artificial channel/movie/episode caps, added lazy on-demand category loading across ~30,000+ movies and ~13,000+ series (with full season & episode browsing from `https://filmes-saimo.pages.dev/` and live channels from `https://canais-saimo.pages.dev/`), and added **IPTV do Usuário** supporting both an on-screen virtual keyboard for `.m3u`/`.m3u8` URLs and local playlist files in `ports/kplayer/iptv_usuario/`.
- **Auto-Updater Removed:** Completely removed the experimental startup/settings auto-updater (`updater.py`, exit-42 restart loop, and update option) for faster, cleaner boots on R36S.
- **dArkOS / EmulationStation Port Artwork & XML Metadata:** Bundled custom 640×480 cover artwork (`images/KPlayer-image.png` and `kplayer/cover.png`), ready-to-use `gamelist.xml`, and mergeable `kplayer/KPlayer-metadata.xml` inside `KPlayer-v2.0.0-R36S.zip`.
- **Updated Documentation & Screenshots:** Regenerated all 640×480 screenshots, `docs/images/banner.svg`, bilingual READMEs, controls, media docs, and unit tests for v2.0.0.

## 1.0.0 — release candidate for R36S

- Added seven selectable color themes with persistent settings.
- Added an indeterminate media scanning indicator and file count.
- Improved radio catalog refresh and moved stream changes off the UI thread;
  a test on R36S was reported successful, but indefinite blocking remains possible.
- Added user radio playlists and seven supplied station examples.
- Updated documentation, demo screenshots and the ARM64 build artifact name.
- Automatic updates are not implemented. The ARM64 1.0.0 build, themes and
  loading indicator still require device validation.

## v0.7.1-beta

- Reworked the audio information card with format, size, duration, sample rate,
  channel count and bitrate obtained from the file and libVLC tracks.
- Changed the lower audio card to show the next queued track instead of
  duplicating the current song and cover.
- Redesigned Online Radio with a dedicated player on the left and a selectable
  station list on the right.
- Added refreshed native screenshots for both redesigned players.

## v0.7.0-beta

- Added Online Radio powered by the open Radio Browser directory.
- Added controller-friendly Brazil, Popular, Pop, Rock and News filters.
- Added asynchronous station loading with server failover and bounded parsing.
- Added direct radio stream playback through libVLC using resolved station URLs.
- Added station name, genre, country, codec and bitrate to the native radio UI.
- Expanded the dashboard to include a dedicated Online Radio card.

## v0.6.3-beta

- Combined the duplicated music control rows into one larger bottom bar, with playback shown only once and named shortcuts beside graphical button markers.
- Added asynchronous IP-based city/state and time-zone detection through ip-api.com.
- Added automatic fallback to the console clock whenever the location request is unavailable.
- Added bounded HTTP and JSON handling without API keys or extra runtime libraries.

## v0.6.1-beta

- Replaced the music player's text-heavy bottom shortcuts with native SDL icons.
- Added compact controller-button markers for A, B, X, Y, START, L1/R1 and SELECT.
- Added dedicated lyrics, queue, folder, back, play/pause, track navigation and settings symbols.

## v0.6.0-beta

- Added recursive automatic media discovery in `midias`, `/roms` and `/roms2`, with a 50 KB minimum file size and a 4096-item bound.
- Swapped the console actions: B confirms/opens and A goes back/cancels.
- Changed SELECT to open or close Settings and added an explicit “Exit KPlayer” action there.
- Removed software volume settings, shortcuts, UI labels and libVLC volume calls; volume is left to the console firmware.
- Preserved manual folder browsing, local metadata, lyrics, queue/folder panes and the three-column music transport.

## v0.5.1-beta

- Added the requested three-column bottom music bar: mini cover and metadata, geometric previous/play/next controls, white play/pause circle, progress handle, format badge and actual file size.
- Added file sizes to music browser entries using stat.
- Y opens Lyrics; X opens Queue and switches Queue/Folder. Favorite marking moved to Settings.
- Added front.jpg/front.png sidecar covers and retained synchronized/external/embedded lyrics.
- Adapted the supplied design to the existing native API, without introducing an SDL_ttf dependency.


## v0.5.0-beta — KPlayer (Beta)

- Reorganized the audio screen with an aligned cover/metadata card, switchable right pane and one transport bar.
- Added Lyrics / Queue / Folder switching with X and folder browsing without changing the current queue.
- Added bounded local ID3 metadata reading, embedded JPEG/PNG covers and embedded timed/plain lyrics.
- Preserved valid local tags when libVLC falls back to the filename.
- Updated the music controls: L2/R2 changes volume; START pauses from any pane.
- Prepared the public repository, bilingual documentation, original illustrative previews and install release asset.

**Status:** ARM64 build and local functional/rendering checks; physical R36S validation still pending. This release packages application version 0.5.0 as a beta.

## v0.4.0

- First-run welcome screen and native app identity.
- Persistent PT-BR / English / Spanish choice and translated interface.
- Usage notices accessible before starting and from settings.
- Larger interface fonts and updated layout spacing.

## v0.3.1

- Added storage selection for local media, `/roms`, `/roms2` and `/`.
- Added readable directory symlink support and unavailable-storage messages.

## v0.3.0

- Adapted the supplied simulator design to the native dashboard, audio, video and file-browser screens.
- Added external LRC lyrics, sidecar covers, metadata display and an independent playback queue.

## v0.2.0

- Native C/SDL2 frontend for the target ARM64 system.
- Rebuilt VLC 3.0.23 core and libVLC, application identity changes and Debian t64 module ABI alignment.
