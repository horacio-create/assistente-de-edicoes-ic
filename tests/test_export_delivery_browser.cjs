const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const [url,sample,output]=process.argv.slice(2);fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768},acceptDownloads:true}),errors=[],downloads=[];
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
 const ready=()=>page.waitForFunction(()=>!busy);
 const open=async()=>{await page.locator('#open-export').click();await page.locator('#remote-folder-dialog').waitFor({state:'visible'});};
 const exportNamed=async name=>{await page.locator('#export-name').fill(name);await page.waitForFunction(name=>!busy&&plan?.files.every(f=>f.name.includes(name.replace(/^VT - /,''))),name);await page.locator('#confirm-export').click();await page.waitForFunction(()=>!busy&&$('export-result').textContent.includes('✓'),null,{timeout:90000});assert.doesNotMatch(await page.locator('#export-result').textContent(),/Falha/);};
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();
  await page.locator('#files').setInputFiles(sample);await page.waitForFunction(()=>!busy&&project()?.clips.length===1);
  await page.evaluate(()=>{editProject(()=>{const c=projectClip();c.in=0;c.out=1;c.duration=1;});info.nativePicker=false;window.pickerCalls=0;window.showDirectoryPicker=async options=>{window.pickerCalls++;window.pickerOptions=options;throw new DOMException('Restricted folder','SecurityError');};});
  await open();assert.equal(await page.locator('#folder-permissions-help').isVisible(),true);await page.locator('#use-browser-folder').click();
  await page.waitForFunction(()=>$('toast').textContent.includes('Baixar em Downloads'));
  assert.equal(await page.locator('#remote-folder-dialog').isVisible(),true);
  assert.equal(await page.evaluate(()=>browserTargets.size),0);assert.equal(downloads.length,0);
  assert.deepEqual(await page.evaluate(()=>pickerOptions),{id:'indoor-export',mode:'readwrite',startIn:'downloads'});
  await page.screenshot({path:path.join(output,'pasta-bloqueada-alternativa-downloads.png'),animations:'disabled'});
  await page.locator('#use-download-folder').click();await ready();assert.equal(await page.locator('#folder-label').textContent(),'Downloads deste computador');
  await exportNamed('VT - Downloads individual');assert.equal(downloads.length,1);
  assert.equal(downloads[0].suggestedFilename(),'VT - Downloads individual.mp4');await downloads[0].saveAs(path.join(output,downloads[0].suggestedFilename()));
  await page.locator('[data-close="export-dialog"]').click();
  await page.evaluate(()=>{window.showDirectoryPicker=async()=>{throw new DOMException('Cancelled','AbortError');};});
  const before=await page.evaluate(()=>browserTargets.size);await open();await page.locator('#use-browser-folder').click();
  assert.equal(await page.locator('#remote-folder-dialog').isVisible(),true);assert.equal(await page.evaluate(()=>browserTargets.size),before);
  await page.locator('#remote-folder-dialog .close').click();await ready();assert.equal(downloads.length,1);
  for(let n=1;n<=6;n++){await page.locator('#queue-add').click();await page.waitForFunction(n=>!busy&&exportQueue().length===n,n);}
  await open();await page.locator('#use-download-folder').click();await ready();
  await exportNamed('VT - Downloads fila');await page.waitForFunction(()=>exportQueue().length===0);
  assert.equal(downloads.length,7);
  for(let n=1;n<=6;n++){const d=downloads[n];assert.equal(d.suggestedFilename(),`VT ${String(n).padStart(2,'0')} - Downloads fila.mp4`);await d.saveAs(path.join(output,d.suggestedFilename()));}
  await page.screenshot({path:path.join(output,'fila-seis-arquivos-exportada.png')});await page.locator('[data-close="export-dialog"]').click();
  // A permitted directory keeps the streaming save flow, instead of forcing downloads.
  await page.evaluate(()=>{window.savedFiles={};window.showDirectoryPicker=async()=>({name:'Pasta de trabalho',async getFileHandle(name,options){if(!options?.create)throw new DOMException('Missing','NotFoundError');return {async createWritable(){return new WritableStream({write(chunk){savedFiles[name]=(savedFiles[name]||0)+chunk.byteLength;}});}};}});});
  await open();await page.locator('#use-browser-folder').click();await ready();
  assert.equal(await page.locator('#folder-label').textContent(),'Pasta de trabalho (neste computador)');
  await exportNamed('VT - Pasta permitida');assert.ok(await page.evaluate(()=>savedFiles['VT - Pasta permitida.mp4']>1000));assert.equal(downloads.length,7);
  await page.locator('[data-close="export-dialog"]').click();
  await page.evaluate(()=>{window.showDirectoryPicker=undefined;});await open();
  assert.equal(await page.locator('#use-download-folder').isVisible(),false);assert.equal(await page.locator('#use-browser-folder').textContent(),'Baixar em Downloads');
  await page.locator('#remote-folder-dialog .close').click();await ready();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({restrictedFolderHelp:true,explicitDownloadsFallback:true,cancelPreserved:true,individualDownload:true,sixQueueDownloads:true,permittedFolderStreaming:true,unsupportedBrowserFallback:true,errors}));
 }catch(error){await page.screenshot({path:path.join(output,'export-browser-error.png')});console.error(JSON.stringify({errors,state:await page.evaluate(()=>({busy,toast:$('toast').textContent,result:$('export-result').textContent,queue:exportQueue().length,files:plan?.files.map(f=>f.name)}))}));throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});