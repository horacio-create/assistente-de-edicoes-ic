import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {blankProject,parseBrief,composeCard,qrLayer,textLayer,validateProject} from '../public/core.js';
import {captureTemplate,applyTemplate,validateTemplate} from '../public/templates.js';
const work=()=>{const p=blankProject();p.cards=parseBrief('Cartela 1 - Logo + Foto + texto\nNome confidencial\nTelefone confidencial').cards.map(c=>composeCard(c,p.theme,p.palette));return p;};
test('modelo guarda somente estrutura, sem texto, briefing, dados ou QR do cliente',()=>{
  const p=work(),c=p.cards[0];c.layers.find(l=>l.role==='title').x=123;c.layers.push(qrLayer('private','https://private.example'));
  c.layers.find(l=>l.role==='photo').assetId='private';c.layers.find(l=>l.role==='photo').zoom=3;
  const m=captureTemplate(p,c,'Saúde · abertura'),json=JSON.stringify(m);
  assert.equal(m.layers.find(l=>l.role==='title').x,123);assert.equal(m.layers.find(l=>l.role==='photo').zoom,1);
  assert.doesNotMatch(json,/confidencial|private|https:|data:image/);assert.ok(m.layers.every(l=>l.role!=='qr'));assert.equal(m.assets,undefined);
});
test('modelo preserva conteúdo revisado, materiais atuais, extras e QR e adapta identidade',()=>{
  const source=work(),model=captureTemplate(source,source.cards[0],'Abertura');
  model.layers.find(l=>l.role==='title').x=119;
  const p=work(),c=p.cards[0];p.palette.primary='#112233';p.palette.font='Verdana';
  p.assets.photo={name:'Foto',data:'data:image/png;base64,AAAA',width:1280,height:720,kind:'photo'};
  c.layers.find(l=>l.role==='photo').assetId='photo';c.layers.find(l=>l.role==='title').text='Título revisado';
  c.layers.push(textLayer('Observação','Texto extra preservado',60,500,600,100,30,'#112233'));
  const qr=qrLayer(null,null);c.layers.push(qr);c.approved=true;const original=structuredClone(c);
  applyTemplate(p,c,model);
  assert.equal(c.layers.find(l=>l.role==='title').text,'Título revisado');assert.equal(c.layers.find(l=>l.role==='title').x,119);assert.equal(c.layers.find(l=>l.role==='title').fill,'#112233');assert.equal(c.layers.find(l=>l.role==='title').font,'Verdana');
  assert.equal(c.layers.find(l=>l.role==='photo').assetId,'photo');assert.ok(c.layers.some(l=>l.text==='Texto extra preservado'));assert.equal(c.layers.filter(l=>l.role==='qr').length,1);assert.equal(c.layers.find(l=>l.role==='qr').id,qr.id);assert.equal(c.approved,false);assert.equal(original.approved,true);validateProject(p);
  const count=c.layers.length;applyTemplate(p,c,model);assert.equal(c.layers.length,count);
});
test('aplicação pode usar cores originais e rejeita modelos inválidos antes de alterar',()=>{
  const p=work(),m=captureTemplate(p,p.cards[0],'Modelo');p.palette.primary='#112233';
  applyTemplate(p,p.cards[0],m,{keepIdentity:false});assert.equal(p.cards[0].layers.find(l=>l.role==='title').fill,m.palette.primary);
  const old=JSON.stringify(p.cards[0]);const invalid=structuredClone(m);invalid.layers[0].w=-1;
  assert.throws(()=>applyTemplate(p,p.cards[0],invalid));assert.equal(JSON.stringify(p.cards[0]),old);
  assert.throws(()=>validateTemplate({...m,layers:[qrLayer(null,null)]}));
  assert.throws(()=>validateTemplate({...m,name:''}));
  const injected={...m,assets:{secret:'private'},brief:'secret'};assert.equal(validateTemplate(injected).assets,undefined);assert.equal(validateTemplate(injected).brief,undefined);
});
test('texto adicional do modelo precisa de revisão e não copia o conteúdo anterior',()=>{
  const source=work();const extra=textLayer('Nome privado','Conteúdo privado',90,250,650,140,40,'#112233');extra.role='custom';source.cards[0].layers.push(extra);
  const model=captureTemplate(source,source.cards[0],'Modelo');assert.doesNotMatch(JSON.stringify(model),/privado/);
  const target=work();applyTemplate(target,target.cards[0],model);const layer=target.cards[0].layers.find(l=>l.role==='custom');assert.equal(layer.text,'Edite este texto');assert.equal(layer.layoutPlaceholder,true);
  applyTemplate(target,target.cards[0],model);assert.equal(target.cards[0].layers.filter(l=>l.role==='custom').length,1);assert.equal(target.cards[0].layers.find(l=>l.role==='custom').layoutPlaceholder,true);
});
test('migração da versão 3 preserva clientes e trabalhos e permite remover modelos independentemente',async()=>{
  globalThis.indexedDB=new IDBFactory();const p=work();
  const db=await new Promise(resolve=>{const r=indexedDB.open('cartelas-local',3);r.onupgradeneeded=()=>{for(const name of ['projects','work','catalog','clients'])r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);});
  await new Promise(resolve=>{const tx=db.transaction(['projects','work','clients'],'readwrite');tx.objectStore('projects').put({activeId:p.id},'current');tx.objectStore('work').put(p,p.id);tx.objectStore('clients').put({id:'client',name:'Cliente'},'client');tx.oncomplete=resolve;});db.close();
  const storage=await import('../public/storage.js?templates');
  assert.deepEqual(await storage.readProject(),p);assert.equal((await storage.listClients()).length,1);
  const m=captureTemplate(p,p.cards[0],'Teste');await storage.saveTemplate(m);assert.deepEqual(await storage.listTemplates(),[m]);
  await storage.deleteTemplate(m.id);assert.deepEqual(await storage.listTemplates(),[]);assert.deepEqual(await storage.readProject(),p);
});
