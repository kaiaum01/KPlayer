# Atualizador experimental — R36S

Ao abrir, o aplicativo consulta a release estável mais recente de
kaiaum01/KPLAYER-v1.0.0. Se houver uma versão mais nova compatível, a tela
pergunta se deseja atualizar; escolha com o direcional e confirme com B. Ao
aceitar, o KPlayer instala e o novo lançador reinicia o aplicativo. Ao recusar
ou falhar a consulta, o app continua normalmente. A opção Atualização no menu
também permite verificar manualmente; após a instalação manual pelo menu,
reinicie o aplicativo. Rádios, músicas e preferências não são substituídas.

Requer Python 3 com módulos padrão, TLS e acesso HTTPS ao GitHub no R36S.
O pacote de atualização deve ter tag vX.Y.Z, arquivos KPlayer-vX.Y.Z-R36S.zip
e .zip.sha256 e manifesto compatível gerado pelo package_release.py. Para cada
versão futura o workflow de release usa a tag numérica para definir a versão
do pacote; a versão exibida no aplicativo deve ser revisada pelo mantenedor.
Rascunhos e pré-releases não
são considerados pelo endpoint releases/latest.

Somente o executável, o arquivo gptk, as duas fontes e as duas bibliotecas
incluídas na lista de atualização são substituídos. O inicializador, o próprio
atualizador, arquivos novos e outros recursos não são atualizados: versões que
precisarem deles exigem instalação manual. Não publique uma release incompatível
como se pudesse ser atualizada por este mecanismo.

Em caso de exceção durante a substituição, tenta restaurar os arquivos alterados.
Backups ficam em .kplayer-backup-* dentro de ports; não são removidos
automaticamente. Faça backup próprio antes de testar. O novo lançador tenta
restaurar uma atualização interrompida antes de iniciar; a recuperação após
corte real de energia ainda não foi testada no R36S. SHA-256 verifica integridade, mas não é uma assinatura;
a segurança também depende de HTTPS e da conta/repositório do mantenedor.

Testado localmente com arquivos simulados no Linux x86-64. O workflow ARM64 e
o funcionamento da atualização no R36S ainda precisam de testes reais; teste
primeiro em um cartão de cópia. Sem conexão ou sem release compatível, o menu
pode apresentar erro e o log tem detalhes. Não compartilhe dados privados do log.
