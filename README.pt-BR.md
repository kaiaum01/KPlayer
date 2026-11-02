# KPlayer 1.0.0

Um player de músicas, vídeos e rádios online para dispositivos portáteis, pensado para **R36S com dArkOS e PortMaster**. A interface é feita em C e SDL2, com reprodução baseada na libVLC, e foi desenhada para telas de 640 × 480 e botões físicos.

[English](README.md) · [Como instalar](docs/INSTALL.md) · [Controles](docs/CONTROLS.md) · [Mídias e letras](docs/MEDIA.md) · [Licenças e créditos](THIRD_PARTY.md) · [Publicar no GitHub](PUBLICACAO-1.0.0.md)

> **Estado do projeto:** versão 1.0.0 candidata, com atualização automática experimental. A correção anterior do rádio foi relatada como funcional no aparelho, mas este pacote, seus temas, indicador de carregamento e atualizador ainda precisam de teste físico. O código Android é experimental e não faz parte do port R36S.

## Prévia

Estas imagens foram renderizadas a partir das telas do programa em um computador, com informações demonstrativas; não são fotografias do console. A disponibilidade e o conteúdo das rádios podem mudar.

| Início | Música |
| :---: | :---: |
| ![Tela inicial do KPlayer](docs/images/readme-home.png) | ![Player de música](docs/images/readme-audio.png) |
| **Rádio online** | **Opções e temas** |
| ![Lista demonstrativa de rádios](docs/images/readme-radio.png) | ![Configurações do KPlayer](docs/images/readme-options.png) |
| **Vídeo** | **Biblioteca** |
| ![Controles de vídeo](docs/images/readme-video.png) | ![Navegação por arquivos](docs/images/readme-library.png) |

## O que o KPlayer oferece

- Reprodução local de músicas e vídeos, com codecs e plugins disponibilizados pelo sistema.
- Busca de mídias em `kplayer/midias`, `/roms` e `/roms2`, além de navegação por pastas e indicador de carregamento.
- Metadados, capa, fila, próxima faixa e letras locais `.lrc` ou embutidas quando suportadas. Não baixa letras da internet.
- Rádio online via Radio Browser e aba **Rádio do Usuário** para listas próprias.
- A rádio tenta reconectar até três vezes após falha ou término e mostra a música atual quando a emissora envia metadados compatíveis. A libVLC pode continuar bloqueada durante uma conexão; valide no aparelho.
- Sete temas, interface em português brasileiro, inglês e espanhol, tela de boas-vindas e termos de uso.
- Controles de reprodução, proporção e faixas de áudio/legendas quando disponíveis.
- Em Opções, selecione repetição desligada, da faixa ou da fila, e ative o modo aleatório para músicas. Sem repetir a fila, a reprodução para ao terminar o ciclo; L1 volta sequencialmente e R1 avança.
- Em Opções, marque a faixa atual em **Favoritar faixa** e abra **Minhas favoritas** para ver as músicas encontradas. A lista usa a busca automática e seus limites; mover um arquivo pode perder a marcação.
- Em Arquivos, filtro Todos, abra playlists M3U/M3U8 locais de músicas; caminhos podem ser absolutos ou relativos à playlist. Streams e listas aninhadas não são importados.
- Em Opções, **Retomar mídia** abre o último arquivo e tenta restaurar sua posição (não restaura a fila); o timer de sono para a reprodução e o equalizador oferece presets da libVLC quando disponíveis. Timer e preset não persistem após sair.
- Verificação experimental de atualização do GitHub ao iniciar, com confirmação antes da instalação.

## Requisitos

- R36S ARM64, firmware dArkOS compatível e PortMaster configurado. A compatibilidade com outros aparelhos/firmwares não foi garantida.
- SDL2, saída de áudio e plugins VLC compatíveis disponibilizados pelo sistema. O pacote inclui as bibliotecas do núcleo libVLC; os codecs/plugins não vêm todos nele.
- Internet para rádio e atualizações; `python3` com HTTPS para o atualizador. Logos de rádio podem depender de `curl` e suporte a JPEG/PNG.
- Espaço no cartão para o aplicativo, suas mídias e eventuais backups. Faça backup antes de instalar ou atualizar.

## Instalação rápida

1. Baixe o **ZIP instalável R36S** em [Releases](https://github.com/kaiaum01/KPLAYER-v1.0.0/releases), se já estiver publicado. O ZIP do código-fonte não é o instalador.
2. Extraia o pacote. Copie `KPlayer.sh` e a pasta `kplayer/` lado a lado para a pasta `ports/` do cartão. Se já existir uma instalação, preserve suas músicas, rádios pessoais e configurações.
3. No console, atualize a lista de ports se necessário e abra **KPlayer**.
4. Na primeira execução, escolha o idioma; os termos podem ser consultados na tela inicial.

Se a release ainda não existir, o mantenedor precisa compilar o projeto no Actions antes; veja [publicação](PUBLICACAO-1.0.0.md). Uma instalação antiga precisa receber manualmente o novo executável, `updater.py` e `KPlayer.sh` antes de poder usar a atualização automática. Quando o novo lançador funcionar, remova apenas o antigo `KPlayer (Beta).sh` para evitar uma entrada duplicada, preservando a pasta `kplayer/`.

## Controles principais

| Botão | Ação |
| --- | --- |
| Direcional | Navegar e mudar opções |
| B | Abrir ou confirmar |
| A | Voltar ou cancelar |
| SELECT | Abrir/fechar opções |
| START | Pausar ou continuar a mídia |
| X / Y | Funções conforme a tela, exibidas na interface |
| L1 / R1 | Faixa ou estação anterior / seguinte, conforme a tela |

O volume é ajustado pelos controles físicos/do sistema. Confira o [mapa completo](docs/CONTROLS.md), pois as ações variam por tela.

## Músicas, vídeos e rádios

Coloque arquivos em `ports/kplayer/midias/` ou navegue até suas pastas no cartão. A busca automática ignora arquivos menores que 50 KiB e limita os resultados a 4.096 entradas. O explorador manual pode mostrar arquivos menores. O acesso a `/roms` e `/roms2` depende de os caminhos existirem e estarem acessíveis no firmware.

O navegador reconhece extensões de áudio como MP3, FLAC, OGG, WAV, M4A, AAC e OPUS, e de vídeo como MP4, MKV, AVI, MOV e WEBM. **Reconhecer uma extensão não garante reprodução:** codec, perfil, resolução e desempenho dependem dos plugins VLC e do aparelho. Consulte [mídias e metadados](docs/MEDIA.md).

Para rádios próprias, coloque arquivos `.pls`, `.asx`, `.m3u` ou `.m3u8` em `ports/kplayer/radios_usuario/`. Em **Rádio Online**, escolha **Rádio do Usuário** com esquerda/direita e pressione **Y** para atualizar. São aceitos endereços HTTP/HTTPS encontrados nos arquivos, com limite de 64 KiB por lista; nem toda variante de playlist é suportada. Rádios incluídas são exemplos, não há garantia de disponibilidade.

## Atualização automática experimental

Ao abrir, o KPlayer consulta a última release pública. Se detectar um pacote mais novo compatível, pergunta se deseja atualizar. Escolher **Não**, não encontrar atualização ou falhar a consulta permite iniciar o app. Ao escolher **Sim**, aguarde a instalação e o reinício; em caso de falha, use B para continuar. O lançador e o próprio atualizador não são substituídos por esse mecanismo.

A atualização exige uma release pública compatível, com ZIP e checksum correspondentes. O checksum verifica integridade, mas **não é assinatura digital**. O novo lançador tenta recuperar a instalação após uma interrupção, mas a recuperação após queda real de energia ainda não foi testada no aparelho. Teste primeiro em uma cópia do cartão e leia [as limitações](ATUALIZADOR-EXPERIMENTAL.md) e [como publicar uma versão](PUBLICACAO-1.0.0.md).

## Privacidade e problemas

O catálogo e as transmissões de rádio acessam serviços de terceiros. A localização aproximada por IP começa desativada e pode ser ligada em Opções; quando ativa, envia o IP ao provedor via HTTP sem criptografia. Rádios podem usar HTTP ou HTTPS. Disponibilidade, privacidade e termos dependem dos provedores. Evite reproduzir conteúdo para o qual você não tenha autorização.

- **Não abre:** verifique PortMaster, permissões, plugins do sistema e `ports/kplayer/log.txt`.
- **Não encontra mídia:** confira os caminhos, a extensão, o limite de 50 KiB e tente a navegação manual.
- **Rádio não toca:** teste outra estação e sua conexão; streams podem ficar indisponíveis ou bloquear a reprodução.
- **Atualização não aparece:** precisa haver uma release pública mais nova com os arquivos compatíveis, Python 3 e internet. Rascunhos e pré-releases não são utilizados.
- **Interface parece parada ao pesquisar:** a busca é síncrona e o indicador pode parar enquanto o cartão responde.

Ao relatar um problema, informe firmware, aparelho, passos para reproduzir e o log após remover dados pessoais. Faça backup de `midias/`, `radios_usuario/`, `settings.cfg`, `preferences.cfg` e `favorites.cfg`.

## Compilação e licença

Veja [compilação](docs/BUILD.md), [contribuições](CONTRIBUTING.md), [histórico](CHANGELOG.md) e [publicação](PUBLICACAO-1.0.0.md). A interface original está sob **GPL-2.0-or-later**; leia [LICENSE](LICENSE). VLC/libVLC, SDL, stb e fontes têm seus próprios termos e avisos em [THIRD_PARTY.md](THIRD_PARTY.md) e `ports/kplayer/licencas/`. O código-fonte VLC e o patch estão em `upstream/` e `patches/`.

KPlayer não é afiliado nem endossado oficialmente por VideoLAN ou PortMaster.
