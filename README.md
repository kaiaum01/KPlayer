# KPlayer PC 1.0.4 — experimental

Edição independente para Windows 64 bits, inspirada no KPlayer R36S. Não substitui nem altera a versão PortMaster. Este projeto cria um executável pela aba Actions do GitHub. Não contém um executável pré-compilado.

## Recursos implementados

- Abrir áudio e vídeo locais usando o mecanismo do VLC instalado no computador.
- IPTV: baixar a lista pública [Free-TV/IPTV](https://github.com/Free-TV/IPTV), mantê-la em cache, pesquisar canais e abrir fluxos HTTP/HTTPS. A primeira carga requer internet. Alguns links podem exigir DRM, bloqueio regional ou recursos não suportados.
- Importar manualmente uma lista M3U/M3U8 de links diretos (a lista importada permanece apenas durante a execução).
- Reproduzir/pausar e parar; interface em português.

Esta primeira versão para Windows não reproduz todas as funções da edição R36S: ainda não inclui biblioteca de músicas, rádio dedicada, capas, letras, favoritos, temas, atualizador automático nem traduções. Também não faz resolução de páginas, autenticação, DRM ou EPG.

## Usar no Windows

1. Instale o **VLC oficial de 64 bits** (VideoLAN) no caminho padrão. O VLC não está incluído no executável.
2. No GitHub, envie o conteúdo deste projeto para um repositório e abra **Actions → Compilar KPlayer PC para Windows → Run workflow**.
3. Quando terminar, abra a execução e baixe o artefato **KPlayer-PC-Windows-x64**. Extraia o arquivo e execute `KPlayer-PC.exe`.
4. Clique em **Abrir arquivo** ou dê duplo clique em um canal. Use **Importar lista IPTV** para a sua própria lista.

O Windows pode mostrar um alerta por o executável ser novo e não assinado. A disponibilidade de cada canal depende de terceiros. O catálogo é salvo em `%LOCALAPPDATA%\KPlayerPC`; ele pode conter URLs de terceiros. Não compartilhe listas com senhas ou tokens.

## Desenvolvimento

Python 3.11 x64, `pip install -r requirements.txt` e `python kplayer_pc.py`. Testes: `python -m unittest discover -s tests -v`. A integração usa `python-vlc`; o VLC instalado separadamente possui licença própria. A build do Actions e o aplicativo precisam ser testados no Windows real antes de distribuição como estáveis.

Código desta edição distribuído sob GPL-2.0 ou posterior, conforme o arquivo LICENSE. A dependência python-vlc é licenciada sob LGPL-2.1 ou posterior; consulte seus avisos antes de redistribuir.
