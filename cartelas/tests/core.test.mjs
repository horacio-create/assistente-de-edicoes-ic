import test from 'node:test';
import assert from 'node:assert/strict';
import { blankProject, parseBrief, composeCard, EXAMPLE, validateProject, validateCard, mutateCard, THEMES } from '../public/core.js';
import { photoshopScript, zipFiles, safeName } from '../public/export.js';
import { createServer } from '../server.mjs';
import vm from 'node:vm';
import {readdir} from 'node:fs/promises';

test('pedido mantém serviços ambíguos e separa instruções da arte',()=>{
  const {cards}=parseBrief(EXAMPLE);
  assert.equal(cards.length,3);assert.equal(cards[0].content.title,'DRA. VICTORIA DA PONTE');
  assert.equal(cards[1].kind,'services');assert.match(cards[1].content.body,/Full Face Toxina Botulínica/);
  assert.match(cards[1].content.body,/Rinomodelação Contorno Facial/);assert.equal(cards[2].requirements.qr,true);
  assert.doesNotMatch(cards[0].content.title,/Logo/);
});
test('cabeçalhos duplicados e pedidos sem divisão não são aceitos',()=>{
  assert.throws(()=>parseBrief('texto sem cartela'),/Cartela 1/);
  assert.throws(()=>parseBrief('Cartela 1\nA\nCartela 1\nB'),/duas vezes/);
});
test('recomposição preserva texto revisado e materiais',()=>{
  const p=blankProject();const c=composeCard(parseBrief(EXAMPLE).cards[0],p.theme,p.palette);
  c.layers.find(l=>l.role==='title').text='Título revisado';c.layers.find(l=>l.role==='photo').assetId='foto-original';
  c.approved=true;composeCard(c,'contrast',THEMES.contrast);
  assert.equal(c.layers.find(l=>l.role==='title').text,'Título revisado');assert.equal(c.layers.find(l=>l.role==='photo').assetId,'foto-original');assert.equal(c.approved,false);
});
test('mudanças invalidam aprovação e QR solicitado gera pendência',()=>{
  const p=blankProject();const c=composeCard(parseBrief(EXAMPLE).cards[2],p.theme,p.palette);
  assert.ok(validateCard(c,{}).some(x=>x.includes('QR Code')));
  c.approved=true;mutateCard(c,x=>x.content.title='Outro');assert.equal(c.approved,false);
});
test('cópia valida aceita projeto e rejeita imagens remotas e geometria inválida',()=>{
  const p=blankProject();p.cards=parseBrief(EXAMPLE).cards.map(c=>composeCard(c,p.theme,p.palette));
  assert.equal(validateProject(p),p);
  const malformed=structuredClone(p);malformed.cards[0].layers[0].w=NaN;assert.throws(()=>validateProject(malformed),/Camada inválida/);
  p.assets.x={name:'imagem',data:'https://example.com/image.png',width:100,height:100};assert.throws(()=>validateProject(p),/Material inválido/);
});
test('script Photoshop tem sintaxe compatível e restaura preferências',()=>{
  const script=photoshopScript({cards:[{name:'Cartela "teste"',filename:'cartela-1',layers:[{type:'text',name:'Título',psFont:'ArialMT',lines:['Texto com aspas " e acentos á'],size:40,leading:48,fill:'#112233',opacity:1}]}]});
  assert.doesNotThrow(()=>new vm.Script(script.replace(/^#target photoshop\n/,'')));
  assert.match(script,/LayerKind.TEXT/);assert.match(script,/finally/);assert.match(script,/options.layers = true/);
  assert.match(script,/getByName/);assert.match(script,/entrega-/);
});
test('arquivo ZIP inclui diretório e conteúdo UTF-8',async()=>{
  const zip=await zipFiles([{name:'leia-me.txt',data:'Olá, cartelas!'}]);const bytes=new Uint8Array(await zip.arrayBuffer());const v=new DataView(bytes.buffer);
  assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);
  assert.equal(v.getUint16(bytes.length-22+10,true),1);assert.ok(new TextDecoder().decode(bytes).includes('Olá, cartelas!'));
  assert.equal(safeName('Dra. Vitória / teste'),'Dra-Vitoria-teste');
});
test('servidor fornece app e referências e bloqueia caminhos fora da pasta',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base)).status,200);
    const refs=await (await fetch(base+'/api/references')).json();
    const expected=(await readdir(new URL('../Referências Cartelas/',import.meta.url)).catch(()=>[])).filter(name=>/\.(png|jpe?g)$/i.test(name)).sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
    assert.deepEqual(refs.map(r=>r.name),expected);
    for(const ref of refs)assert.equal(ref.url,'references/'+encodeURIComponent(ref.name));
    if(refs.length)assert.equal((await fetch(base+refs[0].url)).status,200);
    assert.equal((await fetch(base+'/package.json')).status,403);
    assert.equal((await fetch(base+'/%2e%2e%5cpackage.json')).status,403);
    assert.equal((await fetch(base,{method:'POST'})).status,405);
    const wrongHost=await new Promise((resolve,reject)=>{import('node:http').then(({default:http})=>{const req=http.get(base,{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);});req.on('error',reject);});});
    assert.equal(wrongHost,403);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
