import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {blankProject,parseBrief,composeCard,validateProject,removeAsset} from '../public/core.js';
import {blankClient,validateClient,applyClientIdentity,clientFromProject} from '../public/clients.js';
function client(){const c=blankClient();c.name='Cliente A';c.palette.primary='#334455';c.palette.accent='#88aa66';c.palette.font='Verdana';c.notes='Preferir fundos claros.';c.logo={name:'marca.png',kind:'logo',data:'data:image/png;base64,AAAA',width:500,height:200};return c;}
function work(){const p=blankProject();p.cards=parseBrief('Cartela 1 - Logo + foto\nTítulo\nTexto').cards.map(c=>composeCard(c,p.theme,p.palette));return p;}
test('aplicar identidade preserva conteúdo, foto, geometria e elementos personalizados',()=>{
  const p=work(),c=client(),card=p.cards[0];const title=card.layers.find(l=>l.role==='title');title.x=123;title.text='Texto aprovado';card.layers.find(l=>l.role==='photo').assetId=null;card.approved=true;
  applyClientIdentity(p,c);assert.equal(title.x,123);assert.equal(title.text,'Texto aprovado');assert.equal(title.font,'Verdana');assert.equal(title.fill,c.palette.primary);assert.equal(card.approved,false);assert.equal(p.clientIdentity.name,'Cliente A');assert.equal(p.assets[p.clientIdentity.logoAssetId].data,c.logo.data);assert.doesNotThrow(()=>validateProject(p));
});
test('perfil permanece independente e atualizações na biblioteca não alteram trabalhos',()=>{
  const p=work(),c=client();applyClientIdentity(p,c);c.name='Nome atualizado';c.palette.primary='#000000';c.logo.name='outro.png';assert.equal(p.clientIdentity.name,'Cliente A');assert.equal(p.palette.primary,'#334455');assert.equal(p.assets[p.clientIdentity.logoAssetId].name,'marca.png');
});
test('aplicar novamente a mesma identidade evita duplicação e mantém aprovação',()=>{
  const p=work(),c=client();applyClientIdentity(p,c);p.cards[0].approved=true;const count=Object.keys(p.assets).length;applyClientIdentity(p,c);assert.equal(Object.keys(p.assets).length,count);assert.equal(p.cards[0].approved,true);
});
test('recomposição usa família do cliente e preserva textos revisados',()=>{
  const p=work(),c=client();c.theme='contrast';p.cards[0].layers.find(l=>l.role==='title').text='Revisão';applyClientIdentity(p,c,{recompose:true});assert.equal(p.theme,'contrast');assert.equal(p.cards[0].layers.find(l=>l.role==='title').text,'Revisão');assert.equal(p.cards[0].layers.find(l=>l.role==='background').fill,c.palette.primary);
});
test('remoção de logo mantém cópia válida e perfil pode ser capturado do trabalho',()=>{
  const p=work(),c=client();applyClientIdentity(p,c);const captured=clientFromProject(p,'Cliente capturado');assert.equal(captured.logo.data,c.logo.data);assert.equal(captured.name,'Cliente capturado');removeAsset(p,p.clientIdentity.logoAssetId);assert.equal(p.clientIdentity.logoAssetId,null);assert.doesNotThrow(()=>validateProject(p));assert.equal(clientFromProject(p).logo,null);
});
test('validação rejeita perfil vazio e logo remoto',()=>{assert.throws(()=>validateClient(blankClient()));const c=client();c.logo.data='https://example.com/logo.png';assert.throws(()=>validateClient(c),/Logo inválido/);});
test('migração da versão 2 preserva trabalhos e adiciona biblioteca de clientes',async()=>{
  globalThis.indexedDB=new IDBFactory();const p=work();const db=await new Promise(resolve=>{const req=indexedDB.open('cartelas-local',2);req.onupgradeneeded=()=>{req.result.createObjectStore('projects');req.result.createObjectStore('work');req.result.createObjectStore('catalog');};req.onsuccess=()=>resolve(req.result);});
  await new Promise(resolve=>{const tx=db.transaction(['projects','work'],'readwrite');tx.objectStore('projects').put({activeId:p.id},'current');tx.objectStore('work').put(p,p.id);tx.oncomplete=resolve;});db.close();
  const storage=await import('../public/storage.js?clients-migration');assert.deepEqual(await storage.readProject(),p);const c=client();await storage.saveClient(c);assert.equal((await storage.listClients())[0].name,c.name);assert.deepEqual(await storage.readProject(),p);
});
