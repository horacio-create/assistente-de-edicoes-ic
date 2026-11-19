import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { readFile } from 'node:fs/promises';
import { createServer } from '../server.mjs';
import { blankProject, parseBrief, composeCard, qrLayer, validateCard, validateProject } from '../public/core.js';

test('imagem de QR recebida pode ser lida sem geração nem alteração',async()=>{
  const original=await readFile(new URL('./fixtures/qr-client.png',import.meta.url));const png=PNG.sync.read(original);
  const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
  assert.equal(decoded?.data,'https://wa.me/5588992348066');
  const data='data:image/png;base64,'+original.toString('base64');assert.deepEqual(Buffer.from(data.split(',')[1],'base64'),original);
});
test('QR é preservado ao mudar a família visual e inválido se material ou recorte mudar',()=>{
  const p=blankProject();const c=composeCard(parseBrief('Cartela 1 - QR Code\nEntre em contato').cards[0],p.theme,p.palette);
  const target='https://example.com/contato';const layer=qrLayer('code',target);c.layers.push(layer);
  const assets={code:{name:'QR do cliente',kind:'qr',data:'data:image/png;base64,AAAA',width:296,height:296,qrContent:target}};
  assert.deepEqual(validateCard(c,assets),[]);composeCard(c,'essential',{...p.palette,font:'Arial'});
  assert.equal(c.layers.find(l=>l.role==='qr').qrContent,target);assert.equal(c.layers.find(l=>l.role==='title').w,650);
  c.layers.find(l=>l.role==='qr').zoom=2;assert.ok(validateCard(c,assets).some(x=>x.includes('recorte')));
  assets.code.qrContent='https://example.com/outro';assert.ok(validateCard(c,assets).some(x=>x.includes('incompatível')));
  p.cards=[c];p.assets=assets;assert.doesNotThrow(()=>validateProject(p));
});
test('aplicativo exige material do cliente e não oferece geração de QR',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const unavailable=await fetch(base+'/api/qr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:'https://example.com'})});assert.equal(unavailable.status,405);
    const p=blankProject();const c=composeCard(parseBrief('Cartela 1 - QR Code\nContato').cards[0],p.theme,p.palette);assert.ok(validateCard(c,{}).some(x=>x.includes('imagem enviada pelo cliente')));
    assert.equal((await fetch(base+'/qr-reader.js')).status,200);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
