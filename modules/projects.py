"""Validate saved timelines and independent export queue snapshots."""
import re
from modules import composition

MAX_TIMELINES = 20
MAX_QUEUE = 50


def title(value):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 90 or re.search(r'[\x00-\x1f]', value):
        raise ValueError('Escreva um nome com até 90 caracteres.')
    return value.strip()


def validate(meta, media, logo_for):
    meta = dict(meta)
    def project(value):
        result = composition.validate(value, media)
        for clip in result['clips']: logo_for(clip['settings'])
        return result
    if 'composition' in meta: meta['composition'] = project(meta['composition'])
    if 'timelines' in meta:
        rows = meta['timelines']
        if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_TIMELINES:
            raise ValueError('Use de uma a vinte timelines por edição.')
        timelines = [dict(id=composition.ident(row['id']), name=title(row['name']),
                          composition=project(row['composition'])) for row in rows]
        ids = {row['id'] for row in timelines}
        if len(ids) != len(rows) or meta.get('activeTimeline') not in ids:
            raise ValueError('Timeline ativa inválida ou timelines repetidas.')
        active = next(row for row in timelines if row['id'] == meta['activeTimeline'])
        active['composition'] = meta.get('composition', active['composition'])
        meta.update(timelines=timelines, composition=active['composition'])
    if 'exportQueue' in meta:
        rows = meta['exportQueue']
        if not isinstance(rows, list) or len(rows) > MAX_QUEUE:
            raise ValueError('A fila aceita até cinquenta vídeos.')
        queue = []
        for row in rows:
            number = row.get('number')
            if isinstance(number, bool) or not isinstance(number, int) or not 1 <= number <= 999:
                raise ValueError('Número da fila inválido.')
            snapshot = project(row['composition']);composition.check_coverage(snapshot)
            queue.append(dict(id=composition.ident(row['id']), name=title(row['name']), number=number,
                              timelineId=composition.ident(row['timelineId']), composition=snapshot))
        if len({row['id'] for row in queue}) != len(queue) or len({row['number'] for row in queue}) != len(queue):
            raise ValueError('Itens repetidos na fila.')
        meta['exportQueue'] = queue
    return meta
