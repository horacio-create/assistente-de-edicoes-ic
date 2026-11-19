import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../server.mjs';
import {createBackupService} from '../backups.mjs';
import {createLibraryBackupService} from '../library-backups.mjs';
const out=path.resolve('test-results/adaptive-layouts');await mkdir(out,{recursive:true});
const server=createServer({backups:createBackupService({directory:path.join(out,'backups')}),libraries:createLibraryBackupService(path.join(out,'libraries'))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(process.env.CARTELAS_PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const state=async()=>{await page.waitForFunction(()=>['Salvo neste navegador','Trabalho recuperado'].includes(document.querySelector('#save-state').textContent));return page.evaluate(async()=>{const {readProject}=await import('/storage.js');return readProject();});};
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('#workflow-pedido'));
 const result=await page.evaluate(async()=>{
  const {blankProject,parseBrief,composeCard,validateProject}=await import('/core.js'),{COLLECTIONS,applyCollection}=await import('/design-presets.js'),{fitCardTypography,textIssues,makeCanvas,drawCard}=await import('/render.js'),{sheetBlob}=await import('/export.js');
  const photo=makeCanvas(1800,1000),ctx=photo.getContext('2d');ctx.fillStyle='#d9c7ad';ctx.fillRect(0,0,1800,1000);ctx.fillStyle='#28594b';ctx.fillRect(0,0,500,1000);ctx.fillStyle='#a55739';ctx.fillRect(1300,0,500,1000);ctx.fillStyle='#fff';ctx.font='bold 60px Arial';ctx.textAlign='center';ctx.fillText('FOTO HORIZONTAL · TESTE',900,490);ctx.font='32px Arial';ctx.fillText('1800 × 1000 · imagem artificial',900,550);
  const scenarios=[
   {name:'restaurante-horizontal',collection:'table',title:'Cozinha artesanal e encontros à mesa',services:['Pratos executivos','Massas artesanais','Sobremesas da casa'],photo:true},
   {name:'educacao-sem-foto',collection:'school',title:'Centro Educacional de Desenvolvimento e Aprendizagem',services:['Educação infantil','Ensino fundamental','Artes e expressão','Esportes','Robótica','Língua inglesa','Música','Acompanhamento pedagógico'],photo:false},
   {name:'varejo-nome-longo',collection:'bold',title:'Casa das Soluções para Construção e Acabamentos',services:['Tintas e acessórios','Ferramentas','Materiais elétricos','Iluminação'],photo:true}
  ];
  const projects=[],images=[],issues=[];
  for(const scenario of scenarios){
   const p=blankProject();p.name='TESTE · '+scenario.name;p.brief=`Cartela 1 - Texto${scenario.photo?' + Foto 1':''}\n${scenario.title}\nAtendimento pensado para você.\nCartela 2 - Serviços\nConheça nossas opções\n${scenario.services.map(s=>'• '+s).join('\n')}\nCartela 3 - Contato sem QR Code\nVamos conversar?\n(00) 90000-0000\n@perfil_ficticio_teste`;
   p.cards=parseBrief(p.brief).cards.map(c=>composeCard(c,p.theme,p.palette));
   if(scenario.photo){p.assets.photo={name:'Foto horizontal artificial.png',kind:'photo',width:1800,height:1000,data:photo.toDataURL()};p.cards[0].layers.find(l=>l.role==='photo').assetId='photo';}
   for(const collection of COLLECTIONS){
    const draft=structuredClone(p);applyCollection(draft,collection.id,{keepIdentity:false});draft.cards.forEach(fitCardTypography);validateProject(draft);
    issues.push(...draft.cards.flatMap(c=>textIssues(c).map(issue=>scenario.name+' '+collection.id+': '+issue)));
    if(collection.id===scenario.collection){projects.push(draft);const blob=await sheetBlob(draft,'vertical'),png=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob);});images.push({name:scenario.name,png});}
   }
  }
  return {projects,images,issues};
 });
 assert.deepEqual(result.issues,[]);
 for(const image of result.images)await writeFile(path.join(out,image.name+'.png'),Buffer.from(image.png.split(',')[1],'base64'));
 for(const p of result.projects)await writeFile(path.join(out,p.name.replace('TESTE · ','')+'.cartelas.json'),JSON.stringify(p));
 await page.locator('#restore-file').setInputFiles(path.join(out,'restaurante-horizontal.cartelas.json'));await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===3);
 const before=await state(),photo=before.cards[0].layers.find(l=>l.role==='photo');
 const stage=await page.locator('#stage').boundingBox();await page.mouse.dblclick(stage.x+(photo.x+photo.w/2)*stage.width/1280,stage.y+(photo.y+photo.h/2)*stage.height/720);
 await page.waitForFunction(()=>document.querySelector('#stage').classList.contains('photo-pan'));
 assert.equal(await page.locator('#photo-framing').isVisible(),true);
 await page.locator('#frame-zoom').fill('2');await page.locator('#frame-zoom').dispatchEvent('change');
 const zoomed=await state(),zoomPhoto=zoomed.cards[0].layers.find(l=>l.role==='photo');assert.equal(zoomPhoto.zoom,2);
 const liveStage=await page.locator('#stage').boundingBox(),cx=liveStage.x+(photo.x+photo.w/2)*liveStage.width/1280,cy=liveStage.y+(photo.y+photo.h/2)*liveStage.height/720;
 await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+40,cy+20,{steps:5});await page.mouse.up();
 const moved=await state(),movedPhoto=moved.cards[0].layers.find(l=>l.role==='photo');assert.ok(movedPhoto.offsetX>0);assert.equal(movedPhoto.x,photo.x);assert.equal(movedPhoto.w,photo.w);
 await page.locator('#frame-reset').click();assert.equal((await state()).cards[0].layers.find(l=>l.role==='photo').zoom,1);await page.locator('#undo').click();assert.deepEqual((await state()).cards,moved.cards);
 await page.locator('[data-inspector="layers"]').click();await page.locator(`[data-layer="${photo.id}"]`).click();await page.locator('#frame-photo').click();
 await page.screenshot({path:path.join(out,'enquadramento.png')});await page.locator('#frame-done').click();assert.equal(await page.locator('#stage').evaluate(el=>el.classList.contains('photo-pan')),false);
 await page.locator('#restore-file').setInputFiles(path.join(out,'educacao-sem-foto.cartelas.json'));await page.waitForFunction(()=>document.querySelector('#sidebar-name').textContent.includes('educacao'));await page.locator('.thumbnail').nth(1).click();await page.locator('[data-inspector="services"]').click();const unsplit=await state();
 await page.locator('#service-split').click();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===4);const split=await state();
 const texts=p=>p.cards.filter(c=>c.kind==='services').flatMap(c=>c.layers.filter(l=>l.role==='serviceText').map(l=>l.text));assert.deepEqual(texts(split),texts(unsplit));assert.equal(split.cards[1].layers.filter(l=>l.role==='serviceText').length,4);
 await page.locator('#undo').click();assert.deepEqual((await state()).cards,unsplit.cards);await page.locator('#redo').click();assert.deepEqual((await state()).cards,split.cards);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===4);assert.deepEqual((await state()).cards,split.cards);
 await page.setViewportSize({width:390,height:844});await page.locator('[data-workflow="estilo"]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:path.join(out,'celular.png'),fullPage:true});
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'resultado.json'),JSON.stringify({scenarios:3,collectionsPerScenario:7,cardsChecked:63,issues:result.issues,photoFraming:true,splitUndoRedoPersistence:true},null,2));
 console.log('Adaptação: 63 cartelas, três áreas, foto horizontal, nomes longos, ausência de foto/logo/QR, enquadramento/zoom, divisão de serviços, desfazer/refazer e persistência: OK.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
