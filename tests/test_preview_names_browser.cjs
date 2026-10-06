// Isolated server and synthetic media only; sample starts red and later becomes blue.
const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const [url,sample,output]=process.argv.slice(2);fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();
  await page.locator('#files').setInputFiles(sample);await page.waitForFunction(()=>!busy&&project()?.clips.length===1);
  await page.waitForFunction(()=>compositionPlayers.size&&[...compositionPlayers.values()].every(p=>p.frameReady&&!p.seeking));
  await page.evaluate(()=>seekComposition(2));
  await page.waitForFunction(()=>{const p=[...compositionPlayers.values()][0];return p.frameReady&&!p.seeking&&Math.abs(p.currentTime-2)<.001;});
  await page.waitForFunction(()=>{const c=$('live-preview'),v=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return v[2]>180&&v[0]<25;});
  // Record every committed canvas across frame stepping; the initial red poster must never return.
  await page.evaluate(()=>{window.previewSamples=[];window.watchPreview=true;const record=()=>{if(!watchPreview)return;const c=$('live-preview');previewSamples.push(Array.from(c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data));requestAnimationFrame(record);};record();});
  await page.locator('.canvas-shell').click({position:{x:10,y:10}});
  for(let i=0;i<18;i++){await page.keyboard.press('ArrowRight');await page.waitForTimeout(12);}
  for(let i=0;i<12;i++){await page.keyboard.press('ArrowLeft');await page.waitForTimeout(12);}
  await page.waitForFunction(()=>{const p=[...compositionPlayers.values()][0];return p.frameReady&&!p.seeking&&Math.abs(p.currentTime-compositionCursor)<.001;});
  const pixels=await page.evaluate(()=>{watchPreview=false;return previewSamples;});assert.ok(pixels.length>10);
  assert.ok(pixels.every(v=>v[2]>180&&v[0]<25),JSON.stringify(pixels));
  // New sliced player also starts at its requested in point, never at the poster.
  await page.evaluate(()=>{editProject(()=>{const c=projectClip();c.in=1.5;c.out=4;c.duration=2.5;});seekComposition(.5);});
  await page.waitForFunction(()=>{const p=[...compositionPlayers.values()][0];return p.frameReady&&!p.seeking&&Math.abs(p.currentTime-2)<.001;});
  await page.evaluate(()=>{seekComposition(1.4);seekComposition(.01);seekComposition(1.8);});
  await page.waitForFunction(()=>{const p=[...compositionPlayers.values()][0];return p.frameReady&&!p.seeking&&Math.abs(p.currentTime-3.3)<.001;});
  assert.equal(await page.locator('#audio-status').isVisible(),false);assert.equal(await page.locator('#audio-action').isVisible(),true);
  const trim=await page.locator('.clip-properties .trim-track').evaluate(el=>{const range=el.querySelector('input'),thumb=getComputedStyle(range,'::-webkit-slider-thumb');return {track:el.clientHeight,input:range.clientHeight,thumb:parseFloat(thumb.height),bottom:el.getBoundingClientRect().bottom,labels:el.nextElementSibling.getBoundingClientRect().top};});
  assert.equal(trim.input,trim.track);assert.ok(trim.labels>=trim.bottom);assert.ok(trim.thumb<=trim.track,JSON.stringify(trim));
  await page.locator('#edition-name').click();await page.locator('#edition-title').fill('Clínica Sorriso — Outubro');await page.locator('#rename-form button[type=submit]').click();
  await page.waitForFunction(()=>!busy&&job.title==='Clínica Sorriso — Outubro');
  const editionId=await page.evaluate(()=>job.id);await page.getByRole('button',{name:'Edições recentes',exact:true}).click();
  const card=page.locator(`.recent-card[data-job-id="${editionId}"]`);await card.waitFor();assert.match(await card.textContent(),/Clínica Sorriso/);
  await card.locator('..').locator('.recent-rename').click();await page.locator('#edition-title').fill('Clínica Sorriso — Novembro');await page.locator('#rename-form button[type=submit]').click();
  await page.waitForFunction(()=>!busy&&job.title==='Clínica Sorriso — Novembro');await card.click();await page.waitForFunction(()=>!busy&&!$('studio').hidden);
  await page.evaluate(()=>{editProject(()=>{project().settings.targetMB=1;resizeClip(projectClip(),10);});});
  const grip=await page.locator('.playhead-grip').boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+3);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+45,grip.y+3,{steps:5});await page.mouse.up();
  assert.ok(await page.evaluate(()=>compositionCursor>1.8));
  // Bypass the native folder chooser only in this isolated headless test.
  await page.evaluate(folder=>{chooseFolder=async()=>folder;},output);await page.locator('#open-export').click();await page.waitForFunction(()=>!busy&&plan);
  await page.locator('#export-name').fill('VT - Arquivo exportado');await page.waitForFunction(()=>plan?.files[0]?.name==='VT - Arquivo exportado.mp4'&&!busy);
  await page.locator('#confirm-export').click();await page.locator('#export-progress-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#export-progress-title').textContent(),'Exportando VT - Arquivo exportado.mp4');
  const percents=[];while(await page.locator('#export-progress-dialog').isVisible()){
   percents.push(await page.locator('#export-progress-bar').evaluate(el=>el.value));
   if(percents.at(-1)>0&&percents.at(-1)<100)await page.screenshot({path:path.join(output,'exportando.png')});
   await page.waitForTimeout(150);
  }
  await page.waitForFunction(()=>!busy);assert.match(await page.locator('#export-result').textContent(),/✓/);
  assert.ok(percents.some(v=>v>0&&v<100),JSON.stringify(percents));assert.ok(percents.every((v,i)=>!i||v>=percents[i-1]));
  assert.equal(await page.evaluate(()=>job.title),'Clínica Sorriso — Novembro');
  assert.ok(fs.statSync(path.join(output,'VT - Arquivo exportado.mp4')).size<=1_000_000);
  // Cancel a second export while retaining the completed first file.
  const completed=fs.readFileSync(path.join(output,'VT - Arquivo exportado.mp4'));
  await page.locator('#export-name').fill('VT - Cancelado');await page.waitForFunction(()=>plan?.files[0]?.name==='VT - Cancelado.mp4'&&!busy);
  await page.locator('#confirm-export').click();await page.locator('#export-progress-dialog').waitFor({state:'visible'});
  await page.locator('#cancel-export').click();await page.locator('#export-progress-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!busy);
  assert.match(await page.locator('#export-result').textContent(),/Exportação cancelada/);
  assert.equal(fs.existsSync(path.join(output,'VT - Cancelado.mp4')),false);assert.deepEqual(fs.readFileSync(path.join(output,'VT - Arquivo exportado.mp4')),completed);
  assert.equal(fs.readdirSync(output).some(name=>name.startsWith('.indoor-')),false);assert.equal(await page.locator('#confirm-export').isEnabled(),true);
  await page.locator('[data-close="export-dialog"]').click();await page.screenshot({path:path.join(output,'editor-renomeado.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({frameSamples:pixels.length,noPosterFlashes:true,latestSeek:true,trim,audio:'button only',rename:'editor and recent',exportProgress:percents,cancellation:true,titlePreserved:true,errors}));
 }catch(error){await page.screenshot({path:path.join(output,'erro.png')});console.error(JSON.stringify({errors,job:await page.evaluate(()=>({title:job?.title,cursor:compositionCursor,players:[...compositionPlayers.values()].map(p=>({time:p.currentTime,seeking:p.seeking,ready:p.readyState,frame:p.frameReady})),toast:$('toast').textContent}))}));throw error;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
