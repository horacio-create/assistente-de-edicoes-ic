"""Exportação do relatório mensal do Clockify: planilha (resumo, cortes e todos os registros) e PDF de uma a duas páginas."""
import io
from datetime import datetime
import pymupdf
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
NOTA_ETIQUETAS = 'Um registro pode ter várias etiquetas; seu tempo conta em cada uma, por isso a soma por etiqueta passa do total.'
NOTA_ALTERACOES = 'Alteração: tarefa com "alteração" na descrição ou numa etiqueta do Clockify.'


def titulo_mes(mes):
    ano, m = mes.split('-'); return f'{MESES[int(m) - 1]} de {ano}'


def horas(segundos):
    minutos = round(segundos / 60); return f'{minutos // 60}h{minutos % 60:02d}'


def local(iso):
    return datetime.fromisoformat(iso).astimezone().strftime('%d/%m/%Y %H:%M') if iso else ''


def excel(data):
    wb = Workbook()
    head = Font(bold=True, color='FFFFFF'); fill = PatternFill('solid', fgColor='20203C')

    def aba(ws, cabecalho, linhas, larguras):
        ws.append(cabecalho)
        for cell in ws[1]: cell.font, cell.fill = head, fill
        for linha in linhas: ws.append(linha)
        for i, w in enumerate(larguras, 1): ws.column_dimensions[get_column_letter(i)].width = w
        ws.freeze_panes = 'A2'

    t = data['totais']
    resumo = wb.active; resumo.title = 'Resumo'
    resumo.append([f'Relatório de atividades — {titulo_mes(data["mes"])}']); resumo['A1'].font = Font(bold=True, size=14)
    for linha in [['Fonte: Clockify' + (f' · dados de {local(data["atualizado"])}' if data.get('atualizado') else '')], [],
                  ['Horas registradas', round(t['segundos'] / 3600, 2)], ['Tarefas', t['tarefas']], ['Registros de tempo', t['registros']],
                  ['Alterações', t['alteracoes']], ['Colaboradores', t['colaboradores']], ['Cronômetros ainda ligados', t['emAndamento']],
                  [], [NOTA_ETIQUETAS], [NOTA_ALTERACOES]]:
        resumo.append(linha)
    resumo.column_dimensions['A'].width = 34; resumo.column_dimensions['B'].width = 14

    def corte(nome, itens, rotulo):
        aba(wb.create_sheet(nome), [rotulo, 'Horas', 'Tarefas', 'Alterações', 'Registros'],
            [[x['nome'], round(x['segundos'] / 3600, 2), x['tarefas'], x['alteracoes'], x['registros']] for x in itens], [48, 10, 10, 12, 11])
    corte('Por etiqueta', data['porEtiqueta'], 'Etiqueta')
    corte('Por projeto', data['porProjeto'], 'Projeto')
    corte('Por colaborador', data['porPessoa'], 'Colaborador')
    corte('Por tarefa', data['porTarefa'], 'Tarefa')
    aba(wb.create_sheet('Alterações'), ['Tarefa original', 'Alterações', 'Horas nas alterações'],
        [[x['nome'], x['alteracoes'], round(x['segundos'] / 3600, 2)] for x in data['alteracoesPorTarefa']], [56, 12, 20])
    aba(wb.create_sheet('Registros'),
        ['Início', 'Fim', 'Colaborador', 'Projeto', 'Tarefa', 'Etiquetas', 'Minutos', 'Alteração', 'Situação'],
        [[local(r['inicio']), local(r['fim']), r['pessoa'], r['projeto'], r['tarefa'], ', '.join(r['etiquetas']),
          round(r['segundos'] / 60, 1), 'Sim' if r['alteracao'] else 'Não', 'Em andamento' if r['andamento'] else 'Finalizado']
         for r in data['registros']],
        [17, 17, 22, 18, 48, 36, 10, 11, 14])
    for row in wb['Registros'].iter_rows(min_row=2):
        for cell in row: cell.alignment = Alignment(vertical='top', wrap_text=cell.column in (5, 6))
    out = io.BytesIO(); wb.save(out); return out.getvalue()


def pdf(data):
    """A4 retrato: números do mês, barras por etiqueta (com a cor da etiqueta), clientes, colaboradores e alterações."""
    doc = pymupdf.open()
    W, H, M = 595, 842, 48
    ink, muted, line = (0.125, 0.125, 0.235), (0.38, 0.38, 0.46), (0.89, 0.89, 0.93)
    state = {'page': None, 'y': 0}

    def nova_pagina():
        state['page'] = doc.new_page(width=W, height=H); state['y'] = M

    def texto(s, size=10, color=ink, bold=False, x=M):
        state['page'].insert_text((x, state['y']), s, fontsize=size, fontname='hebo' if bold else 'helv', color=color)

    def precisa(altura):
        if state['y'] + altura > H - M: nova_pagina()

    def hex_rgb(h): return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))

    nova_pagina()
    state['y'] += 6; texto('Relatório de atividades', 20, bold=True)
    state['y'] += 20; texto(titulo_mes(data['mes']).capitalize() + ' · dados do Clockify', 12, muted)
    state['y'] += 34
    t = data['totais']
    numeros = [(horas(t['segundos']), 'horas registradas'), (str(t['tarefas']), 'tarefas'),
               (str(t['alteracoes']), 'alterações'), (str(t['colaboradores']), 'colaboradores')]
    largura = (W - 2 * M) / 4
    for i, (valor, rotulo) in enumerate(numeros):
        texto(valor, 22, bold=True, x=M + i * largura)
    state['y'] += 16
    for i, (_, rotulo) in enumerate(numeros):
        texto(rotulo, 9, muted, x=M + i * largura)
    state['y'] += 34

    def barras(titulo, itens, cor=None, limite=10, nota=None):
        itens = itens[:limite]
        precisa(40 + 22 * max(1, len(itens)))
        texto(titulo, 13, bold=True); state['y'] += 8
        if nota:
            state['y'] += 10; texto(nota, 8, muted)
        state['y'] += 8
        if not itens:
            state['y'] += 12; texto('Sem registros no mês.', 9, muted); state['y'] += 20; return
        maior = max(x['segundos'] for x in itens) or 1
        rotulo_w, valor_w = 170, 60
        barra_w = W - 2 * M - rotulo_w - valor_w
        for x in itens:
            state['y'] += 18
            nome = x['nome'] if len(x['nome']) <= 34 else x['nome'][:32] + '...'
            texto(nome, 9)
            topo = state['y'] - 9
            w = max(2, barra_w * x['segundos'] / maior)
            state['page'].draw_rect(pymupdf.Rect(M + rotulo_w, topo, M + rotulo_w + w, topo + 11),
                                    color=None, fill=hex_rgb(x.get('cor') or cor or '#6967C9'))
            extra = f"  ·  {x['alteracoes']} alt." if x['alteracoes'] else ''
            texto(horas(x['segundos']) + extra, 8, muted, x=M + rotulo_w + barra_w + 6)
        state['y'] += 28

    barras('Horas por etiqueta', data['porEtiqueta'], nota=NOTA_ETIQUETAS)
    barras('Horas por projeto', data['porProjeto'], cor='#20203C')
    barras('Horas por colaborador', data['porPessoa'], cor='#4F5F73')
    barras('Tarefas com mais horas', data['porTarefa'], cor='#6967C9')
    alt = [x | {'segundos': x['alteracoes']} for x in data['alteracoesPorTarefa']]
    precisa(60)
    texto('Tarefas com mais alterações', 13, bold=True); state['y'] += 18; texto(NOTA_ALTERACOES, 8, muted); state['y'] += 6
    if not alt:
        state['y'] += 4; texto('Nenhuma alteração registrada no mês.', 9, muted)
    for x in alt[:12]:
        precisa(18); state['y'] += 16
        nome = x['nome'] if len(x['nome']) <= 70 else x['nome'][:68] + '...'
        texto(nome, 9); texto(f"{x['alteracoes']} alteraç{'ão' if x['alteracoes'] == 1 else 'ões'}", 9, muted, x=W - M - 80)
    for i, page in enumerate(doc):
        page.draw_line((M, H - M + 14), (W - M, H - M + 14), color=line)
        page.insert_text((M, H - M + 28), f'Assistente de Edições · Indoor Channel · página {i + 1} de {len(doc)}', fontsize=8, color=muted)
    return doc.tobytes()
