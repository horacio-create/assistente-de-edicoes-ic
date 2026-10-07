"""Validated multi-source, layered video projects. All times snap to output frames."""
import math
import os
import re
import tempfile
from pathlib import Path

from modules import videos, audio as audio_sources
from modules.images import render, settings as image_settings

FPS = 30


def number(value, low, high, label):
    try:
        value = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(label + ' inválido.') from exc
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(label + ' fora do limite.')
    return value


def ident(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{32}', value):
        raise ValueError('Identificação de trecho ou faixa inválida.')
    return value


def flag(value, default=False):
    if value is None:
        return default
    if not isinstance(value, bool):
        raise ValueError('Estado de bloqueio ou visualização inválido.')
    return value


def validate(value, media):
    if not isinstance(value, dict):
        raise ValueError('Montagem inválida.')
    rows = {m['id']: m for m in media}
    tracks, clips = value.get('tracks'), value.get('clips')
    if not isinstance(tracks, list) or not 1 <= len(tracks) <= 10:
        raise ValueError('Use de uma a dez faixas.')
    if not isinstance(clips, list) or len(clips) > 100:
        raise ValueError('Use até 100 trechos por montagem.')
    clean_tracks = []
    for t in tracks:
        if not isinstance(t, dict):
            raise ValueError('Faixa inválida.')
        kinds = {'audio' if rows[c['mediaId']]['kind'] == 'audio' else 'video'
                 for c in clips if isinstance(c, dict) and c.get('track') == t.get('id') and c.get('mediaId') in rows}
        kind = t.get('kind', next(iter(kinds), 'video'))
        if kind not in ('video', 'audio') or any(k != kind for k in kinds):
            raise ValueError('Coloque áudio em faixas de áudio e imagens ou vídeos em faixas de vídeo.')
        clean_tracks.append(dict(id=ident(t['id']), kind=kind, locked=flag(t.get('locked')),
                                 muted=flag(t.get('muted')), previewVisible=flag(t.get('previewVisible'), True)))
    track_ids = {t['id'] for t in clean_tracks}
    if len(track_ids) != len(tracks):
        raise ValueError('Faixas repetidas.')
    output = image_settings(value.get('settings', {}))
    if output['width'] % 2 or output['height'] % 2:
        raise ValueError('Para MP4, largura e altura precisam ser números pares.')
    output['mute'] = flag(value.get('settings', {}).get('mute'))
    output['targetMB'] = number(value.get('settings', {}).get('targetMB', 4), .1, 1000, 'Tamanho')
    cleaned = []
    for c in clips:
        if not isinstance(c, dict) or c.get('mediaId') not in rows or c.get('track') not in track_ids:
            raise ValueError('Trecho aponta para uma mídia ou faixa que não pertence a esta edição.')
        m = rows[c['mediaId']]
        at = round(number(c.get('at'), 0, 3600, 'Posição') * FPS) / FPS
        duration = max(1, round(number(c.get('duration'), 1/FPS-.00001, 3600, 'Duração') * FPS)) / FPS
        if at + duration > 3600 + .001:
            raise ValueError('A montagem deve ter no máximo uma hora.')
        start, end = 0, duration
        if m['kind'] in ('video', 'audio'):
            start = number(c.get('in'), 0, m['duration'], 'Início')
            end = number(c.get('out'), 0, m['duration']+.001, 'Fim')
            if end - start < .1 - .000001 or not .25-.001 <= (end-start)/duration <= 4+.001:
                raise ValueError('Use cortes de pelo menos 0,1 s e velocidade entre 0,25× e 4×.')
        geometry = image_settings(c.get('settings', m['settings']) | dict(width=output['width'], height=output['height']))
        cleaned.append(dict(id=ident(c['id']), mediaId=m['id'], track=c['track'], at=at,
                            duration=duration, **{'in':start,'out':min(end,m['duration']) if m['kind'] in ('video','audio') else end},
                            locked=flag(c.get('locked')), settings=geometry))
    if len({c['id'] for c in cleaned}) != len(cleaned):
        raise ValueError('Trechos repetidos.')
    return dict(version=1, settings=output, tracks=clean_tracks, clips=cleaned)


def duration(project):
    return max((c['at'] + c['duration'] for c in project['clips']), default=0)


def check_coverage(project):
    if not project['clips']:
        raise ValueError('Adicione ao menos um trecho à montagem.')
    audio_tracks = {t['id'] for t in project['tracks'] if t.get('kind') == 'audio'}
    visual = [c for c in project['clips'] if c['track'] not in audio_tracks]
    if not visual:
        raise ValueError('Adicione uma imagem ou um vídeo para exportar a montagem.')
    end = 0
    for clip in sorted(visual, key=lambda c: c['at']):
        if clip['at'] > end + .001:
            raise ValueError('Há um espaço vazio na montagem. Encaixe os trechos antes de exportar.')
        end = max(end, clip['at'] + clip['duration'])
    if duration(project) > end + .001:
        raise ValueError('O áudio ultrapassa o fim do vídeo. Corte o áudio ou adicione imagens para cobrir esse tempo.')


def export(media, folder, output_path, project, logo_for, progress=None, cancelled=None):
    project = validate(project, media)
    check_coverage(project)
    total = duration(project)
    s = project['settings']
    rows = {m['id']:m for m in media}
    rank = {t['id']:i for i,t in enumerate(project['tracks'])}
    muted_tracks = {t['id'] for t in project['tracks'] if t.get('kind') == 'audio' and t.get('muted')}
    clips = sorted(project['clips'], key=lambda c: (rank[c['track']], c['at']))
    audio = not s['mute'] and any(c['track'] not in muted_tracks and rows[c['mediaId']].get('has_audio') for c in clips)
    limit = int(s['targetMB']*1_000_000)
    audio_rate = 96000 if audio else 0
    bitrate = int(limit*.96*8/total-audio_rate)
    if bitrate < 50000:
        raise ValueError('Aumente o tamanho máximo, reduza a duração ou remova o áudio.')
    with tempfile.TemporaryDirectory(prefix='indoor-composition-') as work:
        work = Path(work)
        common = [videos.tool('ffmpeg'),'-hide_banner','-loglevel','error','-nostdin','-y']
        filter_file_option = videos.filter_file_option(common[0])
        logo_inputs, info = {}, {}
        for i,c in enumerate(clips):
            m = rows[c['mediaId']]
            logo = logo_for(c['settings']) if m['kind'] != 'audio' else None
            if m['kind']=='video':
                common += ['-threads','1','-ss',str(c['in']),'-t',str(c['out']-c['in']),'-i',str(folder/(m['id']+'.source'))]
                info[i] = dict(width=m['width'],height=m['height'],hasAudio=bool(m['has_audio']))
                if logo: logo_inputs[i]=logo
            elif m['kind'] == 'audio':
                common += ['-threads','1','-ss',str(c['in']),'-t',str(c['out']-c['in']),'-i',str(folder/(m['id']+'.source'))]
            else:
                image,_=render(folder/(m['id']+'.png'),c['settings'],logo,transparent=m.get('role')=='logo')
                rendered=work/f'image-{i}.png';image.save(rendered)
                common += ['-threads','1','-loop','1','-framerate',str(FPS),'-t',str(c['duration']),'-i',str(rendered)]
        for offset,(i,path) in enumerate(logo_inputs.items()):
            logo_inputs[i]=(len(clips)+offset,path)
            common += ['-threads','1','-i',str(path)]

        def graph(include_audio):
            filters=[f"color=c=black:s={s['width']}x{s['height']}:r={FPS}:d={total}[base0]"]
            audios=[]
            visual_count=0
            for i,c in enumerate(clips):
                m=rows[c['mediaId']]; label=f'clip{i}'
                if m['kind']=='audio':
                    if include_audio and audio and c['track'] not in muted_tracks:
                        audio_label=f'a{i}'
                        filters.append(f'[{i}:a:0]asetpts=PTS-STARTPTS,' +
                                       audio_sources.tempo((c['out']-c['in'])/c['duration']) +
                                       f',aresample=48000,aformat=channel_layouts=stereo,asetpts=N/SR/TB,apad,atrim=duration={c["duration"]},' +
                                       f'adelay={round(c["at"]*1000)}:all=1,apad,atrim=duration={total}[{audio_label}]')
                        audios.append(f'[{audio_label}]')
                    continue
                if m['kind']=='video':
                    local=dict(c['settings'],trimStart=0,trimEnd=c['out']-c['in'],
                               speed=(c['out']-c['in'])/c['duration'],mute=s['mute'])
                    local.pop('segments',None)
                    logo=logo_inputs.get(i)
                    clip_graph=videos.filters(info[i],local,logo[1] if logo else None,include_audio)
                    def rename(match):
                        token=match.group(1)
                        if token=='0:v:0': return f'[{i}:v:0]'
                        if token=='0:a:0': return f'[{i}:a:0]'
                        if token=='1:v' and logo: return f'[{logo[0]}:v]'
                        return f'[{label}_{token}]'
                    filters.append(re.sub(r'\[([^\]]+)\]',rename,clip_graph))
                    source=f'[{label}_out]'
                    if include_audio and not s['mute'] and m['has_audio']:
                        audio_label=f'a{i}'
                        filters.append(f'[{label}_audio]adelay={round(c["at"]*1000)}:all=1,apad,atrim=duration={total}[{audio_label}]')
                        audios.append(f'[{audio_label}]')
                else:
                    pixel_format='yuva420p' if m.get('role')=='logo' else 'yuv420p'
                    filters.append(f'[{i}:v:0]format={pixel_format},setpts=PTS-STARTPTS,trim=duration={c["duration"]}[{label}_out]')
                    source=f'[{label}_out]'
                filters.append(source+f'setpts=PTS+{c["at"]}/TB[placed{i}]')
                filters.append(f'[base{visual_count}][placed{i}]overlay=0:0:eof_action=pass:repeatlast=0:enable=\'gte(t,{c["at"]})*lt(t,{c["at"]+c["duration"]})\'[base{visual_count+1}]')
                visual_count+=1
            filters.append(f'[base{visual_count}]format=yuv420p[out]')
            if audios:
                filters.append(''.join(audios)+f'amix=inputs={len(audios)}:duration=longest:normalize=0,alimiter=limit=0.95:latency=1[audio]')
            return ';'.join(filters)

        # Keep the graph out of Windows' limited process command line.
        graphs={}
        for n in (1,2):
            graphs[n]=work/f'filters-{n}.txt'
            graphs[n].write_text(graph(n==2),encoding='utf-8')
        for attempt in range(3):
            for n in (1,2):
                args=common+['-filter_complex_threads','2',filter_file_option,str(graphs[n]),'-map','[out]',
                             '-c:v','libx264','-preset','medium','-b:v',str(bitrate),'-pix_fmt','yuv420p',
                             '-pass',str(n),'-passlogfile',str(work/'pass'),'-t',str(total),'-threads','2']
                if n==1: args+=['-an','-f','null',os.devnull]
                else:
                    args+=['-map','[audio]','-c:a','aac','-b:a',str(audio_rate)] if audio else ['-an']
                    args+=['-movflags','+faststart','-f','mp4',str(output_path)]
                videos.run_progress(args,total,(lambda fraction: progress((n-1+fraction)/2, attempt)) if progress else None, cancelled=cancelled)
            size=Path(output_path).stat().st_size
            if size<=limit:
                return dict(bytes=size,width=s['width'],height=s['height'],duration=total,
                            notes=['Compressão intensa: confira os textos no arquivo final.'] if bitrate<750000 else [])
            bitrate=int(bitrate*limit/size*.94)
        raise ValueError('Não foi possível respeitar o tamanho máximo. Aumente os MB ou reduza a duração.')
