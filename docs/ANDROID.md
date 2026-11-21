# KPlayer Android v2.0.2 (Edição Retrato — Lado a Lado)

> **[English documentation below](#kplayer-android-v202-portrait-edition--side-by-side)**

O **KPlayer Android** é a edição nativa para smartphones Android (API 26–35 / Android 8.0+) desenvolvida **lado a lado** com a edição principal de **R36S (dArkOS / PortMaster)**. Ele preserva **100% das funções do KPlayer v2.0.2**, mas com um design moderno em **modo retrato**, sem as limitações de tela 640×480 ou ausência de toque do console portátil.

---

## O que o KPlayer Android v2.0.2 oferece

- **Interface Moderna em Modo Retrato (Jetpack Compose + Material 3):** navegação ergonômica na zona do polegar com 5 abas (`Início`, `Música`, `IPTV`, `Rádio`, `Placar`), barra **Mini-Player flutuante** persistente acima da navegação e tela cheia **Now Playing** com gesto/botão de recolher.
- **Motor Nativo Media3 (ExoPlayer) + Equalizador de Hardware:** suporte a MP3, FLAC, OGG, WAV, M4A, AAC, OPUS, MP4, MKV, WEBM, HLS (`.m3u8`) e streams de Rádio/IPTV com `OkHttpDataSource`, controle de velocidade (`0.75x` a `1.5x`), modo **Aleatório**, **Repetir (Desligado / Todos / Uma)**, **Timer de Sono** e **Equalizador de 5 bandas** com 6 presets sincronizados com o R36S (`Desligado`, `Pop`, `Rock`, `Graves`, `Voz`, `Clássico`).
- **Letras Sincronizadas (`.LRC`) com Toque para Pular:** lê automaticamente arquivos `.lrc` na mesma pasta da música e permite tocar em qualquer verso para pular direto para o instante exato da faixa.
- **Vídeos Locais em Tela Cheia:** varredura automática via `MediaStore` com player nativo `PlayerView` (HLS/MP4/MKV) e controles de toque.
- **IPTV Desbloqueado por Categoria + IPTV do Usuário:**
  - **Canais de TV:** 245 canais completos em 12 categorias (`catalogo.txt` + reservas `canais.txt`), carregamento sob demanda categoria por categoria e troca de fontes de reserva.
  - **Filmes & Séries:** catálogo completo por categorias, busca instantânea, temporadas e todos os episódios sob demanda.
  - **IPTV do Usuário:** digite ou cole links `.m3u` / `.m3u8` diretamente pelo teclado nativo do Android ou importe arquivos `.m3u` / `.m3u8` / `.txt` do aparelho.
- **Rádio Online (Radio-Browser):** filtros por `Brasil`, `Populares`, `Pop`, `Rock`, `Notícias` e `Favoritas`, com failover automático entre servidores públicos do Radio-Browser.
- **Placar da Bola (Ao Vivo):** jogos de futebol ao vivo, encerrados e futuros com filtros (`Todos`, `Ao vivo`, `Brasil`, `Europa`) e detalhes completos da partida (**Estatísticas**, **Eventos** e **Escalações**).
- **Tela de Aviso de Transparência & Termos de Uso:** idêntica em compromisso ao R36S — exibida antes de entrar em **IPTV** ou **Rádio Online**, informando que os catálogos públicos vêm de agregadores/fontes abertas e reafirmando o direito do usuário de inserir seus próprios links e playlists.
- **7 Temas ao Vivo + 3 Idiomas:** os mesmos 7 temas (*Verde Spotify*, *Noite Azul*, *Claro Menta*, *Claro Quente*, *Vermelho Neon*, *Roxo Synth* e *Âmbar Retrô*) em **Português (BR)**, **English** e **Español**.

---

## Comparativo: R36S (Principal) × Android (Retrato)

| Recurso | KPlayer R36S (Edição Principal) | KPlayer Android (Lado a Lado) |
| :--- | :--- | :--- |
| **Stack / Motor** | C + SDL2 + libVLC (ARM64) | Kotlin + Jetpack Compose + Media3 (ExoPlayer) |
| **Orientação / Tela** | Paisagem fixa 640×480 (D-Pad / Botões) | Retrato responsivo edge-to-edge (Toque + Gestos) |
| **Descoberta de Mídias** | Pastas dedicadas (`/roms/bgmusic`, `/roms/videos`) | `MediaStore` nativo do Android (Áudio + Vídeo + `.lrc`) |
| **Player de Música** | 3 painéis + letras `.LRC` + fila + EQ | Mini-player flutuante + Now Playing tela cheia + toque na letra + EQ + velocidade |
| **IPTV & Rádio** | 245 canais + Filmes + Séries + teclado virtual | 245 canais + Filmes + Séries + teclado nativo + importação `.m3u` |
| **Placar da Bola** | Jogos ao vivo + Estatísticas/Eventos/Escalações | Jogos ao vivo + folha de detalhes (Estatísticas/Eventos/Escalações) |
| **Transparência & Termos** | Aviso prévio + Termos em 4 páginas | Aviso prévio + Termos em 4 páginas |
| **Empacotamento** | `KPlayer-v2.0.2-R36S.zip` | `KPlayer-v2.0.2-Android.apk` |

---

## Instalação do APK no Android

1. Baixe **`KPlayer-v2.0.2-Android.apk`** na aba **[Releases](../../releases)** (ou nos artefatos do workflow **Compilar KPlayer Android (APK)** em **Actions**).
2. No smartphone Android (8.0 ou superior), abra o arquivo `.apk` e autorize *"Instalar apps desconhecidos"* para o navegador ou gerenciador de arquivos.
3. Ao abrir o KPlayer, conceda a permissão de leitura de Áudio e Vídeos para carregar sua biblioteca local automaticamente.

---

## Compilação Local e GitHub Actions

### Via GitHub Actions (automático)
- **Workflow dedicado:** `.github/workflows/android-build.yml` compila o APK sempre que houver alterações em `android/**` (ou manualmente via *Run workflow*) e publica `KPlayer-v2.0.2-Android.apk` + `.sha256` como artefato.
- **Release unificada:** ao publicar uma tag `v*.*.*`, o workflow `.github/workflows/release-r36s.yml` compila **R36S (Principal)** e **Android (Retrato)** em paralelo e anexa ambos os instaladores lado a lado na mesma GitHub Release.

### Compilar localmente (Android Studio ou CLI)

Requisitos: **JDK 17**, **Android SDK (API 35)** e **Gradle 8.10.2** (ou Android Studio Ladybug+).

```bash
cd android
gradle assembleRelease --no-daemon
```

O APK gerado fica em:
`android/app/build/outputs/apk/release/app-release.apk`

---

# KPlayer Android v2.0.2 (Portrait Edition — Side-by-Side)

**KPlayer Android** is the native portrait smartphone edition (Android 8.0+ / API 26–35) maintained **side-by-side** with the primary **R36S (dArkOS / PortMaster)** edition. It delivers full feature parity with KPlayer v2.0.2 while adopting a modern portrait touch interface free of 640×480 handheld constraints.

## Highlights
- **Modern Portrait UI (Kotlin + Jetpack Compose + Material 3):** Thumb-zone 5-tab navigation (`Home`, `Music`, `IPTV`, `Radio`, `Scores`), persistent floating **Mini-Player**, and full-screen **Now Playing** sheet.
- **Native Media3 (ExoPlayer) + Hardware 5-Band Equalizer:** Local music & video (`MediaStore`), tap-to-seek synced `.LRC` lyrics, playback speed (`0.75x–1.5x`), shuffle/repeat, sleep timer, and all 6 EQ presets.
- **Unlocked IPTV (245 TV Channels · Movies · Series · User IPTV), Online Radio (Radio-Browser), and Placar da Bola Live Match Center** with full **Transparency Notice** and 4-page **Terms of Use**.
- **All 7 Color Themes & 3 Languages** synchronized with the R36S edition.

## Building Locally
```bash
cd android
gradle assembleRelease --no-daemon
```
Output: `android/app/build/outputs/apk/release/app-release.apk` (also built automatically by `.github/workflows/android-build.yml` and attached alongside `KPlayer-v2.0.2-R36S.zip` on every `v*.*.*` release tag).
