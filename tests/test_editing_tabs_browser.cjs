const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const [url,video,image,output]=process.argv.slice(2);fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
 const ready=()=>page.waitForFunction(()=>!busy&&job),tab=id=>page.locator(`#editing-tabs .editing-tab[data-job-id="${id}"] .editing-tab-select`);
 const jobs=[],data=fs.readFileSync(video);let timings=[];
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();
  for(let i=0;i<5;i++){
   if(i){await page.locator('#editing-tab-add').click();await ready();}
   await page.locator('#files').setInputFiles(Array.from({length:10},(_,n)=>({name:`Edicao-${i+1}-Video-${n+1}.mp4`,mimeType:'video/mp4',buffer:data})));
   await page.waitForFunction(()=>!busy&&job?.media.length===10);
   await page.evaluate(async i=>{job=await request('/api/rename',{id:job.id,revision:job.revision,title:'Edição '+(i+1)});syncEditionName();change({rotation:i*30});},i);
   await page.locator('#apply-all').click();await page.waitForFunction(()=>!busy&&timelines().length===10);await page.locator('#reuse-timelines-dialog .close').click();
   await page.evaluate(async()=>await save());jobs.push(await page.evaluate(()=>({id:job.id,timelines:timelines().map(t=>t.id),rotation:projectClip().settings.rotation})));
  }
  assert.equal(await page.locator('#editing-tabs [role=tab]').count(),5);
  const workload=await page.evaluate(async jobs=>{const all=await Promise.all(jobs.map(j=>request('/api/job?id='+j.id)));return all.reduce((sum,j)=>sum+j.meta.timelines.length,0);},jobs);assert.equal(workload,50);
  await page.locator('#editing-tab-add').click();await page.locator('#editing-tabs-limit').waitFor({state:'visible'});assert.equal(await page.locator('#editing-tabs [role=tab]').count(),5);await page.locator('#editing-tabs-back').click();
  for(let round=0;round<2;round++)for(const j of jobs){const start=Date.now();await tab(j.id).click();await ready();assert.equal(await page.evaluate(()=>job.id),j.id);assert.equal(await page.evaluate(()=>timelines().length),10);assert.equal(await page.evaluate(()=>projectClip().settings.rotation),j.rotation);
   for(const id of j.timelines){await page.evaluate(id=>switchTimeline(id),id);assert.equal(await page.evaluate(()=>job.meta.activeTimeline),id);await page.waitForFunction(()=>{const p=compositionPlayers.get(projectClip()?.id);return !!p&&p.frameReady&&p.readyState>=2;});}
   assert.equal(await page.evaluate(()=>compositionPlayers.size>0),true);assert.equal(await page.evaluate(()=>[...compositionPlayers.keys()].every(k=>project().clips.some(c=>c.id===k))),true);timings.push(Date.now()-start);
  }
  const last=jobs.at(-1);await page.evaluate(()=>switchTimeline(timelines()[0].id));await page.locator('#clip-rotation').fill('0');await page.locator('#clip-rotation').press('Tab');const h=await page.locator('#clip-scale-height').inputValue();await page.locator('#clip-proportion-lock').click();assert.equal(await page.locator('#clip-proportion-lock').getAttribute('aria-pressed'),'false');
  const width=Number(await page.locator('#clip-scale-width').inputValue());await page.locator('#clip-scale-width').fill(String(width/2));await page.locator('#clip-scale-width').press('Tab');assert.equal(await page.locator('#clip-scale-height').inputValue(),h);assert.equal(await page.evaluate(()=>projectClip().settings.scaleX),.5);
  await tab(jobs[0].id).click();await ready();await tab(last.id).click();await ready();assert.equal(await page.evaluate(()=>projectClip().settings.scaleX),.5);
  await page.locator('#layered-timeline').click({position:{x:500,y:250}});await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>projectClip().settings.scaleX),1);await page.keyboard.press('Control+y');assert.equal(await page.evaluate(()=>projectClip().settings.scaleX),.5);
  await page.locator('[data-transform=horizontal]').click();assert.equal(await page.evaluate(()=>projectClip().settings.flipH),true);await page.locator('[data-transform=vertical]').click();assert.equal(await page.evaluate(()=>projectClip().settings.flipV),true);
  await page.locator('[data-transform=horizontal]').hover();assert.match(await page.locator('[data-transform=horizontal]').getAttribute('data-help'),/^Espelhar horizontalmente/);
  await page.locator('#clip-rotation').fill('-90');await page.locator('#clip-rotation').press('Tab');assert.equal(await page.evaluate(()=>projectClip().settings.rotation),-90);assert.equal(await page.locator('.rotation-actions [data-transform]').count(),2);assert.equal(await page.locator('.rotation-field').evaluate(e=>e.getBoundingClientRect().width<=85),true);
  assert.equal(await page.locator('.presetbar>.dimensions').isVisible(),false);await page.locator('[data-preset=custom]').click();await page.locator('#output-size-dialog').waitFor({state:'visible'});await page.locator('#custom-output-cancel').click();
  await page.evaluate(async()=>await save());await page.screenshot({path:path.join(output,'five-tabs-fifty-timelines.png'),animations:'disabled'});
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();await ready();assert.equal(await page.locator('#editing-tabs [role=tab]').count(),5);await tab(last.id).click();await ready();assert.equal(await page.evaluate(()=>projectClip().settings.scaleX),.5);
  await page.locator(`#editing-tabs [data-job-id="${jobs[0].id}"] .editing-tab-close`).click();await page.waitForFunction(()=>!busy&&editingTabs.size===4);const kept=await page.evaluate(id=>request('/api/job?id='+id),jobs[0].id);assert.equal(kept.meta.timelines.length,10);
  await page.locator('#editing-tab-add').click();await ready();assert.equal(await page.locator('#editing-tabs [role=tab]').count(),5);await page.locator('#editing-tabs .editing-tab.active .editing-tab-close').click();await page.waitForFunction(()=>!busy&&editingTabs.size===4);await page.locator('#editing-tab-add').click();await ready();await page.locator('#editing-tab-add').click();await page.locator('#editing-tabs-restart').click();await page.waitForFunction(()=>!busy&&editingTabs.size===1);assert.equal(await page.locator('#editing-tabs [role=tab]').count(),1);
  await page.getByRole('button',{name:'Imagens',exact:true}).click();await page.waitForFunction(()=>!busy&&editorKind==='image');await page.locator('#files').setInputFiles(image);await page.waitForFunction(()=>!busy&&job?.media.length===1);await page.locator('[data-transform=horizontal]').click();assert.equal(await page.evaluate(()=>current().settings.flipH),true);assert.equal(await page.locator('[data-transform=horizontal] svg').count(),1);assert.equal(await page.locator('.presetbar>.dimensions').isVisible(),true);
  await page.getByRole('button',{name:'Vídeos',exact:true}).click();await ready();assert.equal(await page.locator('#editing-tabs [role=tab]').count(),1);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({editions:5,timelines:workload,tabAndTimelineSwitches:100,decodedPreviews:100,saveReload:true,undoPerTab:true,freeScale:true,flipBothEditors:true,limitAndRestart:true,closedEditionsKept:true,switchRunsMs:timings,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
