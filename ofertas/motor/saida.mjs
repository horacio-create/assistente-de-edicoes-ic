// A composição mantém suas coordenadas; a entrega horizontal é HD 1280×720.
import { existsSync, renameSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function resolucaoSaida(largura, altura) {
  const hd = largura > 0 && altura > 0 && largura * 9 === altura * 16;
  return hd ? { largura: 1280, altura: 720 } : { largura, altura };
}

export function entregarVideo(origem, destino, largura, altura) {
  const saida = resolucaoSaida(largura, altura);
  if (saida.largura !== largura || saida.altura !== altura) {
    const local = fileURLToPath(new URL(`../../tools/ffmpeg/ffmpeg${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
    const ffmpeg = process.env.OFERTAS_FFMPEG || (existsSync(local) ? local : 'ffmpeg');
    const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      '-i', origem, '-map', '0:v:0', '-map', '0:a?',
      '-vf', `scale=${saida.largura}:${saida.altura}:flags=lanczos,setsar=1`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart', destino],
    { encoding: 'utf8', windowsHide: true });
    if (r.error || r.status !== 0) throw new Error(`Não foi possível exportar em 1280×720: ${r.error?.message || r.stderr || 'falha no FFmpeg'}`);
  } else {
    try { renameSync(origem, destino); }
    catch { copyFileSync(origem, destino); }
  }
  return saida;
}
