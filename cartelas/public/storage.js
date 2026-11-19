let dbPromise;
import {validateLibrary,mergeLibrary} from './library.js';import {uid} from './core.js';
function libraryChanged(){if(typeof globalThis.dispatchEvent==='function')globalThis.dispatchEvent(new CustomEvent('cartelas-library-change'));}
const summary=p=>({id:p.id,name:p.name,clientName:p.clientIdentity?.name||'',theme:p.theme,primary:p.palette.primary,cardCount:p.cards.length,approvedCount:p.cards.filter(c=>c.approved).length,updatedAt:p.updatedAt});
function database() {
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open('cartelas-local',5);
    req.onupgradeneeded=()=>{
      const db=req.result,tx=req.transaction;
      if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects');
      if(!db.objectStoreNames.contains('work'))db.createObjectStore('work');
      if(!db.objectStoreNames.contains('catalog'))db.createObjectStore('catalog');
      if(!db.objectStoreNames.contains('clients'))db.createObjectStore('clients');
      if(!db.objectStoreNames.contains('templates'))db.createObjectStore('templates');
      if(!db.objectStoreNames.contains('collections'))db.createObjectStore('collections');
      const legacy=tx.objectStore('projects').get('current');
      legacy.onsuccess=()=>{const p=legacy.result;if(p?.version===1&&p.id){tx.objectStore('work').put(p,p.id);tx.objectStore('catalog').put(summary(p),p.id);tx.objectStore('projects').put({activeId:p.id},'current');}};
    };
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();dbPromise=null;};resolve(req.result);};
    req.onerror=()=>{dbPromise=null;reject(req.error);};req.onblocked=()=>{dbPromise=null;reject(new Error('Feche outras abas do aplicativo para atualizar o salvamento.'));};
  });
  return dbPromise;
}
export async function saveProject(project) {
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction(['projects','work','catalog'],'readwrite');
    tx.objectStore('work').put(project,project.id);tx.objectStore('catalog').put(summary(project),project.id);tx.objectStore('projects').put({activeId:project.id},'current');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Salvamento interrompido'));
  });
}
export async function readProject(id) {
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction(['projects','work'],'readonly');
    const read=key=>{const req=tx.objectStore('work').get(key);req.onsuccess=()=>resolve(req.result);};
    if(id)read(id);else{const req=tx.objectStore('projects').get('current');req.onsuccess=()=>req.result?.activeId?read(req.result.activeId):resolve(undefined);}
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function listProjects() {
  const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('catalog','readonly').objectStore('catalog').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));req.onerror=()=>reject(req.error);});
}
export async function saveSourceMedia(id,{name,kind,blob}){
  if(typeof id!=='string'||!id.length||id.length>100||typeof name!=='string'||name.length>240||!['image','audio'].includes(kind)||!(blob instanceof Blob)||!blob.size||blob.size>(kind==='image'?8:20)*1024*1024)throw Error('Original inválido.');
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({name,kind,blob},'source-original:'+id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Não foi possível guardar o original.'));});
}
export async function readSourceMedia(id){const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('projects','readonly').objectStore('projects').get('source-original:'+id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function saveClient(client) {
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('clients','readwrite');tx.objectStore('clients').put(client,client.id);tx.oncomplete=()=>{libraryChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Não foi possível salvar o cliente.'));});
}
export async function listClients() {
  const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('clients','readonly').objectStore('clients').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));req.onerror=()=>reject(req.error);});
}
export async function saveTemplate(template) {
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('templates','readwrite');tx.objectStore('templates').put(template,template.id);tx.oncomplete=()=>{libraryChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Não foi possível salvar o modelo.'));});
}
export async function listTemplates() {
  const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('templates','readonly').objectStore('templates').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));req.onerror=()=>reject(req.error);});
}
export async function deleteTemplate(id) {
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('templates','readwrite');tx.objectStore('templates').delete(id);tx.oncomplete=()=>{libraryChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export async function savePersonalCollection(collection){
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('collections','readwrite');tx.objectStore('collections').put(collection,collection.id);tx.oncomplete=()=>{libraryChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export async function listPersonalCollections(){
  const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('collections','readonly').objectStore('collections').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));req.onerror=()=>reject(req.error);});
}
export async function deletePersonalCollection(id){
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('collections','readwrite');tx.objectStore('collections').delete(id);tx.oncomplete=()=>{libraryChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export async function librarySnapshot(){
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(['projects','clients','templates','collections'],'readwrite'),snapshot={version:1,type:'cartelas-library',name:'Biblioteca de clientes e templates',updatedAt:new Date().toISOString()};
    const key=tx.objectStore('projects').get('library-id');key.onsuccess=()=>{snapshot.id=key.result||uid();if(!key.result)tx.objectStore('projects').put(snapshot.id,'library-id');};
    for(const name of ['clients','templates','collections']){const request=tx.objectStore(name).getAll();request.onsuccess=()=>snapshot[name]=request.result;}
    tx.oncomplete=()=>{try{resolve(validateLibrary(snapshot));}catch(e){reject(e);}};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function restoreLibrary(value){
  const incoming=validateLibrary(value),db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(['clients','templates','collections'],'readwrite'),existing={};let received=0,result,failure;
    for(const name of ['clients','templates','collections']){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{existing[name]=request.result;if(++received!==3)return;try{result=mergeLibrary(existing,incoming);validateLibrary({...incoming,...result.items});for(const key of ['clients','templates','collections'])for(const item of result.items[key])if(!existing[key].some(old=>old.id===item.id))tx.objectStore(key).put(item,item.id);}catch(error){failure=error;tx.abort();}};}
    tx.oncomplete=()=>{libraryChanged();resolve(result.counts);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(failure||tx.error||new Error('Recuperação interrompida.'));
  });
}
