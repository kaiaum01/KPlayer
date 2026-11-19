# KPlayer — visual moderno (R36S)

Esta é a versão do código do KPlayer para R36S com o mesmo visual do player web:
fundo com brilho suave na cor do tema, cartões arredondados com brilho no item
selecionado, disco de vinil animado, barras de som, botão de tocar em destaque e
tela inicial com "Seu som. Sua tela." e cartão "Tocando agora".

Os controles, telas, botões e funções não mudaram. Os 7 temas continuam
funcionando e todas as cores vêm do tema escolhido.

## O que mudou no código

- `source/modern.h` (novo): brilhos, degradês, vinil, pulso da rádio, barras de
  som e botão de tocar. Usa apenas as funções SDL2 já carregadas em `dynamic.h`.
- `kplayer.c`: inclui `modern.h`; opções, tela de atualização e carregamento
  com o novo visual.
- `skin.h`: cabeçalho, tela inicial, biblioteca, música, barra de progresso e rodapé.
- `transport.h`, `radio.h`, `iptv.h`, `football.h`, `onboarding.h`, `youtube.h`:
  cartões, abas e botões no novo estilo.
- `i18n.h`: textos novos da tela inicial em inglês e espanhol.
- `visual-moderno.patch`: todas as mudanças em relação ao código original.

## Como compilar

Igual ao projeto original (GitHub Actions). O arquivo novo `modern.h` fica na
mesma pasta de `kplayer.c`. Nenhuma biblioteca nova é necessária.

Para conferir as telas num computador com SDL2, sem o VLC:

    ./kplayer --preview inicio.bmp
    ./kplayer --preview-audio musica.bmp
    ./kplayer --preview-radio radio.bmp
    ./kplayer --preview-options opcoes.bmp 0 4   (último número = tema 0 a 6)

## Fontes (opcional)

As prévias usam a fonte Manrope (licença livre SIL OFL, em
`extras/fontes-modernas/`). Para o mesmo visual no console, copie
`Interface.ttf` e `Bold.ttf` para `ports/kplayer/fonts/` (faça backup das suas
antes). Se mantiver suas fontes atuais, tudo funciona igual.

## Ainda não testado

- Não foi testado no R36S. As telas foram geradas num computador com o modo
  `--preview` do próprio KPlayer.
- As barras de som são animadas pelo estado de reprodução: a libVLC não fornece
  o espectro do áudio.
- O brilho e o vinil desenham mais linhas por quadro. Se a tela ficar lenta no
  aparelho, avise para trocar por versões em imagem pré-desenhada.

Licença: GPL-2.0-or-later, como o projeto original (veja LICENSE).
