import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {blankProject,parseBrief,composeCard,textLayer,shapeLayer,qrLayer,validateProject} from '../public/core.js';
import {capturePersonalCollection,validatePersonalCollection,applyPersonalCollection} from '../public/personal-collections.js';
import {captureTemplate} from '../public/templates.js';

function work(extra=false){const p=blankProject();p.name='Nome confidencial';p.brief=`Cartela 1 - Logo + texto\nCliente privado\nÁrea privada\nCartela 2 - serviços\n• Serviço privado\n${extra?'Cartela 3 - serviços\n• Outro privado\n':''}Cartela ${extra?4:3} - contatos + QR Code\nChamada privada\n(88) 99999-0000`;p.cards=parseBrief(p.brief).cards.map(c=>composeCard(c,p.theme,p.palette));return p;}
const options={fitText:false};
test('coleção captura o conjunto sem textos, instruções, imagens, QR ou dados extras do cliente',()=>{
  const p=work(true);p.assets.secret={name:'Foto privada',kind:'photo',data:'data:image/png;base64,AAAA',width:500,height:500};
  p.cards.at(-1).layers.push(qrLayer('secret','destino-privado'));
  const c=capturePersonalCollection(p,'Estética');assert.equal(c.templates.length,4);assert.doesNotMatch(JSON.stringify(c),/privad|confidencial|99999|destino|AAAA/i);
  assert.equal(validatePersonalCollection({...c,assets:p.assets,brief:p.brief}).assets,undefined);
});
test('associação por tipo e ocorrência mantém ordem, conteúdo e QR; repete última variação',()=>{
  const source=work(true);source.cards[1].layers.find(l=>l.role==='title').x=101;source.cards[2].layers.find(l=>l.role==='title').x=202;
  const c=capturePersonalCollection(source,'Estética'),p=work(true);const extra=structuredClone(p.cards[2]);extra.id=crypto.randomUUID();extra.layers.forEach(l=>l.id=crypto.randomUUID());p.cards.splice(3,0,extra);
  p.assets.qr={name:'QR do novo cliente',kind:'qr',data:'data:image/png;base64,AAAA',width:199,height:199,qrContent:'cliente-novo'};p.cards.at(-1).layers.push(qrLayer('qr','cliente-novo'));
  p.palette.primary='#112233';p.cards.forEach(card=>card.approved=true);const ids=p.cards.map(card=>card.id),content=p.cards.map(card=>structuredClone(card.content)),assets=structuredClone(p.assets);
  assert.equal(applyPersonalCollection(p,c,options).applied,5);assert.deepEqual(p.cards.map(card=>card.id),ids);assert.deepEqual(p.cards.map(card=>card.content),content);assert.deepEqual(p.assets,assets);assert.deepEqual(p.cards.slice(1,4).map(card=>card.layers.find(l=>l.role==='title').x),[101,202,202]);assert.equal(p.palette.primary,'#112233');assert.equal(p.cards.at(-1).layers.find(l=>l.role==='qr').assetId,'qr');assert.ok(p.cards.every(card=>!card.approved));assert.doesNotThrow(()=>validateProject(p));
});
test('tipos sem correspondência são preservados e cores originais são uma escolha explícita',()=>{
  const source=work();source.cards=[source.cards[0]];const c=capturePersonalCollection(source,'Abertura');const p=work(),previous=structuredClone(p.cards.slice(1));p.palette.primary='#112233';
  const result=applyPersonalCollection(p,c,{...options,keepIdentity:false});assert.equal(result.applied,1);assert.equal(result.unmatched.length,2);assert.deepEqual(p.cards.slice(1),previous);assert.equal(p.palette.primary,source.palette.primary);
  const incompatible=work();incompatible.cards=incompatible.cards.slice(1);assert.throws(()=>applyPersonalCollection(incompatible,c,options));
});
test('erro numa cartela rejeita o conjunto sem aplicação parcial',()=>{
  const p=work(),c=capturePersonalCollection(p,'Modelo'),card=p.cards[1];while(card.layers.length<100){const l=textLayer('Extra','Texto atual',10,10,100,100,20,'#112233');l.role='custom';card.layers.push(l);}
  c.templates[1].layers.push(shapeLayer('Detalhe adicional',10,10,100,100,'#112233',{role:'custom'}));
  const before=structuredClone(p);assert.throws(()=>applyPersonalCollection(p,c,options));assert.deepEqual(p,before);
  assert.throws(()=>validatePersonalCollection({...c,templates:[]}));assert.throws(()=>validatePersonalCollection({...c,templates:Array(21).fill(c.templates[0])}));
});
test('migração v4 preserva trabalhos, clientes e modelos; coleções têm biblioteca independente',async()=>{
  globalThis.indexedDB=new IDBFactory();const p=work(),m=captureTemplate(p,p.cards[0],'Modelo');
  const db=await new Promise(resolve=>{const r=indexedDB.open('cartelas-local',4);r.onupgradeneeded=()=>{for(const name of ['projects','work','catalog','clients','templates'])r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);});
  await new Promise(resolve=>{const tx=db.transaction(['projects','work','templates','clients'],'readwrite');tx.objectStore('projects').put({activeId:p.id},'current');tx.objectStore('work').put(p,p.id);tx.objectStore('templates').put(m,m.id);tx.objectStore('clients').put({id:'client',name:'Cliente'},'client');tx.oncomplete=resolve;});db.close();
  const storage=await import('../public/storage.js?collections');assert.deepEqual(await storage.readProject(),p);assert.deepEqual(await storage.listTemplates(),[m]);assert.equal((await storage.listClients()).length,1);
  const c=capturePersonalCollection(p,'Conjunto');await storage.savePersonalCollection(c);assert.deepEqual(await storage.listPersonalCollections(),[c]);await storage.deletePersonalCollection(c.id);assert.deepEqual(await storage.listPersonalCollections(),[]);assert.deepEqual(await storage.readProject(),p);
});
