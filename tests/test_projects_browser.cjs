const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const [url,sample,output]=process.argv.slice(2);fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>!busy&&project());const count=()=>page.evaluate(()=>timelines().length);const clip=()=>page.evaluate(()=>structuredClone(projectClip()));
 const screenshot=async name=>{await page.locator('#layered-timeline').hover();await page.waitForTimeout(350);await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});};
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();await page.locator('#files').setInputFiles(sample);await ready();await page.waitForFunction(()=>project()?.clips.length===1);
  const first=await page.evaluate(()=>job.meta.activeTimeline);
  await page.evaluate(()=>editProject(()=>{const c=projectClip();c.in=.123456;c.out=4.876543;c.duration=snapFrame(c.out-c.in);}));
  assert.equal(await page.locator('#trim-start').inputValue(),'0.12');assert.equal(await page.locator('#trim-end').inputValue(),'4.88');assert.equal((await clip()).out,4.876543);
  assert.equal(await page.locator('#add-segment').isVisible(),false);assert.equal(await page.locator('#split-segment').textContent(),'');
  assert.equal(await page.locator('#split-segment').evaluate(el=>getComputedStyle(el).color),'rgb(45, 49, 68)');assert.equal(await page.locator('#split-segment').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(129, 214, 128)');assert.ok(await page.locator('#split-segment').evaluate(el=>el.closest('.timeline-rail')!==null));
  await page.locator('#layered-timeline').hover();await page.waitForTimeout(350);const box=await page.locator('#layered-timeline').boundingBox();await page.mouse.move(box.x+box.width*.6,box.y+70);await page.keyboard.down('Alt');await page.mouse.wheel(0,-240);await page.keyboard.up('Alt');await page.waitForFunction(()=>timelineZoom>1);
  await page.evaluate(()=>{seekComposition(0);$('layered-timeline').scrollLeft=300;});await page.waitForFunction(()=>getComputedStyle($('montage-playhead')).visibility==='hidden');
  await page.waitForFunction(()=>$('layered-inner').querySelector('.layered-ruler').style.clipPath===`inset(0px 0px 0px ${$('layered-timeline').scrollLeft}px)`);await screenshot('zoom-sem-invadir-cabecalhos');await page.locator('#timeline-reset-zoom').click();
  // Drop an external file into the library during editing.
  const bytes=Array.from(fs.readFileSync(path.join(path.dirname(sample),'slide-yellow.png')));
  await page.locator('#media-library').evaluate((el,bytes)=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],'oferta-amarela.png',{type:'image/png'}));el.dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer:transfer}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));},bytes);
  await page.waitForFunction(()=>!busy&&job.media.length===2);assert.equal(await page.locator('.library-card').count(),2);assert.equal((await clip()).out,4.876543);
  await page.locator('#montage-playhead').focus();await page.keyboard.press('Control+c');const copied=await clip();
  await page.locator('#timeline-tab-add').click();assert.equal(await count(),2);assert.equal(await page.evaluate(()=>project().clips.length),0);
  await page.waitForFunction(()=>{const c=$('live-preview'),p=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return p[0]===0&&p[1]===0&&p[2]===0;});
  const second=await page.evaluate(()=>job.meta.activeTimeline);await page.locator('#montage-playhead').focus();await page.keyboard.press('Control+v');assert.equal((await clip()).mediaId,copied.mediaId);assert.equal((await clip()).out,copied.out);assert.notEqual((await clip()).id,copied.id);
  await page.locator('#queue-add').click();await page.waitForFunction(()=>!busy&&exportQueue().length===1);assert.equal(await page.locator('#queue-count').textContent(),'01');const queued=await page.evaluate(()=>structuredClone(exportQueue()[0]));
  await page.evaluate(()=>commitClipDuration(projectClip().duration*2));assert.equal(await page.evaluate(()=>exportQueue()[0].composition.clips[0].duration),queued.composition.clips[0].duration);
  await page.locator(`#timeline-tabs [data-timeline-id="${second}"]`).dblclick();await page.locator('#timeline-name').fill('Ofertas da manhã');await page.locator('#timeline-rename-confirm').click();assert.match(await page.locator(`#timeline-tabs [data-timeline-id="${second}"]`).textContent(),/Ofertas da manhã/);
  await page.locator(`#timeline-tabs [data-timeline-id="${first}"]`).dblclick();await page.locator('#timeline-name').fill('Ofertas da tarde');await page.locator('#timeline-rename-confirm').click();assert.match(await page.locator(`#timeline-tabs [data-timeline-id="${first}"]`).textContent(),/Ofertas da tarde/);
  await page.locator(`#timeline-tabs [data-timeline-id="${first}"]`).click();assert.equal((await clip()).duration,copied.duration);await page.locator('#queue-add').click();await page.waitForFunction(()=>!busy&&exportQueue().length===2);assert.equal(await page.locator('#queue-count').textContent(),'02');
  await page.locator('#edition-tab').click();assert.equal(await page.locator('.timeline-entry').count(),2);await page.locator(`[data-timeline-id="${second}"] .timeline-delete`).click();assert.equal(await count(),1);assert.equal(await page.evaluate(()=>exportQueue().length),2);
  await page.locator('#new-timeline').click();assert.equal(await page.evaluate(()=>activeTimeline().name),'Timeline 02');await page.locator('#new-timeline').click();await page.locator('#new-timeline').click();await page.locator('#new-timeline').click();assert.equal(await count(),5);
  await page.evaluate(()=>{for(const id of timelines().slice(2).map(t=>t.id))deleteTimeline(id);});assert.equal(await count(),2);await page.locator('#new-timeline').click();assert.equal(await page.evaluate(()=>activeTimeline().name),'Timeline 03');
  await page.locator('#montage-playhead').focus();await page.keyboard.press('Control+z');assert.equal(await count(),2);await page.keyboard.press('Control+y');assert.equal(await count(),3);
  await page.locator('#queue-open').click();assert.equal(await page.locator('.queue-entry').count(),2);await page.locator('#queue-close').click();await page.locator('#save-composition').click();await ready();const jobId=await page.evaluate(()=>job.id);
  await page.getByRole('button',{name:'Edições recentes',exact:true}).click();await page.locator(`.recent-card[data-job-id="${jobId}"]`).click();await ready();assert.equal(await count(),3);assert.equal(await page.evaluate(()=>exportQueue().length),2);
  // Queue export uses saved snapshots even while the current timeline is empty.
  await page.evaluate(()=>info.nativePicker=false);await page.locator('#open-export').click();await page.locator('#remote-path').fill(output);await page.locator('#use-remote-folder').click();await page.locator('#export-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>!busy&&plan?.files.length===2);
  await page.locator('#export-name').fill('VT - Supermercado - Ofertas 07 a 09.10');await page.waitForFunction(()=>plan?.files[0]?.name==='VT 01 - Supermercado - Ofertas 07 a 09.10.mp4');assert.equal(await page.evaluate(()=>plan.files[1].name),'VT 02 - Supermercado - Ofertas 07 a 09.10.mp4');
  await page.locator('#preview-next').click();assert.match(await page.locator('#preview-index').textContent(),/2 \/ 2/);assert.equal(await page.evaluate(()=>Number($('final-video-scrub').max)),copied.duration);
  await page.locator('#confirm-export').click();await page.locator('#export-progress-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>!busy&&exportQueue().length===0&&$('export-result').textContent.includes('✓'),null,{timeout:90000});
  assert.equal(await page.locator('#queue-count').textContent(),'00');for(const n of ['01','02'])assert.ok(fs.existsSync(path.join(output,`VT ${n} - Supermercado - Ofertas 07 a 09.10.mp4`)));
  await page.locator('[data-close="export-dialog"]').click();await page.locator('#edition-tab').click();await screenshot('projeto-com-timelines');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({decimals:true,zoomGutter:true,externalDrop:true,greenIconRail:true,timelines:'empty, rename, delete, numbering, undo, persist',copyPaste:true,queue:'snapshots, counter, numbered names, preview, export, clear',errors}));
 }catch(error){await page.screenshot({path:path.join(output,'project-error.png')});console.error(JSON.stringify({errors,state:await page.evaluate(()=>({busy,kind:editorKind,job:job?.id,timelines:job?.meta?.timelines?.length,queue:job?.meta?.exportQueue?.length,toast:$('toast').textContent}))}));throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
