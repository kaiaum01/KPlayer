# Revisão prioritária — trabalho parcial

Este pacote 1.0.3 parte da versão de desenvolvimento, não de uma instalação
extraída do console nem necessariamente do último commit do GitHub.

## Alterações

- Músicas locais solicitam velocidade 1.0 ao libVLC ao abrir. A velocidade
  escolhida permanece guardada para vídeos e alterá-la durante áudio não
  acelera a faixa atual. O resultado real depende do motor VLC.
- A busca de arquivos processa eventos entre entradas. A cancela a busca e
  preserva os resultados parciais. Uma chamada bloqueada do sistema de arquivos
  ainda pode atrasar o cancelamento; não há varredura em segundo plano nem cache.
- Localização aproximada por IP começa desativada, inclusive ao migrar
  configurações antigas sem essa opção. Pode ser ativada em Opções e é gravada
  em `settings.cfg`. Ao ativá-la, a consulta usa HTTP sem criptografia e revela
  o IP ao provedor; uma consulta já iniciada não é interrompida ao desativar.
- O `.gitignore` inclui BMPs e downloads temporários. Ele não remove arquivos
  já rastreados no Git. Nada foi apagado do repositório do usuário.
- Telas sem vídeo usam aproximadamente 10 quadros/s; vídeo ativo permanece
  em 30. A economia real deve ser medida no aparelho.
- O workflow de compilação testa interface e metadados com ASAN/UBSAN no host.
- Repetição desligada, da faixa ou da fila e modo aleatório para música nas
  Opções. A seleção manual de faixa reinicia o ciclo aleatório; L1 volta de modo
  sequencial. As preferências são salvas em settings.cfg.
- Tela Minhas favoritas em Opções: procura músicas marcadas nas raízes da busca
  automática, com os mesmos limites de tamanho e quantidade. Favoritos usam
  identificadores de caminho; mover um arquivo pode perder a marcação.
- Arquivos M3U/M3U8 locais podem ser abertos em Arquivos, filtro Todos. Aceitam
  caminhos absolutos ou relativos para músicas, não URLs nem listas aninhadas.
- Retomar mídia em Opções guarda a última posição em resume.cfg e solicita
  buscar esse ponto quando o arquivo estiver disponível. A fila anterior não é
  reconstruída; a retomada ainda exige teste de reprodução com libVLC no R36S.
- Timer de sono para a reprodução (não desliga a tela/aparelho), e equalizador
  com presets da libVLC quando disponíveis. Esses ajustes não são persistentes.
- Rádio: exibe `NowPlaying` quando fornecido e tenta até três reconexões com
  esperas progressivas após falha ou término. Selecionar outra estação cancela
  a espera; uma chamada libVLC bloqueada pode continuar atrasando a troca.
  A transmissão, metadados e recuperação ainda exigem teste de rede no R36S.
- Categoria Favoritas na rádio; X adiciona ou remove a estação selecionada.
  Nomes e URLs são guardados em `radio-favorites.tsv`; streams podem mudar.
- `source/version.h` define a versão do binário e do pacote; o empacotador
  rejeita tags que não correspondam a ela. As instalações antigas precisam de
  atualização manual do lançador e atualizador para receber alterações neles.
- Na consulta e na instalação, A solicita cancelamento e o subprocesso recebe
  SIGTERM; há solicitação de cancelamento após 90 segundos. Se possível, o
  instalador restaura os arquivos e a versão anterior quando recebe o sinal.
  Não há encerramento forçado que interrompa uma restauração.
- Antes da troca dos arquivos, é preparado um backup e um registro da operação.
  Se a operação não for concluída, o novo lançador tenta restaurar o backup
  antes de executar o binário. Uma falha na recuperação impede a inicialização
  e mantém o registro e o backup para análise. Os testes simulam a morte do
  processo; corte real de energia, sistema de arquivos e hardware não foram
  testados. O suporte a fsync no cartão/firmware pode afetar a operação.

## Ainda não implementado

Validação no aparelho da recuperação do atualizador, limite de backups,
atualização do lançador/updater, cache do índice,
identificação de favoritos após mover arquivos, apagar a tela, restauração da
fila anterior, equalizador com bandas ajustáveis e outros
ajustes de rádio. O atualizador continua experimental;
não use como versão final sem testar recuperação e compatibilidade no aparelho.

Testes no computador não substituem compilar no Actions e validar no R36S.
