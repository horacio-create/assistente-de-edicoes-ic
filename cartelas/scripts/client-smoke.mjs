import {useWorkflowNavigation} from './workflow-test-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(process.env.CARTELAS_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const results=path.join(root,'test-results');await mkdir(results,{recursive:true});
async function drop(selector,filename,type='image/png'){
  const data=(await readFile(filename)).toString('base64');const dt=await page.evaluateHandle(({data,name,type})=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type}));return dt;},{data,name:path.basename(filename),type});await page.dispatchEvent(selector,'dragenter',{dataTransfer:dt});await page.dispatchEvent(selector,'drop',{dataTransfer:dt});await dt.dispose();
}
try {
  useWorkflowNavigation(page);await page.goto('http://127.0.0.1:3210');await page.locator('[data-view="clients"]').click();
  await page.locator('#client-name').fill('Dra. Victoria');await page.locator('#client-sector').fill('Saúde e estética');await page.locator('#client-origin').selectOption('official');await page.locator('#client-font').selectOption('Verdana');await page.locator('#client-notes').fill('Fundos claros e poucos ornamentos.');
  await drop('#client-logo-drop',path.join(root,'tests/fixtures/logo.png'));await page.waitForFunction(()=>document.querySelector('#client-logo-preview img'));
  await page.locator('#save-client').click();await page.waitForFunction(()=>document.querySelectorAll('[data-client-new]').length===1);
  const exportPromise=page.waitForEvent('download');await page.locator('#export-client').click();const file=path.join(results,'victoria.cliente.json');await(await exportPromise).saveAs(file);
  const profile=JSON.parse(await readFile(file,'utf8'));assert.equal(profile.name,'Dra. Victoria');assert.equal(profile.palette.font,'Verdana');assert.ok(profile.logo.data.startsWith('data:image/png'));
  await page.locator('[data-client-new]').click();await page.waitForFunction(()=>document.querySelector('#work-client-status').textContent.includes('Dra. Victoria'));assert.equal(await page.locator('#font').inputValue(),'Verdana');
  await page.locator('#brief').fill('Cartela 1 - Logo + texto\nApresentação da cliente\nCartela 2 - Logo + contatos\nAgende sua consulta');await page.locator('#parse').click();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===2);
  await page.locator('.layer').filter({hasText:'Título'}).click();await page.locator('[data-property="x"]').fill('111');await page.locator('[data-property="x"]').blur();
  await page.locator('[data-view="clients"]').click();await page.locator('[data-client-edit]').click();await page.locator('#client-font').selectOption('Arial');await page.locator('#save-client').click();await page.waitForFunction(()=>document.querySelector('#client-grid').textContent.includes('Arial'));
  await page.locator('[data-view="editor"]').click();assert.equal(await page.locator('#font').inputValue(),'Verdana');await page.locator('#apply-work-client').click();assert.equal(await page.locator('#font').inputValue(),'Arial');assert.equal(await page.locator('[data-property="x"]').inputValue(),'111');
  await page.locator('#client-recompose').check();await page.locator('#apply-work-client').click();await page.locator('.layer').filter({hasText:'Título'}).click();assert.equal(await page.locator('[data-property="x"]').inputValue(),'60');
  await page.locator('#undo').click();await page.locator('.layer').filter({hasText:'Título'}).click();assert.equal(await page.locator('[data-property="x"]').inputValue(),'111');
  await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Salvo neste navegador');await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===2);assert.match(await page.locator('#work-client-status').innerText(),/Dra. Victoria/);
  await page.locator('[data-view="clients"]').click();await drop('#client-import-drop',file,'application/json');await page.waitForFunction(()=>document.querySelectorAll('[data-client-new]').length===2);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(results,'clientes.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),false);
  assert.deepEqual(errors,[]);console.log('Clientes verificados: cadastro, logo por arrastar, exportação/importação, novo VT com identidade, edição independente, aplicação com e sem recomposição, desfazer e persistência.');
}finally{await browser.close();}
