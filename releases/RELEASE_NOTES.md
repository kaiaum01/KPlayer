# KPlayer v2.0.4 — Clima Open-Meteo, Tela Limpa & Auto-Release

Central de mídia portátil para **R36S (Principal — dArkOS / PortMaster)** em C + SDL2 + libVLC (adaptativo à tela do dispositivo, ARM64) e edição **Android (Lado a Lado — Adaptativo)** em Kotlin + Jetpack Compose + Media3.

---

## Novidades da v2.0.4

### Aplicativo de Clima Integrado (Open-Meteo) + Widget na Tela Inicial
- **Localização e Clima no canto direito da tela inicial:** ao lado do título **"Seu som. Sua tela."**, o KPlayer exibe um widget compacto com a temperatura atual, condição do tempo e sua cidade.
- **Interface completa de Clima no botão `X`:** ao pressionar `X` na tela inicial (ou clicar no widget de clima), abre uma interface dedicada estilo aplicativo de clima alimentada pela API aberta **Open-Meteo** — com temperatura atual, sensação térmica, umidade, vento, pressão, índice UV, nascer/pôr do sol, previsão hora a hora (12h) e previsão para os próximos 7 dias.
- **Privacidade e escolha primeiro:** antes de buscar o clima, o KPlayer pergunta se você deseja **usar a localização automática pelo IP** ou **pesquisar sua cidade manualmente**, e permite trocar essa preferência a qualquer momento em **Opções → Clima e Localização**.

### Visual Mais Limpo & Novo Menu de Opções (`SELECT`)
- **Barra inferior removida:** mais área útil em todas as telas para capas, listas, vídeos, canais e previsão do tempo.
- **Lista de Atalhos dentro das Opções:** todos os controles do R36S e teclas de atalho do teclado agora ficam reunidos em **Opções → Atalhos**.
- **Menu de Opções em ordem alfabética (sem abas laterais):** navegação vertical direta (`↑ ↓` + `B`), com todas as configurações ordenadas de A–Z, **Verificar atualizações** (indicado por `A`) em penúltimo e **Sair** por último.

### Auto-Update + GitHub Releases Automáticas
- **Publicação automática a cada commit na `main`:** o workflow compila R36S (`.zip` + `.sha256`) e Android (`.apk` + `.sha256`), atualiza a pasta `updates/` (`updates/latest.json` e `updates/v2.0.4/`) e **publica/atualiza automaticamente a GitHub Release** com as modificações da versão.
- **Atualização sem perda de dados:** mantém favoritos, histórico de reprodução, listas IPTV/Rádio do usuário, clima, idioma e tema, reiniciando automaticamente após atualizar.

### IPTV Brasil 2026 + Guia de Programação ao Vivo (EPG)
- **Canais verificados integrados:** lista `Ramys/Iptv-Brasil-2026` (`Canais.m3u8`) verificada e mesclada junto ao catálogo Saimo TV (**326 canais únicos em 15 categorias** e **200 canais com links reserva/fallback**).
- **EPG ao vivo:** programação atual e próxima exibição nos canais brasileiros.

---

## Como Instalar ou Atualizar

### Atualização Automática (Recomendado)
1. Abra o KPlayer em qualquer versão anterior (`v2.0.3`+).
2. Quando o aviso aparecer na barra superior, pressione **`SELECT` → `A` Verificar atualizações** e confirme para baixar da pasta `updates/` e reiniciar sem perder seus dados.

### Instalação Manual — R36S (Edição Principal)
1. Baixe **`KPlayer-v2.0.4-R36S.zip`** nos anexos desta release.
2. Extraia e copie para `/roms/ports/` (ou `/roms2/ports/` no SD2): `KPlayer.sh`, pasta `kplayer/`, `images/KPlayer-image.png` e `gamelist.xml`.
3. Abra **Ports → KPlayer v2.0.4** no R36S.

### Instalação Manual — Android (Edição Adaptativa)
1. Baixe **`KPlayer-v2.0.4-Android.apk`** nos anexos desta release (Android 8.0+ / API 26+).
2. Instale o APK no dispositivo e conceda a permissão de mídia local.
