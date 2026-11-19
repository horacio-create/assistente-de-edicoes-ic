import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../server.mjs';
import {createBackupService} from '../backups.mjs';
import {createLibraryBackupService} from '../library-backups.mjs';
import {useWorkflowNavigation} from './workflow-test-navigation.mjs';

const out=path.resolve('test-results/visual-refinement');await mkdir(out,{recursive:true});
const server=createServer({backups:createBackupService({directory:path.join(out,'backups')}),libraries:createLibraryBackupService(path.join(out,'libraries'))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(process.env.CARTELAS_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 const original=JSON.parse(await readFile('Exemplos/Acabamentos/Victoria-acabamentos.cartelas.json','utf8'));
 const baseline=process.env.CARTELAS_BASELINE==='1';
 const result=await page.evaluate(async({original,baseline})=>{
  const {COLLECTIONS,previewCard,applyCollection,presetTemplate}=await import('/design-presets.js');
  const {drawCard,makeCanvas,fitCardTypography,textIssues,verifyQrAppearance}=await import('/render.js');
  const {validateProject}=await import('/core.js');
  const {buildServiceList,serviceItems}=await import('/service-list.js');
  const {sheetBlob}=await import('/export.js');
  const images=[],issues=[],canvas=makeCanvas();let example;
  for(const collection of COLLECTIONS){
   if(baseline&&collection.id!=='lumina')continue;
   if(!baseline)for(const kind of ['intro','services','contact']){
    const card=previewCard(collection.id,kind);fitCardTypography(card);
    issues.push(...textIssues(card).map(s=>collection.id+' '+kind+': '+s));
    await drawCard(card,{},canvas);images.push({name:collection.id+'-'+kind,png:canvas.toDataURL()});
   }
   const p=structuredClone(original);applyCollection(p,collection.id,{keepIdentity:false});
   for(const [i,card] of p.cards.entries()){
    fitCardTypography(card);issues.push(...textIssues(card).map(s=>collection.id+' real '+i+': '+s));
    if(!baseline)await verifyQrAppearance(card,p.assets);
    await drawCard(card,p.assets,canvas,null,false);
    images.push({name:(baseline?'antes-':'victoria-')+collection.id+'-'+(i+1),png:canvas.toDataURL()});
   }
   validateProject(p);
   if(collection.id==='lumina'){
    example=p;
    if(!baseline){
     const card=structuredClone(p.cards[1]),items=serviceItems(card);
     items[0].text=items[0].raw='Tratamento facial com acompanhamento personalizado';
     buildServiceList(card,p.palette,items);fitCardTypography(card);
     issues.push(...textIssues(card).map(s=>'Serviço longo: '+s));
     const text=card.layers.find(l=>l.role==='serviceText'),icon=card.layers.find(l=>l.role==='serviceIcon'&&l.serviceId===text.serviceId);
     const delta=Math.abs(text.y+text.h/2-icon.y-icon.h/2);
     await drawCard(card,p.assets,canvas,null,false);images.push({name:'servico-duas-linhas',png:canvas.toDataURL()});
     if(delta>2)issues.push('Texto de duas linhas desalinhado do ícone: '+delta);
     const once=JSON.stringify(card.layers);fitCardTypography(card);if(JSON.stringify(card.layers)!==once)issues.push('Ajuste repetido alterou a posição do serviço.');
    }
   }
  }
  const blob=await sheetBlob(example,'vertical'),sheet=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
  return {images,issues,example,sheet};
 },{original,baseline});
 for(const im of result.images)await writeFile(path.join(out,im.name+'.png'),Buffer.from(im.png.split(',')[1],'base64'));
 await writeFile(path.join(out,baseline?'antes.png':'Victoria-refinada.png'),Buffer.from(result.sheet.split(',')[1],'base64'));
 if(!baseline){
  assert.deepEqual(result.issues,[]);assert.deepEqual(result.example.assets,original.assets);
  assert.deepEqual(result.example.cards.map(c=>c.content),original.cards.map(c=>c.content));
  await writeFile(path.join(out,'Victoria-refinada.cartelas.json'),JSON.stringify(result.example));
  useWorkflowNavigation(page);page.on('dialog',d=>d.accept());
  await page.locator('#restore-file').setInputFiles(path.resolve('Exemplos/Acabamentos/Victoria-acabamentos.cartelas.json'));
  await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===4);
  const saved=async()=>{await page.waitForFunction(()=>['Salvo neste navegador','Trabalho recuperado'].includes(document.querySelector('#save-state').textContent));return page.evaluate(async()=>{const {readProject}=await import('/storage.js');return readProject();});};
  const before=await saved();
  await page.locator('#layout-identity').uncheck();await page.locator('#collection-select').selectOption('lumina');await page.locator('#apply-collection').click();
  const refined=await saved();assert.equal(refined.cards[1].layers.filter(l=>l.role==='serviceBadge').length,8);
  assert.deepEqual(refined.assets,before.assets);assert.deepEqual(refined.cards.map(c=>c.content),before.cards.map(c=>c.content));
  await page.locator('#undo').click();assert.deepEqual((await saved()).cards,before.cards);
  await page.locator('#redo').click();assert.deepEqual((await saved()).cards,refined.cards);
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===4);assert.deepEqual((await saved()).cards,refined.cards);
  await page.locator('[data-view="layouts"]').first().click();await page.screenshot({path:path.join(out,'galeria.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({baseline,images:result.images.length,issues:result.issues}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
