import {useWorkflowNavigation} from './workflow-test-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(process.env.CARTELAS_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const results=path.join(root,'test-results');await mkdir(results,{recursive:true});
try{
  useWorkflowNavigation(page);await page.goto('http://127.0.0.1:3210');await page.locator('#restore-file').setInputFiles(path.join(results,'projeto.cartelas.json'));await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===3);assert.match(await page.locator('#approval-count').innerText(),/3 de 3/);
  await page.locator('#check-photoshop').click();await page.waitForFunction(()=>document.querySelector('#photoshop-status').textContent.includes('conectado'));
  const download=page.waitForEvent('download',{timeout:180000});await page.locator('#export-psd').click();await(await download).saveAs(path.join(results,'psds-nativos.zip'));
  assert.match(await page.locator('#photoshop-progress').innerText(),/3 PSD/);assert.equal(await page.locator('#psd-download').isVisible(),true);assert.deepEqual(errors,[]);
  await page.locator('#toast').evaluate(el=>el.hidden=true);await page.locator('.export-panel').screenshot({path:path.join(results,'entrega-photoshop.png')});
  console.log('Entrega nativa aprovada no navegador: conexão, geração de três PSDs, download e prévias do Photoshop.');
}finally{await browser.close();}
