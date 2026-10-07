const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const [url,video,music,output]=process.argv.slice(2);fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>!busy&&project());
 try{
  await page.addInitScript(()=>Object.defineProperty(crypto,'randomUUID',{value:undefined}));
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();await page.locator('#files').setInputFiles(video);await ready();await page.waitForFunction(()=>project()?.clips.length===1);
  const visualId=await page.evaluate(()=>projectClip().id),first=await page.evaluate(()=>job.meta.activeTimeline);
  await page.locator('#files').setInputFiles(music);await ready();await page.waitForFunction(()=>project()?.clips.length===2);
  assert.deepEqual(await page.locator('.track-header>strong').allTextContents(),['Vídeo 01','Áudio 01']);
  assert.equal(await page.locator('.audio-track [data-property=previewVisible]').count(),0);assert.equal(await page.locator('.audio-track [data-property=muted]').count(),1);
  assert.equal(await page.locator('.audio-waveform path').count(),1);assert.ok((await page.locator('.audio-waveform path').getAttribute('d')).length>5000);
  assert.deepEqual(await page.locator('.media-type-badge').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label'))),['Vídeo','Áudio']);
  assert.equal(await page.locator('.media-type-badge').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(129, 214, 128)');assert.equal(await page.locator('.media-type-badge').last().evaluate(el=>getComputedStyle(el).color),'rgb(45, 49, 68)');
  await page.locator('.audio-clip.selected').dblclick();assert.equal(await page.locator('#clip-trim-in').isVisible(),true);await page.locator('#clip-trim-dialog .close').click();assert.equal(await page.locator('#mode').isVisible(),false);
  await page.locator('.library-card').last().dblclick();await page.locator('#source-dialog').waitFor({state:'visible'});assert.ok(await page.locator('#source-video').getAttribute('src').then(s=>s.startsWith('/audio/')));await page.waitForFunction(()=>$('source-video').readyState>=1);await page.locator('[data-close="source-dialog"]').click();
  await page.locator('#montage-current-time').fill('1,50');await page.locator('#montage-current-time').press('Enter');await page.locator('#split-segment').click();assert.equal(await page.locator('.audio-clip').count(),2);
  await page.locator('.audio-track [data-property=muted]').click();assert.equal(await page.evaluate(()=>project().tracks.find(t=>t.kind==='audio').muted),true);
  await page.locator('#montage-playhead').focus();await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>project().tracks.find(t=>t.kind==='audio').muted),false);
  await page.keyboard.press('Control+c');const copied=await page.evaluate(()=>projectClip().mediaId);
  await page.locator('#timeline-tab-add').click();await page.locator('#montage-playhead').focus();await page.keyboard.press('Control+v');assert.equal(await page.evaluate(()=>projectClip().mediaId),copied);assert.equal(await page.evaluate(()=>projectTrack().kind),'audio');
  const second=await page.evaluate(()=>job.meta.activeTimeline);await page.locator(`#timeline-tabs [data-timeline-id="${first}"]`).click();
  await page.evaluate(id=>selectProjectClip(id),visualId);assert.equal(await page.locator('#mode').isVisible(),true);
  // Resize by pointer and keyboard, retaining a visible preview and timeline.
  const divider=page.locator('#library-resizer'),box=await divider.boundingBox(),before=await page.locator('#media-library').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+80,box.y+box.height/2);await page.mouse.up();
  assert.ok((await page.locator('#media-library').boundingBox()).width>before.width+60);
  await divider.focus();await page.keyboard.press('ArrowRight');const width=await page.locator('#media-library').boundingBox();assert.ok(width.width>before.width+80);
  const horizontal=await page.locator('#timeline-resizer').boundingBox(),oldTimeline=await page.locator('#video-timeline').boundingBox();await page.mouse.move(horizontal.x+horizontal.width/2,horizontal.y+4);await page.mouse.down();await page.mouse.move(horizontal.x+horizontal.width/2,horizontal.y-80);await page.mouse.up();
  assert.ok((await page.locator('#video-timeline').boundingBox()).height>oldTimeline.height+60);assert.ok((await page.locator('#editor .canvas-shell').boundingBox()).height>100);
  for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:1024,height:768}]){await page.setViewportSize(viewport);await page.waitForTimeout(250);const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollHeight,view:innerHeight,t:$('video-timeline').getBoundingClientRect().bottom,e:document.querySelector('.export-bar').getBoundingClientRect().top}));assert.ok(metrics.scroll<=metrics.view+1,JSON.stringify(metrics));assert.ok(metrics.t<=metrics.e,JSON.stringify(metrics));}
  await page.setViewportSize({width:1366,height:768});await page.locator('#queue-add').click();await ready();await page.locator('#queue-open').click();assert.equal(await page.locator('.queue-audio-state').evaluate(el=>getComputedStyle(el).fontWeight),'700');
  for(const selector of ['#queue-close','.queue-entry>button']){const centered=await page.locator(selector).evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('svg').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1&&Math.abs(a.y+a.height/2-b.y-b.height/2)<1;});assert.ok(centered,selector);}
  await page.locator('#queue-close').click();if(await page.locator('#save-composition').isEnabled())await page.locator('#save-composition').click();await ready();const jobId=await page.evaluate(()=>job.id);
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Edições recentes',exact:true}).click();await page.locator(`.recent-card[data-job-id="${jobId}"]`).click();await ready();assert.equal(await page.locator('.audio-clip').count(),2);assert.equal(await page.evaluate(id=>timelines().some(t=>t.id===id),second),true);assert.ok((await page.locator('#media-library').boundingBox()).width>220);
  // Audition the added source and verify the preview pool uses real audio elements.
  await page.locator('#video-play').click();await page.waitForTimeout(700);assert.ok(await page.evaluate(()=>[...compositionPlayers.values()].some(p=>p.tagName==='AUDIO'&&p.readyState>=2&&!p.paused)));await page.locator('#video-play').click();
  await page.locator('#layered-timeline').hover();await page.waitForTimeout(100);await page.screenshot({path:path.join(output,'audio-timeline-panels.png')});
  await page.evaluate(()=>info.nativePicker=false);await page.locator('#open-export').click();await page.locator('#remote-folder-dialog summary').click();await page.locator('#remote-path').fill(output);await page.locator('#use-remote-folder').click();await page.locator('#export-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>!busy&&plan?.files.length===1);
  await page.locator('#export-name').fill('VT - Music panel test');await page.waitForFunction(()=>plan?.files[0]?.name==='VT 01 - Music panel test.mp4');await page.locator('#confirm-export').click();await page.waitForFunction(()=>!busy&&exportQueue().length===0&&$('export-result').textContent.includes('✓'),null,{timeout:90000});assert.ok(fs.existsSync(path.join(output,'VT 01 - Music panel test.mp4')));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({audioImport:true,waveforms:true,separateTracks:true,muteUndo:true,audioClipboard:true,resizers:true,persistence:true,iconsCentered:true,errors}));
 }catch(error){await page.screenshot({path:path.join(output,'audio-ui-error.png')});console.error(JSON.stringify({errors,state:await page.evaluate(()=>({busy,kind:editorKind,toast:$('toast').textContent,clips:project()?.clips,tracks:project()?.tracks}))}));throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
