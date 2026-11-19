# KPlayer v2.0.0 — R36S / dArkOS

Central de mídia portátil para **R36S (dArkOS / PortMaster)** em C + SDL2 + libVLC (640×480, ARM64).

---

## Novidades da v2.0.0

### Tela de Boot Animada (Splash Screen)
- Nova tela de carregamento animada exibida toda vez que o KPlayer liga, com vinil giratório, anéis de sonar, faíscas orbitais, equalizador de 28 barras, barra de progresso com brilho e chips de status.
- Pré-carrega a biblioteca de mídias, rádios, IPTV e jogos do Placar da Bola na abertura, removendo telas de carregamento lentas ao navegar dentro do app.

### Tela de Boas-Vindas Slim e Animada
- Visual enxuto e animado alinhado à tela de boot, sem os 3 blocos gigantes antigos, sem a caixa `B Iniciar KPlayer` e sem barra inferior.
- **Seletor unificado de idioma** (`Português (BR)`, `English`, `Español`) e **seletor de cores do tema em bolinhas** com troca ao vivo dos 7 temas.

### Placar da Bola (estilo SofaScore)
- Substituiu o player experimental de YouTube pelo **Placar da Bola**, com jogos ao vivo, encerrados e futuros (**Brasileirão, Libertadores, Champions League, Premier League** e outras ligas).
- Filtros rápidos (`Todos`, `Ao vivo`, `Brasil`, `Europa`) e **Central da Partida** completa com 3 abas:
  - **Estatísticas:** posse de bola, finalizações, chutes no gol, escanteios, precisão de passe e faltas com barras comparativas.
  - **Eventos:** gols, cartões e substituições minuto a minuto.
  - **Escalações:** titulares e formações das equipes.

### Player de Música Revisado
- Barra central de controles (anterior / play-pause / próxima) perfeitamente centralizada acima da barra de progresso.
- Ícones ajustados e mais nítidos, suporte completo a capas embutidas/externas, metadados técnicos e letras sincronizadas (`.lrc`).

### Pastas Dedicadas (Carregamento Leve e Rápido)
Para não sobrecarregar o R36S varrendo pastas de ROMs, BIOS e saves, o KPlayer v2.0.0 carrega **exclusivamente**:
- **Músicas (somente áudio):** `/roms/bgmusic` (SD1) e `/roms2/bgmusic` (SD2)
- **Vídeos (somente vídeo):** `/roms/videos` (SD1) e `/roms2/videos` (SD2)

### Capa do Port e Metadados XML para dArkOS / EmulationStation
O pacote **`KPlayer-v2.0.0-R36S.zip`** já traz tudo pronto para o KPlayer aparecer bonito no menu **Ports** do R36S:
- `images/KPlayer-image.png` (640×480 PNG — também em `kplayer/cover.png`)
- `gamelist.xml` pronto para copiar direto para `/roms/ports/`
- `kplayer/KPlayer-metadata.xml` (bloco `<game>...</game>` avulso para colar no seu `gamelist.xml` caso já tenha outros ports)

---

## Como Instalar no R36S

1. Baixe **`KPlayer-v2.0.0-R36S.zip`** nos anexos desta release.
2. Extraia e copie para `/roms/ports/` (ou `/roms2/ports/` no SD2):
   - `KPlayer.sh`
   - pasta `kplayer/`
   - `images/KPlayer-image.png`
   - `gamelist.xml` *(ou mescle `kplayer/KPlayer-metadata.xml` no seu `gamelist.xml` atual)*
3. Coloque suas músicas em `/roms/bgmusic` (ou `/roms2/bgmusic`) e vídeos em `/roms/videos` (ou `/roms2/videos`).
4. Abra **Ports → KPlayer v2.0.0** no R36S.

> **Importante:** Faça backup de `settings.cfg`, `preferences.cfg`, `favorites.cfg` e `radio-favorites.tsv` antes de atualizar uma instalação anterior.

---

## Verificação de Integridade (SHA-256)

| Arquivo | Tamanho | SHA-256 |
| :--- | :---: | :--- |
| `KPlayer-v2.0.0-R36S.zip` | 6.7 MB (`7.011.063 bytes`) | `7733a29cf0ca3c226ffd7f2e94218eaf69446162390f3ca5430788fea1045b0b` |

---

## English Summary

**KPlayer v2.0.0 for R36S / dArkOS (PortMaster):**
- Animated boot splash screen with upfront library, radio, IPTV, and football preloading.
- Redesigned slim animated welcome screen with unified language capsule and live 7-color theme dots.
- **Placar da Bola** (SofaScore-style live football scores, match stats, minute-by-minute events, and lineups).
- Re-centered music transport bar and sharpened icons.
- Dedicated fast-loading media folders: `/roms/bgmusic` & `/roms2/bgmusic` (audio only), `/roms/videos` & `/roms2/videos` (video only).
- Bundled 640×480 dArkOS port cover (`images/KPlayer-image.png`), `gamelist.xml`, and mergeable `kplayer/KPlayer-metadata.xml`.
