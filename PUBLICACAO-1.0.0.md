# Publicação no GitHub e atualização do KPlayer

Este pacote é o **código-fonte**, não o instalador de R36S e não um repositório Git pronto. O atualizador é experimental; teste em uma cópia do cartão antes de publicar como estável.

## 1. Enviar os arquivos pelo GitHub Desktop

1. Faça backup do seu repositório local e clone ou abra nele `kaiaum01/KPLAYER-v1.0.0` pelo GitHub Desktop.
2. Extraia o ZIP em uma pasta separada. Copie o **conteúdo** da pasta extraída para a raiz do repositório, preservando a pasta `.git` existente. Confira alterações antes de substituir arquivos: um repositório pode conter mudanças suas mais recentes.
3. Confirme que a raiz tem `README.md`, `README.pt-BR.md`, `source/`, `ports/`, `docs/` e `.github/workflows/`. A pasta `.github` pode estar oculta no Windows; sem ela o Actions não recebe os workflows.
4. Se a versão anterior ainda contiver `ports/KPlayer (Beta).sh`, remova esse antigo arquivo do repositório para não manter dois lançadores. Não remova a pasta `ports/kplayer/`. Reveja mudanças no GitHub Desktop.
5. Faça o commit e clique em **Push origin**. Não inclua músicas privadas, logs, preferências, chaves ou senhas. O ZIP do código não inclui a pasta `.git`.

## 2. Compilar para testar

1. No GitHub abra **Actions → Compilar KPlayer R36S → Run workflow** e escolha a branch enviada. Habilite Actions se solicitado.
2. Espere o resultado verde e baixe o artefato `KPlayer-R36S-...` no final da execução. Dentro dele estão o ZIP instalável e o `.sha256`. Se der erro, abra a etapa vermelha e copie o log.
3. Extraia o ZIP instalável e copie `KPlayer.sh` e `kplayer/` para `ports/` em um cartão de teste. Preserve os dados pessoais da instalação anterior. Teste áudio, vídeo, rádio, idiomas, temas, navegação, controles e abertura sem internet.

O workflow de build padrão usa a versão 1.0.0 para um artefato de teste. Uma execução manual de workflow não publica automaticamente uma release.

## 3. Criar e publicar a primeira release

1. No GitHub, crie uma release com a tag `v1.0.0` apontando para o commit testado, usando **Save draft**. Enviar/criar essa tag inicia o workflow **KPlayer - Compilar e preparar release R36S**.
2. Aguarde o Actions gerar o ZIP e o checksum e preparar o rascunho da release. Abra o rascunho em **Releases** e confirme que contém `KPlayer-v1.0.0-R36S.zip` e `KPlayer-v1.0.0-R36S.zip.sha256`. Se já existia rascunho, confira os anexos com cuidado e acrescente-os manualmente a partir do artefato, se necessário.
3. Escreva as notas, informe limitações e publique com **Publish release** somente após os testes. Uma release em rascunho ou pré-release não é detectada como última release estável pelo atualizador.

## 4. Publicar atualizações futuras

1. Envie e teste o código atualizado. Crie uma tag nova no formato numérico, por exemplo `v1.0.1`, no commit correspondente. Não reutilize a tag da versão já publicada.
2. O workflow de release usa a tag para nomear o ZIP e o checksum e criar um rascunho; confirme que os arquivos são `KPlayer-v1.0.1-R36S.zip` e `KPlayer-v1.0.1-R36S.zip.sha256`, que o manifesto corresponde à tag e que o app inicia no aparelho.
3. Publique a release como estável. Depois, um aparelho com o novo atualizador instalado e internet pode detectar a versão mais recente. Uma versão igual ou inferior à instalada não gera uma oferta.

Cada pacote deve vir do workflow compatível deste projeto. O atualizador modifica somente arquivos previstos no manifesto e **não atualiza o próprio script nem o lançador**. O checksum não é assinatura. O novo lançador tenta restaurar uma atualização interrompida, mas a recuperação após corte real de energia ainda não foi testada no aparelho; preserve backups.

O GitHub pode limitar ações conforme permissões do repositório. Se o workflow não puder criar o rascunho, confira as permissões de Actions e anexe os arquivos do artefato manualmente; não compartilhe tokens ou credenciais.
