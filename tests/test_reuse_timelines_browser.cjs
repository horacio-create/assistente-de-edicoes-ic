const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const [url,sample]=process.argv.slice(2);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();
  const buffer=fs.readFileSync(sample);
  await page.locator('#files').setInputFiles(Array.from({length:12},(_,i)=>({name:`Oferta ${String(i+1).padStart(2,'0')}.mp4`,mimeType:'video/mp4',buffer})));
  await page.waitForFunction(()=>!busy&&job.media.length===12&&project()?.clips.length===1);
  await page.evaluate(()=>editProject(()=>{const c=projectClip();c.in=1;c.out=3;c.duration=2;c.settings.rotation=270;}));
  await page.locator('#queue-add').click();await page.waitForFunction(()=>!busy&&exportQueue().length===1);
  await page.locator('#apply-all').click();await page.locator('#reuse-timelines-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>!busy);
  assert.match(await page.locator('#reuse-timelines-details').textContent(),/Oferta 11/);assert.match(await page.locator('#reuse-timelines-details').textContent(),/Oferta 12/);
  const state=await page.evaluate(()=>({timelines:timelines(),media:job.media,queue:exportQueue()}));
  assert.equal(state.timelines.length,10);
  for(let i=0;i<10;i++){const c=state.timelines[i].composition.clips[0];assert.equal(c.mediaId,state.media[i].id);assert.equal(c.in,1);assert.equal(c.out,3);assert.equal(c.duration,2);assert.equal(c.settings.rotation,270);}
  assert.equal(new Set(state.timelines.map(t=>t.composition.clips[0].id)).size,10);
  assert.equal(state.queue[0].composition.clips[0].settings.rotation,270);
  await page.locator('#reuse-timelines-dialog .close').click();
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>timelines().length===1);
  await page.keyboard.press('Control+y');await page.waitForFunction(()=>timelines().length===10);
  await page.locator('#timeline-tab-add').click();await page.waitForFunction(()=>$('toast').textContent.includes('10 timelines'));assert.equal(await page.evaluate(()=>timelines().length),10);
  await page.evaluate(()=>save());await page.waitForFunction(()=>!busy);
  const id=await page.evaluate(()=>job.id);await page.evaluate(async id=>{await loadRecent();document.querySelector('[data-job-id="'+id+'"]').click();},id);await page.waitForFunction(()=>!busy&&timelines().length===10);
  assert.equal(await page.evaluate(()=>project().clips[0].settings.rotation),270);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({nineIndependentCopies:true,limitAndExcludedNames:true,cutsRotationAndQueue:true,undoRedo:true,savedAndReopened:true,errors}));
 }catch(e){console.error(JSON.stringify({errors,state:await page.evaluate(()=>({busy,toast:$('toast').textContent,timelines:job?.meta?.timelines?.length}))}));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
