import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {validatePhotoshopPayload} from '../photoshop.mjs';
import {photoshopScript} from '../public/export.js';
import {createServer} from '../server.mjs';
import vm from 'node:vm';
function payload(){const png=new PNG({width:1280,height:720});return {name:'Teste',images:[{name:'camadas/cartela-01/01-Fundo.png',data:PNG.sync.write(png).toString('base64')}],manifest:{version:1,cards:[{name:'Cartela 1',filename:'cartela-01',layers:[{type:'raster',name:'Fundo',locked:true,file:'camadas/cartela-01/01-Fundo.png'},{type:'text',name:'Título',locked:false,lines:['Texto'],psFont:'ArialMT',size:40,leading:48,anchorX:60,baseline:210,opacity:1,fill:'#112233',align:'left'}]}]}};}
test('entrega nativa aceita apenas imagens e camadas do pacote esperado',()=>{assert.equal(validatePhotoshopPayload(payload()).size,1);const p=payload();p.images[0].name='../../fora.png';assert.throws(()=>validatePhotoshopPayload(p),/Imagem inválida/);});
test('fontes personalizadas usam declaração explícita e nomes PostScript limitados',()=>{const p=payload();p.manifest.cards[0].layers[1].psFont='AgencyFB-Reg';assert.throws(()=>validatePhotoshopPayload(p));p.manifest.customFonts=['AgencyFB-Reg'];assert.doesNotThrow(()=>validatePhotoshopPayload(p));p.manifest.customFonts=['../../arquivo'];assert.throws(()=>validatePhotoshopPayload(p));});
test('fotos inteiras usam origem limitada e máscara independente; metadados adulterados são rejeitados',()=>{
  const p=payload();p.images.push({name:'materiais/foto-01.png',data:PNG.sync.write(new PNG({width:600,height:900})).toString('base64')});
  const photo={type:'photo',name:'Foto',locked:false,file:'materiais/foto-01.png',maskFile:'camadas/cartela-01/01-Fundo.png',sourceWidth:600,sourceHeight:900,opacity:1,image:{x:800,y:70,w:400,h:600},mask:{x:800,y:90,w:400,h:540,corners:[50,0,50,0]}};p.manifest.cards[0].layers.push(photo);assert.equal(validatePhotoshopPayload(p).size,2);
  for(const modify of [l=>l.sourceWidth=599,l=>l.mask.corners=[NaN,0,0,0],l=>l.mask.w=-1,l=>l.image.w=Infinity,l=>l.file='../foto.png',l=>l.maskFile='../mascara.png']){const broken=structuredClone(p);modify(broken.manifest.cards[0].layers.at(-1));assert.throws(()=>validatePhotoshopPayload(broken));}
  const script=photoshopScript(p.manifest);assert.doesNotThrow(()=>new vm.Script(script.replace(/^#target photoshop\n/,'')));assert.match(script,/smartObjectMore/);assert.match(script,/userMaskLinked.*false/);
});
test('entrega rejeita material ausente, imagens pequenas e fontes não suportadas',()=>{let p=payload();p.manifest.cards[0].layers[0].file='camadas/cartela-01/99-Ausente.png';assert.throws(()=>validatePhotoshopPayload(p),/ausente/);p=payload();p.images[0].data=PNG.sync.write(new PNG({width:1,height:1})).toString('base64');assert.throws(()=>validatePhotoshopPayload(p),/1280/);p=payload();p.manifest.cards[0].layers[1].psFont='Fonte inexistente';assert.throws(()=>validatePhotoshopPayload(p),/Texto inválido/);});
test('script silencioso preserva documento ativo e grava resultado sem alertas obrigatórios',()=>{const script=photoshopScript(payload().manifest,{interactive:false,renderPreviews:true});assert.doesNotThrow(()=>new vm.Script(script.replace(/^#target photoshop\n/,'')));assert.match(script,/var interactive = false/);assert.match(script,/app.activeDocument = originalDocument/);assert.match(script,/resultado-photoshop.txt/);assert.match(script,/PNGSaveOptions/);});

test('entrega agrupa as cartelas em um único documento e salva somente um PSD',()=>{
 const p=payload();p.manifest.cards.push({...structuredClone(p.manifest.cards[0]),name:'Cartela 2',filename:'cartela-02'});const script=photoshopScript(p.manifest);
 assert.equal((script.match(/app\.documents\.add\(/g)||[]).length,1);assert.match(script,/current\.layerSets\.add/);assert.match(script,/layer\.move\(group,ElementPlacement\.INSIDE\)/);assert.match(script,/groups\[c\]\.visible=c===0/);assert.match(script,/\/cartelas\.psd/);assert.doesNotMatch(script,/card\.filename \+ '\.psd'/);
 const bad=payload();bad.manifest.delivery='invalid';assert.throws(()=>validatePhotoshopPayload(bad));
});
test('API recusa origem externa e pedido inválido antes de chamar Photoshop',async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;try{let response=await fetch(base+'/api/photoshop',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'});assert.equal(response.status,403);response=await fetch(base+'/api/photoshop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,400);assert.match((await response.json()).error,/inválida/);}finally{await new Promise(r=>server.close(r));}});
