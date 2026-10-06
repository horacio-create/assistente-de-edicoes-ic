# Assistente de Edições — versão web V1.8.0

Aplicação web local de padronização de imagens da Indoor Channel. Esta versão continua a base web V1.5 anterior ao executável portátil.

## Executar no Windows

1. Instale Python 3.12 ou superior com o Python Launcher.
2. Abra `Instalar.bat` para preparar o ambiente.
3. Abra `Iniciar.bat` e mantenha a janela aberta.
4. Acesse http://localhost:8080 pelo Chrome ou Edge.

Colegas na mesma rede acessam http://NOME-DO-PC:8080. O computador que hospeda a aplicação precisa ficar ligado. A pasta de exportação pode ser local ou compartilhada.

## Recursos

- Formatos horizontal 1280×720, vertical 720×1280, personalizado e tamanho da mídia.
- Upload múltiplo, miniaturas, seleção por intervalo/retângulo e arraste para ordenar o lote.
- Zoom, rotação, reposicionamento com encaixe central, área segura e logo sobreposta.
- Mostrar tudo, Preencher tela e Criar fundo com cor predominante ou escolhida.
- JPG/JPEG, PNG, WebP, BMP, TIFF e páginas de PDF.
- Exportação JPG/PNG, nomes VT 1, VT 2… seguindo a ordem das miniaturas.
- Ctrl+Z para desfazer ajustes e Ctrl+Shift+Z ou Ctrl+Y para refazer.
- Versão no rodapé esquerdo e check verde por três segundos após exportação completa.
- Histórico e edições recentes.

- **Ofertas de supermercados:** VTs de oferta em MP4 a partir de templates, com formulário, prévia ao vivo, importação de encarte em PDF, biblioteca de imagens com remoção de fundo e fila de geração. Requer Node.js 20+; veja `ofertas/README.md`.

Vídeo, logo EAP e vetorização são módulos futuros.

## Dados

Imagens importadas, edições e histórico ficam na pasta `dados`, criada ao usar o sistema e excluída do Git. Os originais não são alterados. Preserve uma cópia dessa pasta para transportar as edições.

## Testes

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -q
node tests/test_undo.cjs
cd ofertas/motor && npm test   # contrato de templates de Ofertas
```

A V1.8.0 tem 63 testes Python e cinco testes JavaScript; o módulo Ofertas acrescenta 22 testes Python (os que dependem do motor são pulados sem Node.js), um teste do extrator com encartes reais conferidos (pulado sem `OFERTAS_ENCARTES`) e oito testes do contrato em `ofertas/motor`. Node.js é necessário para os testes JavaScript e para o módulo Ofertas. Veja `LEIA-ME.md` e `VALIDACAO.md` para instruções e verificações.

## Versão

`version.py` é a fonte única da versão exibida pela interface. Incremente `VERSION` a cada lançamento e registre as alterações em `CHANGELOG.md`.

## Arquitetura

Interface HTML/CSS/JavaScript, servidor Python com Waitress, processamento Pillow/PyMuPDF e histórico SQLite. Esta versão é executada pelo navegador e ainda não foi adaptada para hospedagem em nuvem.

As logos e a identidade visual pertencem à Indoor Channel.


## Executável portátil (validação pendente)

O código de empacotamento fica em `packaging/`. Consulte `packaging/LEIA-ME.md`. O executável único usa lançador C/MinGW, Python Windows embutido e Edge/Chrome em modo aplicativo com perfil temporário. Não usa PyInstaller. O fluxo completo e a remoção da pasta temporária ainda precisam ser confirmados em Windows real.
