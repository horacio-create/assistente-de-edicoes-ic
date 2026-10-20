import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {resolucaoSaida,entregarVideo} from '../ofertas/motor/saida.mjs';
import {validarTemplate,esquema} from '../ofertas/motor/contrato.mjs';

test('templates horizontais são entregues em HD sem mudar o tamanho da composição',()=>{
 for(const [w,h] of [[1920,1080],[3840,2160],[1280,720]])assert.deepEqual(resolucaoSaida(w,h),{largura:1280,altura:720});
 for(const [w,h] of [[1080,1920],[1080,1080]])assert.deepEqual(resolucaoSaida(w,h),{largura:w,altura:h});
 const {template,erros}=validarTemplate(resolve('ofertas/templates/uniforca-hora-da-carne-flexivel'));
 assert.deepEqual(erros,[]);const e=esquema(template);
 assert.equal(e.largura,1920);assert.equal(e.altura,1080);assert.deepEqual(e.saida,{largura:1280,altura:720});
});

test('exportação real preserva áudio, duração e proporção no MP4 1280×720',t=>{
 const ffmpeg=process.env.OFERTAS_FFMPEG||'ffmpeg';
 const ffprobe=process.env.OFERTAS_FFPROBE||'ffprobe';
 if(spawnSync(ffmpeg,['-version']).status!==0||spawnSync(ffprobe,['-version']).status!==0){t.skip('FFmpeg/FFprobe indisponíveis');return;}
 const pasta=mkdtempSync(join(tmpdir(),'ofertas-hd-'));
 try{
  const origem=join(pasta,'original.mp4'),destino=join(pasta,'hd.mp4');
  const criar=spawnSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=1920x1080:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',origem],{encoding:'utf8',windowsHide:true});
  assert.equal(criar.status,0,criar.stderr);
  entregarVideo(origem,destino,1920,1080);assert.ok(existsSync(destino));
  const probe=spawnSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',destino],{encoding:'utf8',windowsHide:true});
  assert.equal(probe.status,0,probe.stderr);const dados=JSON.parse(probe.stdout);
  const video=dados.streams.find(s=>s.codec_type==='video');
  assert.equal(video.width,1280);assert.equal(video.height,720);assert.equal(video.sample_aspect_ratio,'1:1');
  assert.ok(dados.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(dados.format.duration)-1)<.1);
  // Arquivos já em HD são entregues sem recodificação.
  const bytes=readFileSync(destino);const copia=join(pasta,'entregue.mp4');entregarVideo(destino,copia,1280,720);assert.deepEqual(readFileSync(copia),bytes);
 }finally{rmSync(pasta,{recursive:true,force:true});}
});
