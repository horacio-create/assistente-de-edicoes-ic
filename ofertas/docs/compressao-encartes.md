# Compressão de encartes PDF

Na etapa 1, a opção “Comprimir PDF automaticamente” vem ativada. Após o envio,
o módulo prepara uma cópia sem dados privados de edição/metadata e sem objetos
inutilizados. Não converte páginas em imagem nem reduz resolução. Todas as páginas
são comparadas em aparência, texto, posições e objetos de imagem. Só adota uma
cópia menor que passe na conferência; caso contrário continua com o original.

PDF até 200 MB e 20 páginas por arquivo, aproveitando o limite de 200 MB já
existente no Waitress e a folga de 210 MB no proxy. As demais rotas mantêm 100 MB.
É possível desativar a preparação para a próxima importação. Arquivos já
importados não são alterados. O resultado aparece com tamanhos e percentual;
“Baixar PDF compactado” só aparece quando houve redução. O download verifica o
dono do encarte. Original e informações de preparação ficam no diretório privado
de dados, sem novas colunas no banco, e acompanham a exclusão do encarte.

Validação nas cópias locais de CAPA/VERSO de 09 a 12.10: 582581 → 317522 bytes e
809885 → 543795 bytes. Dados e PNGs extraídos antes/depois idênticos. Esse teste
verifica preservação. O perfil de leitura com selos vermelhos foi corrigido
separadamente em `modules/ofertas/encarte_selos.py`: agora identifica 15 ofertas
na capa e 30 no verso, com 90 preços conferidos, sem misturar selos nas fotos.

Testes: `python -m unittest tests.test_ofertas tests.test_pdf_preparacao`.
Executar em processo novo; o teste de integração configura um banco temporário
antes de importar o módulo de armazenamento.
