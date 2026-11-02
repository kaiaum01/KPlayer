# KPlayer PC 1.0.4 — experimental

Edição independente para Windows 64 bits, inspirada no KPlayer R36S. Não substitui nem altera a versão PortMaster. Este projeto cria um executável pela aba Actions do GitHub. Não contém um executável pré-compilado.

## Recursos implementados

- Abrir áudio e vídeo locais usando o mecanismo do VLC incluído no pacote portátil.
- IPTV: baixar a lista pública [Free-TV/IPTV](https://github.com/Free-TV/IPTV), mantê-la em cache, pesquisar canais e abrir fluxos HTTP/HTTPS. A primeira carga requer internet. Alguns links podem exigir DRM, bloqueio regional ou recursos não suportados.
- Importar manualmente uma lista M3U/M3U8 de links diretos (a lista importada permanece apenas durante a execução).
- Catálogo experimental Rei dos Canais: escolha a fonte na lista. Entradas marcadas WEB não têm fluxo direto reconhecido e não são reproduzidas. A API real e os canais ainda não foram testados. Nenhum EPG, logo ou resolução de iframe é implementado.
- Reproduzir/pausar e parar; interface em português.

Esta primeira versão para Windows não reproduz todas as funções da edição R36S: ainda não inclui biblioteca de músicas, rádio dedicada, capas, letras, favoritos, temas, atualizador automático nem traduções. Também não faz resolução de páginas, autenticação, DRM ou EPG.

## Usar no Windows

1. No GitHub, envie o conteúdo deste projeto para um repositório e abra **Actions → Compilar KPlayer PC para Windows → Run workflow**.
2. Quando terminar, abra a execução e baixe o artefato **KPlayer-PC-Windows-x64-Portable**.
3. Extraia **todos os arquivos**, mantendo a pasta `vlc` junto a `KPlayer-PC.exe`, e execute o programa. Não é necessário instalar o VLC separadamente.
4. Clique em **Abrir arquivo** ou dê duplo clique em um canal. Use **Importar lista IPTV** para a sua própria lista.

O Windows pode mostrar um alerta por o executável ser novo e não assinado. A disponibilidade de cada canal depende de terceiros. O catálogo é salvo em `%LOCALAPPDATA%\KPlayerPC`; ele pode conter URLs de terceiros. Não compartilhe listas com senhas ou tokens.

## Desenvolvimento

Python 3.11 x64, `pip install -r requirements.txt` e `python kplayer_pc.py`. Para execução pelo código, coloque o VLC 3.0.23 Windows x64 na pasta `vlc` ao lado do script. Testes: `python -m unittest discover -s tests -p test_playlists.py -v`. O Actions baixa a versão oficial 3.0.23 da VideoLAN, valida o SHA-256 e inclui o diretório completo com os avisos e licenças. O VLC mantém licenças próprias; a compilação e o aplicativo precisam ser testados no Windows antes de distribuição como estáveis.

Código desta edição distribuído sob GPL-2.0 ou posterior, conforme o arquivo LICENSE. A dependência python-vlc é licenciada sob LGPL-2.1 ou posterior; consulte seus avisos antes de redistribuir.

Fontes dos componentes distribuídos: [VLC 3.0.23](https://get.videolan.org/vlc/3.0.23/) e [python-vlc 3.0.21203](https://pypi.org/project/python-vlc/3.0.21203/#files). A pasta `vlc` incluída contém os avisos da distribuição VideoLAN. Preserve as licenças e os direitos dos autores ao redistribuir.
