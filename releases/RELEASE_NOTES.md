# KPlayer v2.0.6 — Edição R36S (Novo Layout Inicial, Tutorial de Comandos, Opções Contextuais e Pesquisa Digitando)

Central de mídia portátil nativa para **R36S (dArkOS / PortMaster)** escrita em **C + SDL2 + libVLC ARM64**, adaptativa à resolução do dispositivo.

---

## Novidades da v2.0.6 (R36S Nativo)

- **Nova Tela Inicial com Layout Invertível:**
  - **Clima Open-Meteo ampliado** ocupando o card maior na parte inferior da tela inicial, exibindo temperatura atual, condição, sensação térmica, umidade, vento, máxima/mínima e resumo das próximas horas.
  - **Mini Player compacto** no topo direito ao lado de **"Seu som. Sua tela."**, mostrando de forma limpa apenas o que está sendo reproduzido no momento.
  - Opção **Layout da tela inicial** nas Configurações gerais (`Clima embaixo + Mini player` ou `Player embaixo + Clima no topo`) salva localmente.
- **Tutorial de Comandos na Primeira Inicialização + "Rever comandos":**
  - Os antigos "Atalhos" agora se chamam **Comandos** e aparecem automaticamente em formato de tutorial visual na primeira vez que o KPlayer inicia.
  - Pode ser consultado novamente a qualquer momento em **`SELECT` → Rever comandos**.
- **Menus de Opções (`SELECT`) Estritamente Contextuais:**
  - **Opções de Vídeo** aparecem somente dentro do player de vídeo (áudio, legenda, proporção, zoom, velocidade, rotação, brilho, repetir).
  - **Opções de Músicas** aparecem somente dentro do player de músicas (repetir, aleatório, equalizador, velocidade, letras sincronizadas, favoritos).
  - **Opções de TV / IPTV** aparecem somente na aba de IPTV (pesquisar digitando, alternar fonte, atualizar lista, adicionar link M3U).
  - **Opções de Rádio** aparecem somente na aba de Rádio (alternar filtro, favoritar estação, atualizar estações).
  - **Opções Gerais** mantidas em ordem alfabética (A–Z) com **`[A] Verificar atualizações`** em penúltimo e **`Sair`** por último.
- **Melhor Aproveitamento da Tela e Fontes Maiores:**
  - **Gerenciador de Arquivos / Vídeos**, **Placar da Bola**, **IPTV** e **Rádio** ampliados até o rodapé útil (sem barra inferior) com cartões mais altos e tipografia maior para leitura confortável no R36S.
- **Pesquisa Digitando em Canais de TV, Séries, Filmes e Vídeos:**
  - Pressione **`L1`** (ou acesse pelas opções da tela) para abrir o teclado na tela e filtrar rapidamente canais de TV, filmes, séries, episódios e vídeos/arquivos locais, com **`R1`** para limpar o filtro.
- **Auto-Updater contínuo (v2.0.6 → v2.0.7+):**
  - Verifica automaticamente `updates/latest.json` no boot com aviso discreto na barra superior, validação SHA-256 e atualização segura sem perder dados ou histórico.

---

## Como Instalar ou Atualizar no R36S

### Atualização Automática (Recomendado)
1. Abra o KPlayer no R36S conectado ao Wi-Fi.
2. Quando o aviso aparecer na barra superior, pressione **`SELECT` → `[A] Verificar atualizações` → `Baixar e atualizar (sem perder dados)`**.
3. O KPlayer baixa da pasta `updates/` do GitHub, valida o SHA-256, preserva seus dados/histórico e reinicia automaticamente.

### Instalação Manual — R36S (dArkOS / PortMaster)
1. Baixe **`KPlayer-v2.0.6-R36S.zip`** nos anexos desta release.
2. Extraia e copie para `/roms/ports/` (ou `/roms2/ports/` no SD2): `KPlayer.sh`, pasta `kplayer/`, `images/KPlayer-image.png` e `gamelist.xml`.
3. Abra **Ports → KPlayer v2.0.6** no R36S.
