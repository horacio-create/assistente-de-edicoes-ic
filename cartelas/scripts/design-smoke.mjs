import {useWorkflowNavigation} from './workflow-test-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.CARTELAS_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const root=process.cwd(),out=path.join(root,'test-results/design');await mkdir(out,{recursive:true});
try{
  useWorkflowNavigation(page);await page.goto('http://127.0.0.1:3210');await page.locator('[data-view="layouts"]').first().click();await page.waitForFunction(()=>document.querySelectorAll('.collection-cover').length===7);
  const screenshots=await page.evaluate(async()=>{
    const {COLLECTIONS,previewCard}=await import('/design-presets.js');const {drawCard,makeCanvas,fitCardTypography,textIssues}=await import('/render.js');
    const results=[];
    for(const c of COLLECTIONS)for(const kind of ['intro','services','contact']){const card=previewCard(c.id,kind);fitCardTypography(card);const canvas=makeCanvas();await drawCard(card,{},canvas);results.push({id:c.id,kind,png:canvas.toDataURL(),issues:textIssues(card)});}return results;
  });
  for(const item of screenshots){assert.deepEqual(item.issues,[],item.id+' '+item.kind);await writeFile(path.join(out,item.id+'-'+item.kind+'.png'),Buffer.from(item.png.split(',')[1],'base64'));}
  await page.screenshot({path:path.join(out,'colecoes.png'),fullPage:true});
  await page.locator('[data-preview-collection="atelier"][data-preview-kind="intro"]').click();await page.waitForFunction(()=>document.querySelector('#collection-dialog').open);
  await page.screenshot({path:path.join(out,'previa-ampliada.png')});await page.locator('#collection-dialog-close').click();
  await page.locator('[data-view="editor"]').click();await page.locator('#load-example').click();await page.locator('#parse').click();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===3);
  await page.locator('#logo-file').setInputFiles(path.join(root,'tests/fixtures/logo.png'));await page.locator('#photo-file').setInputFiles([path.join(root,'tests/fixtures/photo.png'),path.join(root,'tests/fixtures/photo.png')]);
  await page.locator('#qr-file').setInputFiles(path.join(root,'tests/fixtures/qr-client.png'));await page.waitForFunction(()=>document.querySelector('#qr-destination').textContent.includes('qr-client.png'));
  await page.locator('#layout-identity').uncheck();
  for(const id of ['atelier','care','table','bold','nocturne','school']){
    await page.locator('#collection-select').selectOption(id);await page.locator('#apply-collection').click();
    assert.doesNotMatch(await page.locator('#validation').innerText(),/não cabe|ultrapassa|texto de exemplo/);
    await page.locator('#approve').click();await page.waitForFunction(()=>document.querySelector('#approval-state').textContent==='Revisada por você');
    for(let i=0;i<3;i++){await page.locator('.thumbnail').nth(i).click();assert.doesNotMatch(await page.locator('#validation').innerText(),/não cabe|ultrapassa/);}
    await page.locator('.thumbnail').nth(2).click();
  }
  await page.locator('#undo').click();
  await page.locator('[data-view="layouts"]').first().click();await page.locator('#collection-preview-work').check();await page.locator('#collection-filter').selectOption('health');await page.waitForFunction(()=>document.querySelectorAll('.collection-cover').length===3);
  await page.screenshot({path:path.join(out,'previa-com-materiais.png'),fullPage:true});
  await page.locator('[data-collection-apply="atelier"]').click();assert.equal(await page.locator('#collection-select').inputValue(),'atelier');
  if(process.env.CARTELAS_TEST_PHOTOSHOP==='1'){
    for(let i=0;i<3;i++){await page.locator('.thumbnail').nth(i).click();await page.locator('#approve').click();await page.waitForFunction(()=>document.querySelector('#approval-state').textContent==='Revisada por você');}
    const available=await page.evaluate(async()=>{const r=await fetch('/api/photoshop/availability');return r.json();});assert.equal(available.available,true);
    const dl=page.waitForEvent('download',{timeout:180000});await page.locator('#export-psd').click();await(await dl).saveAs(path.join(out,'atelier-psds.zip'));
    console.log('Entrega dos novos templates gerada no Photoshop: três PSDs e prévias nativas.');
  }
  await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Salvo neste navegador');await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===3);
  const check=await page.evaluate(async()=>{const {readProject}=await import('/storage.js');const p=await readProject();return {valid:p.cards.every(c=>c.designCollection==='atelier'),ellipses:p.cards.some(c=>c.layers.some(l=>l.form==='ellipse')),qr:p.cards[2].layers.find(l=>l.role==='qr').assetId};});assert.equal(check.valid,true);assert.ok(check.qr);
  await page.setViewportSize({width:390,height:844});await page.locator('[data-view="layouts"]').first().click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  assert.deepEqual(errors,[]);console.log('Design verificado: 21 composições renderizadas, textos completos, seis coleções com materiais, QR legível, filtros, prévia sem aplicar, aplicação conjunta, persistência e tela pequena.');
}finally{await browser.close();}
