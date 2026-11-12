"""Instruções para pedir a arte da moldura ao Claude pelo claude.ai (assinatura da equipe, sem API paga).

O botão "Copiar instruções para o Claude" copia este texto já com as medidas da moldura escolhida e as cores da
paleta. O Claude entrega um SVG nas medidas da folha; ele entra por "Importar arte" e, como a página tem a proporção
da folha, cada forma fica exatamente onde foi desenhada (molduras_padroes.importar_arte)."""


def instrucoes(g, cores, segmento):
    fw, fh = g['folha']['largura'], g['folha']['altura']
    s, j, ic = g['sangria'], g['janela'], g['logoIC']
    n = lambda v: f'{round(v, 3):g}'  # 68 em vez de 68.0, 3.115 em vez de 3.1150000001
    paleta = ', '.join(f'{papel} {hexa}' for papel, hexa in cores.items())
    return f"""Você desenha artes para molduras de TV impressas da Indoor Channel (mídia em supermercados, padarias,
farmácias e outros comércios). A moldura é uma placa recortada que fica em volta da tela da TV.

Entregue a arte como um arquivo SVG para download, chamado moldura.svg, com uma frase curta sobre o que você desenhou.
Responda em português.

Regras do SVG (siga todas, ele vai direto para a impressão):
- Abra com <svg xmlns="http://www.w3.org/2000/svg" width="{n(fw)}cm" height="{n(fh)}cm" viewBox="0 0 {n(fw)} {n(fh)}">.
  As unidades são centímetros da folha.
- Comece com um retângulo de fundo cobrindo a folha inteira.
- Só formas preenchidas: path, rect, circle, ellipse, polygon, com fill em hexadecimal (#RRGGBB).
  Nada de stroke, text, image, gradiente, filtro, máscara, clipPath, opacidade ou transform.
- A área impressa vai de x={n(s['x0'])} a {n(s['x1'])} e de y={n(s['y0'])} a {n(s['y1'])}; o que passar disso é cortado.
- A tela da TV ocupa o retângulo x={n(j['x0'])} a {n(j['x1'])}, y={n(j['y0'])} a {n(j['y1'])}: ela fica coberta por um branco,
  então concentre o desenho na borda em volta (faixas de {n(g['borda'])} cm nas laterais e no topo, e a aba de baixo).
- O canto x={n(ic['x0'])} a {n(ic['x0'] + ic['largura'])}, y={n(ic['y0'])} a {n(ic['y0'] + ic['altura'])} recebe a logo da Indoor
  Channel: deixe essa área calma (sem detalhes miúdos).
- Use as cores da paleta do cliente ({paleta}) e, se precisar, branco. Outras cores só se eu pedir.
- Formas grandes e bem legíveis a 2 m de distância; no máximo umas 150 formas.
Ramo do cliente: {segmento or 'não informado'}.
Quando eu pedir um ajuste, entregue o SVG inteiro de novo com a mudança.

A arte que eu quero (descrição):
[descreva aqui: estilo, elementos, onde ficam, clima da loja]"""
