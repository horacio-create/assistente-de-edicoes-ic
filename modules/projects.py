"""Validate saved timelines and independent export queue snapshots."""
import re
import copy
import uuid
from modules import composition

MAX_TIMELINES = 10
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
            raise ValueError('Use de uma a dez timelines por edição.')
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


def reuse_timelines(meta, media, logo_for):
    """Build an independent copy of the active timeline for each destination file."""
    meta = validate(meta, media, logo_for)
    source = next(t for t in meta['timelines'] if t['id'] == meta['activeTimeline'])
    model = source['composition']
    rows = {m['id']: m for m in media}
    def primary(project):
        rank = {t['id']: i for i, t in enumerate(project['tracks'])}
        visual = sorted((c for c in project['clips'] if rows[c['mediaId']]['kind'] != 'audio'
                         and rows[c['mediaId']].get('role') != 'logo'), key=lambda c: (rank[c['track']], c['at']))
        return rows[visual[0]['mediaId']] if visual else None
    original = primary(model)
    if not original: raise ValueError('Adicione um vídeo ou uma imagem à timeline modelo.')
    composition.check_coverage(model)
    base = sorted((c for c in model['clips'] if c['mediaId'] == original['id']), key=lambda c: c['at'])
    base_track = base[0]['track']
    if any(rows[c['mediaId']]['kind'] == original['kind'] and c['track'] == base_track
           and c['mediaId'] != original['id'] for c in model['clips']):
        raise ValueError('Use um arquivo principal por timeline modelo; seus cortes podem ocupar vários trechos.')
    if any(a['at'] + a['duration'] > b['at'] + .001 for a,b in zip(base,base[1:])):
        raise ValueError('Os cortes do arquivo principal não podem se sobrepor na timeline modelo.')
    report = dict(applied=[], created=[], skipped=[], adjusted=[], queueUpdated=0)
    changed = {source['id']: model}
    auto_create = len(meta['timelines']) == 1
    overlay_ids = {c['mediaId'] for c in model['clips'] if c['mediaId'] != original['id']}
    def clone_for(m):
        project = copy.deepcopy(model)
        track_ids = {t['id']: uuid.uuid4().hex for t in project['tracks']}
        for t in project['tracks']: t['id'] = track_ids[t['id']]
        periods = []
        offset = 0
        adapted = False
        for c in base:
            start, end, length = c['in'], c['out'], c['duration']
            if m['kind'] == 'video':
                start = min(start, max(0, m['duration']-.1))
                end = min(m['duration'], max(start+.1, end))
                speed = (c['out']-c['in']) / c['duration']
                length = max(1/30, round((end-start)/speed*30)/30)
                adapted |= abs(start-c['in'])>.001 or abs(end-c['out'])>.001
            periods.append((c['at'],c['at']+c['duration'],c['at']+offset,length,start,end,c['id']))
            offset += length-c['duration']
        def mapped(time):
            offset = 0
            for start,end,placed,length,*_ in periods:
                if time < start: return time+offset
                if time <= end: return placed+(time-start)*length/(end-start)
                offset = placed+length-end
            return time+offset
        cuts = {item[-1]: item for item in periods}
        clips = []
        for c in project['clips']:
            old_id=c['id'];moved=cuts.get(old_id);asset=rows[c['mediaId']]
            c['id']=uuid.uuid4().hex;c['track']=track_ids[c['track']]
            if moved:
                c.update(mediaId=m['id'],at=round(moved[2]*30)/30,duration=moved[3])
                c['in'],c['out']=moved[4:6]
                if m['kind']=='image':c['in']=0;c['out']=c['duration']
            else:
                start=round(mapped(c['at'])*30)/30
                length=max(1/30,round((mapped(c['at']+c['duration'])-start)*30)/30)
                if asset['kind'] in ('video','audio'):
                    speed=(c['out']-c['in'])/c['duration']
                    end=min(asset['duration'],c['in']+length*speed)
                    if end-c['in']<.1-.000001:continue
                    c['out']=end;length=max(1/30,round((end-c['in'])/speed*30)/30)
                else:c['in']=0;c['out']=length
                c.update(at=start,duration=length)
            clips.append(c)
        project['clips']=clips
        project=composition.validate(project,media);composition.check_coverage(project)
        return project,adapted
    destinations=[]
    if auto_create:
        destinations=[(None,m) for m in media if m['id']!=original['id'] and m['id'] not in overlay_ids
                      and m['kind']==original['kind'] and m.get('role')!='logo']
    else:
        destinations=[(t,primary(t['composition'])) for t in meta['timelines'] if t['id']!=source['id']]
    for timeline,m in destinations:
        label=m['name'] if m else timeline['name']
        if not m or m['kind']!=original['kind']:
            report['skipped'].append(dict(name=label,reason='Timeline sem um arquivo principal do mesmo tipo do modelo.'));continue
        if timeline and (any(t.get('locked') for t in timeline['composition']['tracks']) or
                         any(c.get('locked') for c in timeline['composition']['clips'])):
            report['skipped'].append(dict(name=label,reason='Timeline bloqueada; desbloqueie-a para aplicar.'));continue
        if not timeline and len(meta['timelines'])>=MAX_TIMELINES:
            report['skipped'].append(dict(name=label,reason='Limite de 10 timelines.'));continue
        try:new_project,adapted=clone_for(m)
        except ValueError as exc:
            report['skipped'].append(dict(name=label,reason=str(exc)));continue
        before=composition.duration(timeline['composition']) if timeline else (m.get('duration') or composition.duration(model))
        after=composition.duration(new_project)
        if adapted or abs(after-before)>.034:
            report['adjusted'].append(dict(name=label,before=before,after=after,model=composition.duration(model),
                                          direction='encurtado' if after<before-.034 else 'alongado' if after>before+.034 else 'adaptado aos cortes disponíveis'))
        if timeline:timeline['composition']=new_project
        else:
            number=len(meta['timelines'])+1
            while any(t['name']==f'Timeline {number:02}' for t in meta['timelines']):number+=1
            timeline=dict(id=uuid.uuid4().hex,name=f'Timeline {number:02}',composition=new_project)
            meta['timelines'].append(timeline);report['created'].append(timeline['name'])
        changed[timeline['id']]=new_project;report['applied'].append(dict(name=label,timeline=timeline['name']))
    for item in meta.get('exportQueue',[]):
        if item['timelineId'] in changed:
            item['composition']=copy.deepcopy(changed[item['timelineId']]);report['queueUpdated']+=1
    return dict(meta=validate(meta,media,logo_for),report=report)
