import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { blankProject } from '../public/core.js';

test('atualização preserva o trabalho da versão anterior',async()=>{
  globalThis.indexedDB=new IDBFactory();const old=blankProject();old.name='Cliente antes da atualização';
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('cartelas-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  await new Promise(resolve=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(old,'current');tx.oncomplete=resolve;});db.close();
  const storage=await import('../public/storage.js?migration');
  assert.deepEqual(await storage.readProject(),old);
  const catalog=await storage.listProjects();assert.equal(catalog.length,1);assert.equal(catalog[0].name,old.name);
});
test('trabalhos diferentes permanecem salvos e o último ativo é recuperado',async()=>{
  globalThis.indexedDB=new IDBFactory();const storage=await import('../public/storage.js?library');
  const a=blankProject(),b=blankProject();a.name='Cliente A';b.name='Cliente B';a.updatedAt='2026-10-13T12:00:00Z';b.updatedAt='2026-10-13T13:00:00Z';
  await storage.saveProject(a);await storage.saveProject(b);
  assert.equal((await storage.readProject()).id,b.id);assert.deepEqual(await storage.readProject(a.id),a);
  const catalog=await storage.listProjects();assert.deepEqual(catalog.map(p=>p.name),['Cliente B','Cliente A']);
  a.name='Cliente A revisado';await storage.saveProject(a);assert.equal((await storage.listProjects()).length,2);assert.equal((await storage.readProject(a.id)).name,'Cliente A revisado');
});
