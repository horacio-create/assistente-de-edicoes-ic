import {useWorkflowNavigation} from './workflow-test-navigation.mjs';
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
const {chromium}=await import(process.env.CARTELAS_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),out=path.join(process.cwd(),'test-results/finishes'),errors=[];
await mkdir(out,{recursive:true});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());useWorkflowNavigation(page);
async function state(){await page.waitForFunction(()=>['Salvo neste navegador','Trabalho recuperado'].includes(document.querySelector('#save-state').textContent));return page.evaluate(async()=>{const {readProject}=await import('/storage.js');return readProject();});}
try{
  await page.goto('http://127.0.0.1:3210/');await page.locator('#restore-file').setInputFiles(path.join(process.cwd(),'Exemplos/Victoria/Victoria.cartelas.json'));await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===4);
  const original=await state();await page.locator('#collection-select').selectOption('lumina');await page.locator('#apply-collection').click();const applied=await state();
  assert.ok(applied.cards.every(c=>c.layers[0].texture));assert.deepEqual(applied.assets,original.assets);assert.deepEqual(applied.cards.map(c=>c.content),original.cards.map(c=>c.content));
  await page.locator('[data-layer]').filter({hasText:'Fundo'}).click();assert.equal(await page.locator('[data-finish]').inputValue(),'paper');await page.locator('[data-finish]').selectOption('plain');assert.equal((await state()).cards[0].layers[0].gradient,undefined);await page.locator('#undo').click();assert.ok((await state()).cards[0].layers[0].texture);
  await page.locator('[data-layer]').filter({hasText:'Fundo'}).click();await page.locator('[data-shadow]').selectOption('lifted');assert.equal((await state()).cards[0].layers[0].shadow.blur,26);await page.locator('#undo').click();
  await state();const exportResult=await page.evaluate(async()=>{
    const {readProject}=await import('/storage.js'),{drawCard,drawLayer,makeCanvas,verifyQrAppearance}=await import('/render.js'),{nativePhotoshopPayload,sheetBlob}=await import('/export.js');
    const p=await readProject(),canvas=makeCanvas();await drawCard(p.cards[1],p.assets,canvas,null,false);const service=canvas.toDataURL().split(',')[1];
    const contact=p.cards.find(c=>c.requirements.qr);await drawCard(contact,p.assets,canvas,null,false);const qr=await verifyQrAppearance(contact,p.assets);
    const payload=await nativePhotoshopPayload(p),layer=p.cards[1].layers.find(l=>l.name==='Moldura assimétrica'),entry=payload.manifest.cards[1].layers.find(l=>l.name===layer.name);
    await drawLayer(canvas.getContext('2d'),{...layer,visible:false},p.assets,false);canvas.getContext('2d').clearRect(0,0,1280,720);await drawLayer(canvas.getContext('2d'),layer,p.assets,false);
    const raster=payload.images.find(i=>i.name===entry.file).data;const match=raster===canvas.toDataURL().split(',')[1];
    const blob=await sheetBlob(p,'vertical'),montage=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});
    return {p,payload,service,montage,match,qr};
  });assert.equal(exportResult.match,true);assert.equal(exportResult.qr,undefined);
  await writeFile(path.join(out,'servicos.png'),Buffer.from(exportResult.service,'base64'));await writeFile(path.join(out,'montagem.png'),Buffer.from(exportResult.montage,'base64'));await writeFile(path.join(out,'Victoria-acabamentos.cartelas.json'),JSON.stringify(exportResult.p));await writeFile(path.join(out,'payload.json'),JSON.stringify(exportResult.payload));
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===4);assert.deepEqual((await state()).cards,exportResult.p.cards);
  await page.locator('[data-workflow="edicao"]').click();await page.locator('[data-layer]').filter({hasText:'Fundo'}).click();await page.screenshot({path:path.join(out,'editor.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.deepEqual(errors,[]);
  console.log('Acabamentos: materiais/textos preservados, controles, desfazer, cópia reaberta, sombra/textura/degradê, raster idêntico no pacote Photoshop, QR legível e tela pequena.');
}finally{await browser.close();}
