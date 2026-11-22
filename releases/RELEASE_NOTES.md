# KPlayer v2.0.7 — Edição R36S (Changelog Pós-Atualização, Visualizador 30s Padrão e Clima Inteligente na Tela Inicial)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.0.7 (R36S Nativo)

- **Changelog Pós-Atualização (Exibido Apenas Uma Vez):**
  - Toda vez que o KPlayer for atualizado para uma nova versão, uma tela dedicada **"Novidades da versão vX.Y.Z"** aparece automaticamente antes da tela inicial resumindo o que mudou.
  - Ao pressionar **`B`** para continuar, a versão vista é salva localmente (`settings.cfg`) para não aparecer novamente até o próximo update — e cada novo pacote já embute automaticamente o `changelog.txt` da release.
- **Visualizador / Protetor de Tela em 30 Segundos Ativado por Padrão:**
  - O protetor de tela com os 5 visualizadores inspirados no Windows Media Player (**Barras e Ondas**, **Alquimia**, **Bateria / Pulso**, **Plenitude** e **Ambience / Cosmos**), relógio/data/clima e letras (`.LRC`) agora já vem **ativado por padrão com 30 segundos** ao reproduzir **Músicas ou Rádio Online**.
  - Pode ser ajustado ou desativado a qualquer momento em **`SELECT` → Protetor de tela** (`Desativado`, `30 segundos`, `60 segundos`, `2 minutos`, `5 minutos`).
- **Tela Inicial Inteligente com Saudação do Clima e Sugestões Aleatórias:**
  - Quando o **Clima Open-Meteo** estiver ativado, o cabeçalho da tela inicial (onde fica *"Seu som. Sua tela."*) se transforma automaticamente em uma saudação para o clima do momento (chuva, sol, noite estrelada, friozinho, calorzão, nublado, neblina, tempestade ou tempo gelado) acompanhada de uma **mensagem descontraída escolhida aleatoriamente** sugerindo ver um filme, série, rádio ou música.
  - Quando o Clima estiver **desligado / offline**, a tela inicial mantém exatamente o texto padrão (**"Seu som. Sua tela."** e *"Músicas, vídeos, rádios e TV ao vivo num player só."*).
- **Barra de Carregamento de Atualização em Tempo Real (0%–100%):**
  - Em **`SELECT` → `[A] Verificar atualizações`**, a barra de progresso mostra ao vivo cada etapa: verificação na pasta `updates/`, download em MB, validação SHA-256 e instalação preservando todos os seus dados, favoritos, histórico e configurações.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Quando o aviso aparecer na barra superior, pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. Acompanhe a barra de carregamento (0%–100%). Ao reiniciar, a tela de **Novidades da v2.0.7** aparecerá uma única vez antes da tela inicial.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.0.7-R36S.zip`** nos anexos desta release.
2. Extraia e copie para `/roms/ports/` (ou `/roms2/ports/` no SD2): `KPlayer.sh`, pasta `kplayer/`, `images/KPlayer-image.png` e `gamelist.xml`.
3. Abra **Ports → KPlayer v2.0.7** no R36S.
