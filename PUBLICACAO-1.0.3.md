# Preparar a versão 1.0.3

Este é o código-fonte para o GitHub Actions, não um instalador já compilado.
No GitHub Desktop, faça backup e copie o conteúdo extraído para a raiz do
repositório existente. Confirme que `.github/workflows/` foi incluído, revise
as alterações, faça commit e envie com Push. Não inclua suas mídias, listas
ou configurações pessoais.

Execute **Compilar KPlayer R36S**, baixe o artefato e teste o pacote no console.
Após os testes, crie a tag `v1.0.3` no commit testado. O workflow de release
prepara um rascunho, que deve conter `KPlayer-v1.0.3-R36S.zip` e o arquivo
`.sha256` correspondente. Confira e publique manualmente a release estável.

`source/version.h` é a fonte da versão. O empacotador recusa tags diferentes da
versão do código. Para a próxima versão, altere esse arquivo e crie uma tag
correspondente. A atualização ainda não troca o próprio atualizador nem o
lançador: a primeira instalação desses componentes deve ser manual. Faça
backup antes e teste primeiro numa cópia do cartão SD.
