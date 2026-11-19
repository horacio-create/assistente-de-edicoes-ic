import {createLibraryBackupService} from '../library-backups.mjs';
import {useWorkflowNavigation} from './workflow-test-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../server.mjs';import {createBackupService} from '../backups.mjs';
const {chromium}=await import(process.env.CARTELAS_PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd(),materials=path.join(root,'MATERIAIS CIIENTE'),out=path.join(root,'test-results','real-workflow');
await mkdir(out,{recursive:true});
const server=createServer({backups:createBackupService({directory:path.join(out,'backups')}),libraries:createLibraryBackupService(path.join(out,'library-backups'))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const script=`Cartela 1 - Logo + texto + Foto 1
DRA. VICTORIA DA PONTE
HARMONIZAÇÃO FACIAL
CRO 18881

Cartela 2 - Logo como assinatura + foto 2 + serviços
• Preenchimento Facial
• Labial
• Full Face
• Toxina Botulínica

Cartela 3 - Logo como assinatura + foto 2 + serviços
• Rinomodelação
• Contorno Facial
• Bioestimuladores

Cartela 4 - Logo + texto + Foto 3 + informações de contato e QR Code
Realce sua beleza
(88) 99234-8066
@dravictoriadaponte`;
await writeFile(path.join(out,'roteiro-de-teste.txt'),script);
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true});
const errors=[];page.on('pageerror',err=>errors.push(err.message));page.on('dialog',d=>d.accept());
const saved=async()=>{await page.waitForFunction(()=>['Salvo neste navegador','Trabalho recuperado'].includes(document.querySelector('#save-state').textContent));return page.evaluate(async()=>{const {readProject}=await import('/storage.js');return readProject();});};
async function prop(key,value){await page.locator(`[data-property="${key}"]`).fill(String(value));await page.locator(`[data-property="${key}"]`).blur();}
try{
  useWorkflowNavigation(page);await page.goto(base);
  const print=await page.evaluate(script=>{const c=document.createElement('canvas');c.width=1200;c.height=1420;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#263028';ctx.font='bold 28px Arial';ctx.fillText('EXEMPLO DE PEDIDO — TESTE, NÃO É CONVERSA REAL',40,48);ctx.font='25px Arial';script.split('\n').forEach((line,i)=>ctx.fillText(line,40,108+i*43));return c.toDataURL('image/png');},script);
  await writeFile(path.join(out,'print-de-teste.png'),Buffer.from(print.split(',')[1],'base64'));
  await page.locator('[data-view="intake"]').click();await page.waitForFunction(()=>document.querySelector('#intake-status').dataset.ready==='yes');await page.locator('#intake-file').setInputFiles(path.join(out,'print-de-teste.png'));await page.locator('#intake-read').click();await page.waitForFunction(()=>document.querySelectorAll('.intake-source').length===1,{},{timeout:180000});
  await page.locator('#intake-suggest').click();
  const recognized=await page.locator('[data-source-text]').inputValue();assert.match(recognized,/VICTORIA/i);await writeFile(path.join(out,'texto-reconhecido.txt'),recognized);
  // Revisão explícita: a divisão segue a referência de quatro cartelas do usuário.
  await page.locator('#intake-proposal').fill(script);await page.locator('#intake-proposal').blur();await page.locator('#intake-apply').click();await page.locator('#project-name').fill('Victoria · exemplo com materiais reais');await page.locator('#project-name').blur();await page.locator('#parse').click();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===4);
  await page.locator('#pick-work-colors').click();await page.locator('#palette-file').setInputFiles(path.join(materials,'Paleta de cores.jpg'));await page.waitForFunction(()=>!document.querySelector('#palette-canvas').hidden);
  const box=await page.locator('#palette-canvas').boundingBox();await page.mouse.click(box.x+box.width*363/1536,box.y+box.height*430/1024);assert.match(await page.locator('#palette-hex').inputValue(),/^#[0-9a-f]{6}$/);assert.equal(await page.locator('.palette-swatch').count(),1);
  await page.locator('#palette-hex').fill('#C9A86A');await page.locator('[data-palette-role="accent"]').click();await page.locator('#palette-hex').fill('#625850');await page.locator('[data-palette-role="primary"]').click();await page.locator('#palette-hex').fill('#F5F1EA');await page.locator('[data-palette-role="background"]').click();await page.screenshot({path:path.join(out,'ferramenta-de-cores.png'),fullPage:true});await page.locator('#palette-close').click();
  await page.locator('#apply-colors').click();let p=await saved();assert.equal(p.palette.background,'#f5f1ea');await page.locator('#undo').click();p=await saved();assert.notEqual(p.palette.background,'#f5f1ea');await page.locator('#redo').click();
  await page.locator('#logo-file').setInputFiles(path.join(materials,'LOGO copiar.png'));await page.locator('#photo-file').setInputFiles(['1.jpg','2.jpg','3.jpg'].map(f=>path.join(materials,f)));await page.locator('#qr-file').setInputFiles(path.join(materials,'QR.png'));await page.waitForFunction(()=>document.querySelector('#qr-destination').textContent.includes('QR.png'));p=await saved();
  const photos=Object.entries(p.assets).filter(([,a])=>a.kind==='photo');const photo2=photos.find(([,a])=>a.name==='2.jpg')[0],photo3=photos.find(([,a])=>a.name==='3.jpg')[0];
  await page.locator(`[data-photo-target="${photo2}"]`).selectOption(p.cards[2].id);await page.locator(`[data-photo-target="${photo3}"]`).selectOption(p.cards[3].id);
  await page.locator('#collection-select').selectOption('lumina');await page.locator('#apply-collection').click();p=await saved();
  assert.equal(p.cards[1].layers.filter(l=>l.role==='serviceIcon').length,4);assert.equal(p.cards[2].layers.filter(l=>l.role==='serviceIcon').length,3);
  // Respeitar o logo pequeno recebido, em vez de ampliar até perder nitidez.
  await page.locator('.thumbnail').nth(0).click();const mark=p.cards[0].layers.find(l=>l.role==='logo');await page.locator(`[data-layer="${mark.id}"]`).click();await prop('w',360);await prop('h',220);await prop('x',700);
  // Mantém as quatro cartelas em revisão: a aprovação final pertence ao designer.
  for(let i=0;i<4;i++){await page.locator('.thumbnail').nth(i).click();assert.doesNotMatch(await page.locator('#validation').innerText(),/resolução baixa|não cabe|ultrapassa|material ausente|solicitado/);}
  p=await saved();assert.deepEqual(Buffer.from(Object.values(p.assets).find(a=>a.kind==='qr').data.split(',')[1],'base64'),await readFile(path.join(materials,'QR.png')));
  const outputs=await page.evaluate(async()=>{const {readProject}=await import('/storage.js');const {drawCard,makeCanvas,verifyQrAppearance}=await import('/render.js');const {sheetBlob,photoshopPackage}=await import('/export.js');const p=await readProject(),images=[];await verifyQrAppearance(p.cards[3],p.assets);for(const card of p.cards){const canvas=makeCanvas();await drawCard(card,p.assets,canvas,null,false);images.push(canvas.toDataURL());}const data=async blob=>Array.from(new Uint8Array(await blob.arrayBuffer()));return {images,sheet:await data(await sheetBlob(p,'vertical')),zip:await data(await photoshopPackage(p))};});
  for(let i=0;i<4;i++)await writeFile(path.join(out,`cartela-${i+1}.png`),Buffer.from(outputs.images[i].split(',')[1],'base64'));
  await writeFile(path.join(out,'montagem-para-revisao.png'),Buffer.from(outputs.sheet));await writeFile(path.join(out,'pacote-photoshop-para-revisao.zip'),Buffer.from(outputs.zip));await writeFile(path.join(out,'Victoria.cartelas.json'),JSON.stringify(p,null,2));
  for(let i=0;i<4;i++){await page.locator('.thumbnail').nth(i).click();await page.locator('#approve').click();await page.waitForFunction(()=>document.querySelector('#approval-state').textContent==='Revisada por você');}
  const nativeDownload=page.waitForEvent('download',{timeout:180000});await page.locator('#export-psd').click();await(await nativeDownload).saveAs(path.join(out,'Victoria-psds.zip'));assert.match(await page.locator('#photoshop-progress').innerText(),/4 PSD/);
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.thumbnail').length===4);assert.equal((await saved()).palette.background,'#f5f1ea');
  await page.locator('#capture-client').click();assert.equal(await page.locator('#client-background').inputValue(),'#f5f1ea');await page.locator('#pick-client-colors').click();await page.locator('#palette-hex').fill('#D8BC83');await page.locator('[data-palette-role="accent"]').click();await page.locator('#palette-close').click();await page.locator('#save-client').click();await page.waitForFunction(()=>document.querySelectorAll('[data-client-edit]').length===1);await page.locator('[data-client-edit]').click();assert.equal(await page.locator('#client-accent').inputValue(),'#d8bc83');
  await page.locator('#pick-client-colors').click();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:path.join(out,'cores-tela-pequena.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('Materiais reais: OCR de print simulado, revisão, quatro cartelas, paleta, desfazer/refazer, fotos, sete ícones, QR preservado e legível, cópia importável, pacote Photoshop, perfil e tela pequena verificados.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
