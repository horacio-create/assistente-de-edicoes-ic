# Histórico de versões

## 1.7.0 — 06/10/2026

- Vetorização MS6 ativa: logo em PNG, JPG, WebP, BMP, TIFF, PDF, AI ou SVG vira contornos fechados para gravação a laser (Cloudray CRS335-5F).
- Separação automática do fundo pela cor das bordas (Otsu), com sensibilidade manual, inversão, redução de ruído de JPG, suavidade das curvas e remoção de detalhes em mm.
- Largura final em mm medida na arte, sem margens; altura proporcional. Prévia de gravação, contornos e original.
- DXF R12 com POLYLINE fechadas em mm, camada GRAVACAO, centralizado na origem e com extensões corretas. Um arquivo existente nunca é substituído.
- Aviso de traços com menos de 0,1 mm e de excesso de contornos.
- Suporte ao macOS: Instalar.command, Iniciar.command, seletor de pastas do Finder e acesso por NOME.local.
- Novas dependências: numpy, potracer e ezdxf. 45 testes Python e cinco JavaScript aprovados no macOS.

## 1.6.2 — 05/10/2026

- PDFs rasterizados com fundo branco opaco.
- Cinza de 16 bits reduzido para 8 bits antes da conversão.
- Remoção do endpoint de listagem de pastas.
- Exportação libera o lock global durante renderização e gravação; revisão revalidada antes de publicar.
- Arquivos novos publicados completos, sem sobrescrever chegadas tardias, com alternativa segura no Windows.
- Host validado contra nomes e endereços locais conhecidos.
- Campo portable e aviso ao fechar sessão com mídias; lançador C/MinGW e build Windows, com detecção do fechamento pelo lockfile.
- 35 testes Python e cinco JavaScript aprovados. Validação manual completa do portátil pendente. Otimização opcional de prévias adiada.

## 1.6.0 — 05/10/2026

- Versão atual sempre visível no rodapé da barra lateral.
- Desfazer ajustes com Ctrl+Z e refazer com Ctrl+Shift+Z ou Ctrl+Y. Arrastes e digitação contínua de um valor contam como uma ação. Aplicar ajustes ao lote também pode ser desfeito em uma ação.
- Numeração dos arquivos no padrão VT 1, VT 2…
- Check verde de conclusão durante três segundos após exportar todos os arquivos com sucesso.

## 1.5

Base web anterior à criação do executável portátil, com formatos de tela, edição individual, logo, ordenação de miniaturas, exportação e histórico.

## 1.6.1 — 05/10/2026

- Seletor nativo de pasta associado à janela em primeiro plano, evitando que fique atrás do navegador.
