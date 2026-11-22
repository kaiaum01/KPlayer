# KPlayer v2.0.5 — Edição R36S Completa (Updates v2.0.2–v2.0.5 + Reajustes Finos no Updater)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.0.5 (R36S Nativo)

### Todos os Updates (v2.0.2, v2.0.3 e v2.0.4) Integrados no Binário Nativo do R36S
- **Adaptação de tela automática (v2.0.2/v2.0.3):** detecta a resolução nativa do portátil (`Auto`, `Preencher tela` ou `Clássico 4:3`) com vídeo em tela cheia real.
- **Auto-Updater nativo no R36S com reajustes finos (v2.0.3 + v2.0.5):**
  - Verifica automaticamente a pasta `updates/latest.json` no GitHub ao iniciar o KPlayer (com quebra de cache CDN, tentativas automáticas e fallback direto para a GitHub Release).
  - Exibe aviso discreto na barra superior (`v2.0.6 • SEL`) sempre que houver nova versão disponível.
  - Valida integridade SHA-256 (incluindo fallback pelo arquivo `.sha256`), protege contra arquivos corrompidos/symlinks, preserva integralmente favoritos, histórico, listas `iptv_usuario/`, `radios_usuario/`, `midias/`, `weather.cfg`, `settings.cfg` e `update-repo.txt`, e reinicia o `KPlayer.sh` automaticamente (`exit 42`) já com a versão nova.
- **Barra inferior removida + Guia de Atalhos nas Opções (v2.0.4):** mais área útil em todas as telas do R36S (mantendo apenas notificações flutuantes temporárias) e tela dedicada **Opções → Atalhos** com todos os comandos do controle.
- **Novo Menu de Opções (`SELECT`) em ordem alfabética (v2.0.3 + v2.0.4):**
  - Sem abas horizontais laterais — navegação vertical por seleção direta (`↑ ↓` + `B`).
  - Itens principais em ordem A–Z (*Adaptação de tela*, *Atalhos*, *Biblioteca & Histórico*, *Clima e Localização*, *Idioma*, *Reprodução & Áudio*, *Tema*, *Termos de uso*, *Timer de sono*).
  - Em **penúltimo**, apenas **`[A]` Verificar atualizações**; por **último**, apenas **Sair**.
- **Aplicativo de Clima Open-Meteo nativo no botão `X` + Widget na Tela Inicial (v2.0.4):**
  - Widget compacto de localização e temperatura no canto direito ao lado de **"Seu som. Sua tela."**.
  - Pressionar **`X`** na tela inicial abre a interface nativa de Clima no R36S: pergunta primeiro se deseja **usar localização pelo IP** ou **pesquisar cidade manualmente** (com cidades brasileiras rápidas + teclado virtual na tela via Open-Meteo), exibindo temperatura, sensação térmica, umidade, vento, pressão, UV, nascer/pôr do sol, próximas 6 horas e próximos 5 dias.
- **IPTV Brasil 2026 + EPG ao vivo nativo (v2.0.3):** lista `Ramys/Iptv-Brasil-2026` mesclada com Saimo TV e guia de programação **AGORA / A SEGUIR** carregado em segundo plano na tela nativa de IPTV do R36S.
- **Build e Release 100% focados no R36S:** o fluxo automático no GitHub agora compila, testa e publica exclusivamente o pacote R36S (`updates/latest.json`, `updates/v2.0.5/` e GitHub Release automática) sem bloqueios por compilação Android.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Quando o aviso aparecer na barra superior, pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa da pasta `updates/` do GitHub, valida o SHA-256, preserva seus dados/histórico e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.0.5-R36S.zip`** nos anexos desta release.
2. Extraia e copie para `/roms/ports/` (ou `/roms2/ports/` no SD2): `KPlayer.sh`, pasta `kplayer/`, `images/KPlayer-image.png` e `gamelist.xml`.
3. Abra **Ports → KPlayer v2.0.5** no R36S.
