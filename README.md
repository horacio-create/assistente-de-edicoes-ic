# Assistente de Edições IC — versão web V1.5

Aplicação web local de padronização de imagens da Indoor Channel. Esta é a última versão web anterior à criação do executável portátil.

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
- Exportação JPG/PNG, nomes VT1, VT2… seguindo a ordem das miniaturas.
- Histórico e edições recentes.

Vídeo, ofertas de supermercados, logo EAP e vetorização são módulos futuros.

## Dados

Imagens importadas, edições e histórico ficam na pasta `dados`, criada ao usar o sistema e excluída do Git. Os originais não são alterados. Preserve uma cópia dessa pasta para transportar as edições.

## Testes

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -q
```

A V1.5 tem 23 testes automatizados. Veja `LEIA-ME.md` e `VALIDACAO.md` para instruções e verificações.

## Arquitetura

Interface HTML/CSS/JavaScript, servidor Python com Waitress, processamento Pillow/PyMuPDF e histórico SQLite. Esta versão é executada pelo navegador e ainda não foi adaptada para hospedagem em nuvem.

As logos e a identidade visual pertencem à Indoor Channel.
