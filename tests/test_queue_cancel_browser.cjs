const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const [url,image,output]=process.argv.slice(2);fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();await page.locator('#files').setInputFiles(image);await page.waitForFunction(()=>!busy&&project()?.clips.length===1);
  await page.evaluate(()=>commitClipDuration(1));await page.locator('#queue-add').click();await page.waitForFunction(()=>!busy&&exportQueue().length===1);
  await page.evaluate(()=>commitClipDuration(120));await page.locator('#queue-add').click();await page.waitForFunction(()=>!busy&&exportQueue().length===2);
  await page.evaluate(()=>info.nativePicker=false);await page.locator('#open-export').click();await page.locator('#remote-path').fill(output);await page.locator('#use-remote-folder').click();await page.waitForFunction(()=>!busy&&plan?.files.length===2);
  await page.locator('#export-name').fill('VT - Cancelamento de fila');await page.waitForFunction(()=>plan?.files[0]?.name==='VT 01 - Cancelamento de fila.mp4');await page.locator('#confirm-export').click();
  await page.waitForFunction(()=>$('export-progress-dialog').open&&$('export-progress-title').textContent.includes('VT 02 -'),null,{timeout:60000});
  await page.screenshot({path:path.join(output,'cancelando-segundo-item.png')});await page.locator('#cancel-export').click();await page.waitForFunction(()=>!busy&&exportQueue().length===1&&plan?.files.length===1);
  assert.match(await page.locator('#export-result').textContent(),/Exportação cancelada/);assert.equal(await page.evaluate(()=>exportQueue()[0].number),2);assert.equal(await page.locator('#queue-count').textContent(),'01');assert.equal(await page.evaluate(()=>plan.files[0].name),'VT 02 - Cancelamento de fila.mp4');
  assert.ok(fs.existsSync(path.join(output,'VT 01 - Cancelamento de fila.mp4')));assert.equal(fs.existsSync(path.join(output,'VT 02 - Cancelamento de fila.mp4')),false);assert.equal(fs.readdirSync(output).some(name=>name.startsWith('.indoor-')),false);assert.equal(await page.locator('#confirm-export').isEnabled(),true);
  await page.locator('[data-close="export-dialog"]').click();const jobId=await page.evaluate(()=>job.id);await page.getByRole('button',{name:'Edições recentes',exact:true}).click();await page.locator(`.recent-card[data-job-id="${jobId}"]`).click();await page.waitForFunction(()=>!busy&&exportQueue().length===1);
  assert.equal(await page.evaluate(()=>exportQueue()[0].number),2);assert.deepEqual(errors,[]);console.log(JSON.stringify({cancelDuringSecond:true,completedFilePreserved:true,pendingSnapshotSaved:true,numberPreserved:'VT 02',retryEnabled:true,errors}));
 }catch(error){await page.screenshot({path:path.join(output,'cancel-error.png')});console.error(JSON.stringify({errors,state:await page.evaluate(()=>({busy,queue:exportQueue().map(q=>q.number),toast:$('toast').textContent,progress:$('export-progress-title').textContent}))}));throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
