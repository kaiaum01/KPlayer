# Atualização ao abrir — experimental

Na abertura, o KPlayer consulta a última release pública. Se houver uma versão
mais recente compatível, aparece a pergunta de atualização. O padrão é **Não**;
use o direcional e B para confirmar. Ao escolher Sim, aguarde a instalação e o
reinício automático. Se não houver atualização ou a consulta falhar (inclusive
sem internet), o aplicativo continua normalmente. Se a instalação falhar, B
continua; os detalhes são registrados em `ports/kplayer/log.txt`.

O primeiro uso da função exige instalar manualmente esta versão do KPlayer e seu
lançador `.sh`: uma instalação antiga não consegue se atualizar sozinha. Para
evitar duas entradas no menu, remova manualmente somente o antigo `KPlayer (Beta).sh`
após instalar e conferir o novo `KPlayer.sh`; preserve a pasta `kplayer`.
Para
disponibilizar uma versão posterior, crie e envie uma tag sem sufixos, como
`v1.0.1`, depois publique a release rascunho gerada pelo Actions. Ela deve conter
os dois arquivos `KPlayer-v1.0.1-R36S.zip` e `KPlayer-v1.0.1-R36S.zip.sha256`.
Uma execução manual cria um artefato para teste, não uma release publicada.

Exige Python 3 e acesso HTTPS ao GitHub no dispositivo. O instalador valida o
checksum e preserva arquivos pessoais; ele troca apenas os arquivos listados no
manifesto. O checksum não é uma assinatura digital. O novo lançador tenta a
recuperação após interrupção; queda real de energia ainda não foi testada no
aparelho. Teste em uma cópia do cartão SD.
O lançador e o próprio atualizador não são substituídos automaticamente.
