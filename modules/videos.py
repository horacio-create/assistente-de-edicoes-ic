"""Local video import, frame previews and size-limited MP4 exports."""
import io
import json
import math
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from PIL import Image
from modules.images import DEFAULT, settings as image_settings, render as render_image, rotated_size

ROOT = Path(__file__).resolve().parents[1]
SUPPORTED = {'.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm', '.wmv', '.mpeg', '.mpg'}
DEFAULT_VIDEO = dict(trimStart=0, trimEnd=None, speed=1, mute=False, targetMB=4)

def tool(name):
    configured = os.environ.get('INDOOR_' + name.upper())
    local = ROOT / 'tools' / 'ffmpeg' / (name + ('.exe' if os.name == 'nt' else ''))
    found = configured or (str(local) if local.is_file() else shutil.which(name))
    if not found:
        raise ValueError('O processamento de vídeo não está instalado. Execute Instalar-video.ps1.')
    return str(found)

def available():
    try:
        tool('ffmpeg'); tool('ffprobe')
        return True
    except ValueError:
        return False

def run(args, timeout=300):
    try:
        result = subprocess.run(args, capture_output=True, timeout=timeout,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except subprocess.TimeoutExpired as exc:
        raise ValueError('O vídeo demorou demais para processar. Tente um trecho menor.') from exc
    if result.returncode:
        detail = result.stderr.decode('utf-8', errors='replace')[-1200:]
        raise ValueError('Não foi possível processar o vídeo. ' + detail)
    return result.stdout

class ExportCancelled(Exception):
    pass


def run_progress(args, duration, progress, timeout=3600, cancelled=None):
    if cancelled and cancelled(): raise ExportCancelled('Exportação cancelada.')
    if progress is None and cancelled is None:
        return run(args, timeout=timeout)
    # FFmpeg reports processed media time independently of its diagnostic log.
    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen([args[0], '-progress', 'pipe:1', '-nostats', *args[1:]],
                                   stdout=subprocess.PIPE, stderr=errors,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        timed_out = threading.Event()
        finished = threading.Event()
        def watch_cancel():
            while not finished.wait(.1):
                if cancelled and cancelled():
                    if process.poll() is None: process.kill()
                    return
        watcher = threading.Thread(target=watch_cancel, daemon=True);watcher.start()
        def expire():
            timed_out.set();process.kill()
        timer = threading.Timer(timeout, expire);timer.daemon = True;timer.start()
        try:
            for raw in process.stdout:
                line = raw.decode('ascii', errors='replace').strip()
                if line.startswith('out_time_us='):
                    try:
                        if progress: progress(min(1, max(0, float(line.split('=', 1)[1]) / 1_000_000 / duration)))
                    except ValueError: pass
            process.wait()
            if cancelled and cancelled(): raise ExportCancelled('Exportação cancelada.')
            if timed_out.is_set(): raise ValueError('O vídeo demorou demais para processar. Tente um trecho menor.')
            if process.returncode:
                errors.seek(0)
                raise ValueError('Não foi possível processar o vídeo. ' + errors.read().decode('utf-8', errors='replace')[-1200:])
            if progress: progress(1)
        finally:
            finished.set();watcher.join(timeout=1);timer.cancel();process.stdout.close()
            if process.poll() is None: process.kill();process.wait()

def probe(source):
    data = json.loads(run([tool('ffprobe'), '-v', 'error', '-show_streams', '-show_format',
                           '-of', 'json', str(source)], timeout=60))
    streams = data.get('streams', [])
    stream = next((s for s in streams if s.get('codec_type') == 'video'
                   and not s.get('disposition', {}).get('attached_pic')), None)
    if not stream:
        raise ValueError('O arquivo não contém uma faixa de vídeo.')
    duration = float(stream.get('duration') or data.get('format', {}).get('duration') or 0)
    width, height = int(stream.get('width', 0)), int(stream.get('height', 0))
    rotation = next((s.get('rotation', 0) for s in stream.get('side_data_list', [])
                     if 'rotation' in s), stream.get('tags', {}).get('rotate', 0))
    if int(float(rotation)) % 180:
        width, height = height, width
    if not math.isfinite(duration) or duration < .1 or duration > 3600:
        raise ValueError('Use vídeos entre 0,1 segundo e 1 hora.')
    if width < 1 or height < 1 or width * height > 40_000_000:
        raise ValueError('Resolução de vídeo inválida ou acima de 40 milhões de pixels.')
    fps_text = stream.get('avg_frame_rate') or '30/1'
    try:
        a, b = map(float, fps_text.split('/'))
        fps = a / b if b else 30
    except (ValueError, ZeroDivisionError):
        fps = 30
    return dict(width=width, height=height, duration=duration,
                hasAudio=any(s.get('codec_type') == 'audio' for s in streams),
                fps=fps, bytes=Path(source).stat().st_size)

def settings(value, duration):
    s = image_settings(DEFAULT_VIDEO | value)
    for key, low, high in [('trimStart', 0, duration), ('speed', .25, 4), ('targetMB', .1, 1000)]:
        s[key] = float(s[key])
        if not math.isfinite(s[key]) or not low <= s[key] <= high:
            raise ValueError('Corte, velocidade ou tamanho fora do limite.')
    s['trimEnd'] = duration if s.get('trimEnd') is None else float(s['trimEnd'])
    if not math.isfinite(s['trimEnd']) or not s['trimStart'] + .1 <= s['trimEnd'] <= duration + .001:
        raise ValueError('Escolha um trecho de pelo menos 0,1 segundo dentro do vídeo.')
    if 'segments' in value:
        parts = value['segments']
        if not isinstance(parts, list) or not 1 <= len(parts) <= 100:
            raise ValueError('Use de 1 a 100 trechos na montagem.')
        clean = []
        for part in parts:
            try:
                start, end = float(part['start']), float(part['end'])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError('Trecho de vídeo inválido.') from exc
            if not (math.isfinite(start) and math.isfinite(end) and
                    0 <= start and start + .1 <= end <= duration + .001):
                raise ValueError('Cada trecho precisa ter pelo menos 0,1 segundo e estar dentro do vídeo.')
            item = dict(start=start, end=min(end, duration))
            if 'locked' in part:
                if not isinstance(part['locked'], bool):
                    raise ValueError('Estado do cadeado inválido.')
                item['locked'] = part['locked']
            clean.append(item)
        s['segments'] = clean
    if 'previewVisible' in value and not isinstance(value['previewVisible'], bool):
        raise ValueError('Estado da visualização inválido.')
    s['mute'] = bool(s['mute'])
    if s['width'] % 2 or s['height'] % 2:
        raise ValueError('Para vídeos MP4, largura e altura precisam ser números pares.')
    return s


def segments(s):
    """Old saved edits retain their single trim; new edits store only ordered ranges.

    There is deliberately no destination offset: every range follows the previous
    one, so reordering cannot introduce a gap in the exported montage.
    """
    return s.get('segments', [dict(start=s['trimStart'], end=s['trimEnd'])])


def frame_counts(s):
    return [max(1, round((p['end'] - p['start']) / s['speed'] * 30)) for p in segments(s)]


def output_duration(s):
    return sum(frame_counts(s)) / 30

def frame(source, at=0):
    data = run([tool('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-nostdin',
                '-ss', str(max(0, at)), '-i', str(source), '-map', '0:v:0',
                '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], timeout=90)
    with Image.open(io.BytesIO(data)) as image:
        return image.convert('RGBA')

def import_video(source, proxy, poster):
    info = probe(source)
    image = frame(source)
    image.save(poster)
    # A browser-compatible copy preserves source time; audio changes remain an explicit choice.
    run([tool('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
         '-i', str(source), '-map', '0:v:0', '-map', '0:a:0?',
         '-vf', 'scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1',
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(proxy)], timeout=1800)
    return info, image

def preview(source, value, duration, logo=None, at=None):
    s = settings(value, duration)
    at = segments(s)[0]['start'] if at is None else min(max(float(at), 0), duration - .05)
    image = frame(source, at)
    with tempfile.TemporaryDirectory(prefix='indoor-frame-') as work:
        path = Path(work) / 'frame.png'
        image.save(path)
        result, notes = render_image(path, s, logo)
    if s['speed'] > 2:
        notes.append('Vídeo acelerado acima de 2×. Confira a leitura dos textos.')
    notes.append('Duração final: %.2f s. %s' % (output_duration(s),
                 'Sem áudio.' if s['mute'] else 'Áudio mantido quando presente.'))
    return result, notes

def filters(info, s, logo=None, include_audio=True):
    """Match image geometry: flips, clockwise rotation, scaling, position, then logo."""
    chain = ['setsar=1']
    if s['flipH']: chain.append('hflip')
    if s['flipV']: chain.append('vflip')
    rotation = s['rotation']
    if rotation == 90: chain.append('transpose=clock')
    elif rotation == 180: chain.extend(['hflip', 'vflip'])
    elif rotation == 270: chain.append('transpose=cclock')
    iw, ih = rotated_size(info['width'], info['height'], rotation)
    if rotation % 90:
        chain.extend(['format=rgba', f'rotate={math.radians(rotation)}:ow={iw}:oh={ih}:c=none'])
    w, h = s['width'], s['height']
    factor = 1 if s['lockSize'] else (max if s['mode'] == 'cover' else min)(w / iw, h / ih) * s['zoom']
    rw, rh = max(1, round(iw * factor)), max(1, round(ih * factor))
    x, y = round((w - rw) / 2 + s['x'] * w), round((h - rh) / 2 + s['y'] * h)
    # Crop in source coordinates first at extreme zooms to bound intermediate memory.
    crop_x, crop_y = max(0, -x), max(0, -y)
    cw, ch = min(rw - crop_x, w - max(0, x)), min(rh - crop_y, h - max(0, y))
    graph = []
    parts, counts = segments(s), frame_counts(s)
    # Each clip receives an exact frame count and continuous timestamps. Clone
    # padding protects cuts near EOF or sparse source timestamps from blank frames.
    if cw > 0 and ch > 0:
        for i, (part, count) in enumerate(zip(parts, counts)):
            graph.append(f"[{i}:v:0]setpts=(PTS-STARTPTS)/{s['speed']},fps=30,"
                         f"tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame={count},"
                         f"setpts=N/(30*TB)[clip{i}]")
        graph.append(''.join(f'[clip{i}]' for i in range(len(parts))) +
                     f'concat=n={len(parts)}:v=1:a=0[joined]')
    duration = output_duration(s)
    bg = s['color'] if s['mode'] == 'background' else '#000000'
    graph.append(f'color=c={bg}:s={w}x{h}:r=30:d={duration}[bg]')
    if cw > 0 and ch > 0:
        if rw * rh > 20_000_000:
            sx, sy = int(crop_x / factor), int(crop_y / factor)
            sw, sh = min(iw-sx, max(1, math.ceil(cw/factor))), min(ih-sy, max(1, math.ceil(ch/factor)))
            chain.extend([f'crop={sw}:{sh}:{sx}:{sy}:exact=1', f'scale={cw}:{ch}:flags=lanczos'])
        else:
            chain.extend([f'scale={rw}:{rh}:flags=lanczos', f'crop={cw}:{ch}:{crop_x}:{crop_y}:exact=1'])
        chain.append('fps=30')
        graph.append('[joined]' + ','.join(chain) + '[image]')
        graph.append(f'[bg][image]overlay=x={max(0,x)}:y={max(0,y)}:shortest=1:eof_action=endall[base]')
    else:
        graph.append('[bg]null[base]')
    if logo:
        with Image.open(logo) as asset:
            k = min(w*s['logoScale']/asset.width, h*.8/asset.height)
            lw, lh = max(1, round(asset.width*k)), max(1, round(asset.height*k))
        lx, ly = round((w-lw)*s['logoX']), round((h-lh)*s['logoY'])
        graph.extend([f'[{len(parts)}:v]scale={lw}:{lh}:flags=lanczos[logo]',
                      f'[base][logo]overlay={lx}:{ly}:eof_action=repeat[marked]',
                      '[marked]format=yuv420p[out]'])
    else:
        graph.append('[base]format=yuv420p[out]')
    if include_audio and info['hasAudio'] and not s['mute']:
        rate = s['speed']
        tempos = []
        while rate < .5:
            tempos.append('atempo=0.5'); rate *= 2
        tempos.append(f'atempo={rate}')
        for i, (part, count) in enumerate(zip(parts, counts)):
            graph.append(f"[{i}:a:0]asetpts=PTS-STARTPTS," +
                         ','.join(tempos) + f',apad,atrim=duration={count/30},asetpts=PTS-STARTPTS[aclip{i}]')
        graph.append(''.join(f'[aclip{i}]' for i in range(len(parts))) +
                     f'concat=n={len(parts)}:v=0:a=1[audio]')
    return ';'.join(graph)

def export(source, output, value, logo=None, progress=None, cancelled=None):
    info = probe(source)
    s = settings(value, info['duration'])
    duration = output_duration(s)
    limit = int(s['targetMB'] * 1_000_000)
    audio = info['hasAudio'] and not s['mute']
    audio_rate = 96000 if audio else 0
    # Reserve 4% for the MP4 container, rounding and the audio encoder.
    bitrate = int(limit*.96*8/duration - audio_rate)
    if bitrate < 50000:
        raise ValueError('Tamanho insuficiente para esta duração. Aumente os MB, corte o vídeo ou remova o áudio.')
    common = [tool('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-nostdin', '-y']
    # Seek each source range independently. A single split of a long video would
    # buffer earlier ranges while waiting for a later range placed first.
    for part in segments(s):
        common += ['-ss', str(part['start']), '-t', str(part['end']-part['start']), '-i', str(source)]
    if logo: common += ['-i', str(logo)]
    graph = filters(info, s, logo)
    notes = []
    if bitrate < 750000: notes.append('Compressão intensa. Confira a nitidez de textos e logotipos.')
    if s['speed'] > 2: notes.append('Velocidade acima de 2×. Confira a legibilidade.')
    with tempfile.TemporaryDirectory(prefix='indoor-encode-') as work:
        log = str(Path(work) / 'pass')
        for attempt in range(3):
            for n in (1, 2):
                # Pass 1 must not leave an unconnected audio output in the graph.
                pass_graph = graph if n == 2 else filters(info, s, logo, include_audio=False)
                args = common + ['-filter_complex', pass_graph, '-map', '[out]',
                                 '-c:v', 'libx264', '-preset', 'medium', '-b:v', str(bitrate),
                                 '-pix_fmt', 'yuv420p', '-pass', str(n), '-passlogfile', log,
                                 '-t', str(duration), '-threads', '2']
                if n == 1:
                    args += ['-an', '-f', 'null', os.devnull]
                else:
                    args += ['-map', '[audio]', '-c:a', 'aac', '-b:a', str(audio_rate)] if audio else ['-an']
                    args += ['-movflags', '+faststart', '-f', 'mp4', str(output)]
                run_progress(args, duration, (lambda fraction: progress((n-1+fraction)/2, attempt)) if progress else None, cancelled=cancelled)
            size = Path(output).stat().st_size
            if size <= limit:
                return dict(bytes=size, width=s['width'], height=s['height'], duration=duration,
                            mute=s['mute'], notes=notes)
            bitrate = int(bitrate * limit / size * .94)
        raise ValueError('Não foi possível respeitar o tamanho máximo. Aumente os MB ou reduza a duração.')
