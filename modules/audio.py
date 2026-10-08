"""Audio sources, browser proxies and bounded peaks decoded from actual samples."""
import array
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from modules import videos

SUPPORTED = {'.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.flac', '.opus', '.wma', '.aif', '.aiff'}
PEAKS = 2048


def probe(source, cancelled=None):
    value = json.loads(videos.run([videos.tool('ffprobe'), '-v', 'error', '-show_streams',
                                  '-show_format', '-of', 'json', str(source)], cancelled=cancelled))
    stream = next((s for s in value.get('streams', []) if s.get('codec_type') == 'audio'), None)
    if stream is None:
        raise ValueError('Este arquivo não contém uma faixa de áudio.')
    try:
        duration = float(stream.get('duration', value.get('format', {}).get('duration', 0)))
    except (ValueError, TypeError) as exc:
        raise ValueError('Não foi possível identificar a duração do áudio.') from exc
    if not math.isfinite(duration) or not .1 <= duration <= 3600:
        raise ValueError('Use áudios entre 0,1 segundo e uma hora.')
    return dict(duration=duration, hasAudio=True, bytes=Path(source).stat().st_size)


def import_audio(source, proxy, poster, cancelled=None):
    info = probe(source, cancelled=cancelled)
    videos.run([videos.tool('ffmpeg'), '-v', 'error', '-nostdin', '-y', '-i', str(source),
                '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'aac',
                '-b:a', '160k', '-movflags', '+faststart', str(proxy)], cancelled=cancelled)
    # At most 14.4 MB even for a one-hour source. Downsampling keeps import cheap;
    # each displayed bucket retains the maximum absolute sample in that interval.
    raw = videos.run([videos.tool('ffmpeg'), '-v', 'error', '-nostdin', '-i', str(source),
                      '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '2000', '-t', '3600',
                      '-f', 's16le', 'pipe:1'], cancelled=cancelled)
    samples = array.array('h', raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    if not samples:
        raise ValueError('Não foi possível ler as amostras deste áudio.')
    count = min(PEAKS, len(samples))
    peaks = [round(max(abs(s) for s in samples[i*len(samples)//count:(i+1)*len(samples)//count])/32768, 5)
             for i in range(count)]
    image = Image.new('RGB', (400, 100), '#eeeefa')
    draw = ImageDraw.Draw(image)
    largest = max(peaks) or 1
    for x in range(400):
        level = max(peaks[x*count//400:max(x*count//400+1, (x+1)*count//400)])
        height = round(level/largest*43)
        draw.line((x, 50-height, x, 50+height), fill='#6a67ce')
    image.save(poster)
    return info, peaks


def tempo(rate):
    filters = []
    while rate < .5:
        filters.append('atempo=0.5')
        rate *= 2
    while rate > 2:
        filters.append('atempo=2')
        rate /= 2
    return ','.join(filters + [f'atempo={rate}'])
