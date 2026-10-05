# Assistente de Edições IC

Aplicação de padronização de imagens da Indoor Channel, com interface web local e janela própria portátil para Windows 64 bits.

## Executar no navegador

Requer Python 3.12. No Windows, abra `Instalar.bat` e depois `Iniciar.bat`. Acesse http://localhost:8080 no Chrome ou Edge. Colegas na mesma rede podem acessar http://NOME-DO-PC:8080.

## Executar em janela própria

Após preparar o ambiente, instale as dependências adicionais:

```powershell
.venv/Scripts/python.exe -m pip install -r requirements-desktop.txt
.venv/Scripts/python.exe portable.py
```

## Gerar a versão portátil

```powershell
./Empacotar-Desktop.ps1
```

O pacote sai em `dist/Assistente de Edicoes`. Conserve toda a pasta, incluindo `_internal`. A execução direta em compartilhamentos de rede não foi validada; use uma pasta local e exporte para a rede.

## Dados e originais

A pasta `dados` é criada ao usar o sistema e contém mídias importadas, edições e histórico. Ela não faz parte do repositório. Os originais não são alterados. Faça backup dessa pasta para transportar as edições.

## Testes

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -q
```

## Recursos

Presets horizontal, vertical, personalizado e tamanho da mídia; lote com miniaturas reordenáveis; zoom e posicionamento; logo sobreposta; importação JPG, PNG, WebP, BMP, TIFF e páginas PDF; JPG/PNG; histórico e edições recentes. Os módulos de vídeo, ofertas, logo EAP e vetorização estão planejados e ainda não implementados.

A versão web usa Python, Pillow, PyMuPDF, Waitress e SQLite. A versão desktop usa PySide6/Qt WebEngine. Este código ainda não foi adaptado nem publicado para hospedagem na nuvem.

Os testes existentes cobrem processamento e preservação dos arquivos. Há uma mitigação para a retomada da janela em segundo plano; a resolução do travamento intermitente ainda depende de confirmação no uso real.

Veja `LEIA-ME.md` e `VALIDACAO.md` para detalhes de uso e verificação. Logos e identidade visual pertencem à Indoor Channel.
