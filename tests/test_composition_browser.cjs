// Isolated server only. SAMPLE is a five-second video; images sit beside it.
const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const [url,sample,output]=process.argv.slice(2);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 const state=()=>page.evaluate(()=>structuredClone(project()));
 const ready=()=>page.waitForFunction(()=>!busy&&project()?.clips.length>0);
 const focus=()=>page.locator('#montage-playhead').focus();
 const seek=async time=>{await page.locator('#montage-scrub').fill(String(time));await page.locator('#montage-scrub').blur();};
 const screenshot=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.screenshot({path:path.join(output,name+'.png'),fullPage:true,animations:'disabled'});};
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();
  await page.route('**/api/upload?**',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
  await page.locator('#files').setInputFiles(sample);await page.locator('#media-import-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('.loading-dots i').count(),8);await screenshot('adicionando-midia');await ready();
  assert.equal((await state()).clips.length,1);assert.equal((await state()).tracks.length,1);
  assert.equal(await page.locator('.library-card').count(),1);
  const positions=await page.evaluate(()=>({slider:$('composition-position').getBoundingClientRect().top,preview:document.querySelector('.canvas-shell').getBoundingClientRect().bottom,timeline:$('video-timeline').getBoundingClientRect().top}));
  assert.ok(positions.slider>=positions.preview&&positions.slider<positions.timeline);
  await seek(1);await focus();await page.keyboard.press('c');assert.equal((await state()).clips.length,2);
  await seek(3);await focus();await page.keyboard.press('c');assert.equal((await state()).clips.length,3);
  await page.locator('.layer-clip').filter({hasText:'3,00 s'}).count();
  await page.evaluate(()=>selectProjectClip(project().clips.find(c=>c.at===1).id));await focus();await page.keyboard.press('Delete');
  assert.equal((await state()).clips.length,2);assert.equal(await page.evaluate(()=>projectDuration()),3);
  await page.keyboard.press('Control+z');assert.equal((await state()).clips.length,3);await page.keyboard.press('Control+Shift+z');assert.equal((await state()).clips.length,2);
  await page.evaluate(()=>selectProjectClip(project().clips.find(c=>c.in===3).id));await focus();await page.keyboard.press('Control+ArrowLeft');
  assert.equal((await state()).clips.find(c=>c.in===3).at,0);
  // Drag this part vertically into the generous empty area to create a layer.
  await page.locator('#layered-timeline').evaluate(el=>el.scrollIntoView({block:'center'}));await page.locator('.layer-clip.selected').hover({position:{x:10,y:20}});const clip=await page.locator('.layer-clip.selected').boundingBox(),blank=await page.locator('.new-track-drop').boundingBox();
  await page.mouse.move(clip.x+clip.width*.25,clip.y+clip.height*.5);await page.mouse.down();await page.mouse.move(clip.x+clip.width*.25,blank.y+blank.height*.5,{steps:12});
  assert.equal(await page.locator('#composition-snap-line').isVisible(),true,JSON.stringify(await page.evaluate(({clip,blank})=>({clip,blank,drag:compositionDrag?{id:compositionDrag.id,started:compositionDrag.started,at:compositionDrag.at,newTrack:compositionDrag.newTrack}:null,target:document.elementFromPoint(clip.x+clip.width*.25,clip.y+clip.height*.5)?.outerHTML.slice(0,250)}),{clip,blank})));await page.mouse.up();
  await page.waitForFunction(()=>project().tracks.length===2);assert.equal((await state()).clips.find(c=>c.in===3).at,0);
  const top=page.locator('.composition-track').first();await top.locator('[data-property="locked"]').click();assert.equal(await page.locator('#remove-segment').isDisabled(),true);
  await focus();await page.keyboard.press('c');assert.equal((await state()).clips.length,2);await page.keyboard.press('Control+z');assert.equal((await state()).tracks[1].locked,false);
  await top.locator('[data-property="previewVisible"]').click();assert.equal((await state()).tracks[1].previewVisible,false);
  await focus();await page.keyboard.press('Control+z');assert.equal((await state()).tracks[1].previewVisible,true);
  const image=path.join(path.dirname(sample),'slide-green.png'),secondImage=path.join(path.dirname(sample),'slide-yellow.png');
  await page.locator('#files').setInputFiles([{name:'outro-video.mp4',mimeType:'video/mp4',buffer:fs.readFileSync(sample)},{name:'slide-green.png',mimeType:'image/png',buffer:fs.readFileSync(image)}]);await ready();
  assert.equal(await page.locator('.library-card').count(),3);assert.equal((await state()).clips.length,2);
  // Prepare an image's duration, then drag its selection into the original row.
  await page.locator('.library-card').filter({hasText:'slide-green.png'}).dblclick();await page.locator('#source-dialog').waitFor({state:'visible'});
  await page.locator('#source-image-duration').fill('5');await page.locator('#source-keep').click();
  const lane=page.locator('.track-lane').last();await lane.scrollIntoViewIfNeeded();
  await page.locator('.library-card').filter({hasText:'slide-green.png'}).dragTo(lane,{targetPosition:{x:56,y:42}});
  await page.waitForFunction(()=>project().clips.some(c=>projectMedia(c).kind==='image'));
  assert.equal(await page.evaluate(()=>project().clips.find(c=>projectMedia(c).kind==='image').duration),5);
  // Double-click the other video; its in/out selection becomes a reusable source.
  await page.locator('.library-card').filter({hasText:'outro-video.mp4'}).dblclick();await page.locator('#source-in').fill('1');await page.locator('#source-out').fill('3');await page.locator('#source-keep').click();
  await page.locator('.new-track-drop').scrollIntoViewIfNeeded();await page.locator('.library-card').filter({hasText:'outro-video.mp4'}).dragTo(page.locator('.new-track-drop'),{targetPosition:{x:96,y:40}});
  await page.waitForFunction(()=>project().tracks.length===3);
  assert.equal(await page.evaluate(()=>project().clips.find(c=>projectMedia(c).name==='outro-video.mp4').in),1);
  assert.equal(await page.evaluate(()=>project().clips.find(c=>projectMedia(c).name==='outro-video.mp4').out),3);
  await focus();await page.keyboard.press('r');assert.equal(await page.evaluate(()=>projectClip().settings.rotation),90);await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>projectClip().settings.rotation),0);
  await seek(2.5);await page.waitForFunction(()=>{const clip=project().clips.find(c=>projectMedia(c).name==='outro-video.mp4'),player=compositionPlayers.get(clip.id);return player?.readyState>=2&&!player.seeking&&Math.abs(player.currentTime-(clip.in+(compositionCursor-clip.at)*(clip.out-clip.in)/clip.duration))<.08;});
  await seek(5);await page.waitForFunction(()=>{const c=$('live-preview'),rgb=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return rgb[1]>200&&rgb[0]<30&&rgb[2]<30;});
  await page.locator('#video-size').fill('.5');await page.locator('#video-size').blur();await focus();await page.keyboard.press('m');assert.equal((await state()).settings.mute,true);
  await screenshot('editor-faixas-biblioteca');
  await seek(0);await focus();await page.keyboard.press('Space');await page.waitForFunction(()=>compositionPlaying&&compositionCursor>.4);await page.keyboard.press('Space');
  await focus();await page.keyboard.press('Control+s');await page.waitForFunction(()=>!busy&&!dirty);const expected=await state();
  await page.evaluate(()=>{info.nativePicker=false;});await focus();await page.keyboard.press('Control+e');await page.locator('#remote-path').fill(output);await page.locator('#use-remote-folder').click();await page.waitForFunction(()=>!busy&&plan!==null);
  await page.locator('#final-video-play').click();await page.waitForFunction(()=>compositionFinalPlaying&&compositionFinalTime>.4);await page.locator('#final-video-play').click();
  if(await page.locator('#overwrite-label').isVisible())await page.locator('#overwrite').check();await page.locator('#confirm-export').click();await page.waitForFunction(()=>!busy&&$('export-result').textContent.startsWith('✓'),{},{timeout:60000});
  const exported=fs.readdirSync(output).find(n=>n.endsWith('.mp4'));assert.ok(exported);assert.ok(fs.statSync(path.join(output,exported)).size<=500000);
  await page.locator('[data-close="export-dialog"]').click();await page.getByRole('button',{name:'Edições recentes',exact:true}).click();await page.locator('.recent-card').first().click();await ready();
  assert.deepEqual((await state()).clips.map(c=>({mediaId:c.mediaId,at:c.at,duration:c.duration,track:c.track})),expected.clips.map(c=>({mediaId:c.mediaId,at:c.at,duration:c.duration,track:c.track})));
  await page.locator('.library-card').filter({hasText:'outro-video.mp4'}).dblclick();assert.equal(await page.locator('#source-in').inputValue(),'1');assert.equal(await page.locator('#source-out').inputValue(),'3');await page.locator('[data-close="source-dialog"]').click();
  // Legacy saved single-source montages retain dimensions, source order and locks.
  await page.evaluate(async()=>{const original=job.media.find(m=>m.kind==='video');let legacy=await request('/api/jobs',{kind:'video'});const raw=await (await fetch('/video/'+original.id)).blob();const response=await fetch(`/api/upload?job=${legacy.id}&revision=0&name=legado.mp4`,{method:'POST',headers:{'X-Indoor':'1'},body:raw});legacy=(await response.json()).job;legacy.title='Legado 1.8';Object.assign(legacy.media[0].settings,{width:720,height:1280,screenPreset:'720x1280',aspectRatio:9/16,segments:[{start:3,end:4,locked:true},{start:0,end:1}],previewVisible:false});await request('/api/save',legacy);});
  await page.getByRole('button',{name:'Edições recentes',exact:true}).click();await page.locator('.recent-card').filter({hasText:'Legado 1.8'}).click();await ready();const legacy=await state();assert.equal(legacy.settings.width,720);assert.equal(legacy.settings.height,1280);assert.deepEqual(legacy.clips.map(c=>[c.in,c.out,c.locked]),[[3,4,true],[0,1,false]]);assert.equal(legacy.tracks[0].previewVisible,false);
  // A project made only from images starts as a static fifteen-second video.
  await page.locator('#new-job').click();await page.waitForFunction(()=>!busy&&job?.media.length===0);await page.locator('#files').setInputFiles(image);await ready();assert.equal(await page.evaluate(()=>projectDuration()),15);
  await page.locator('#files').setInputFiles(secondImage);await ready();assert.equal((await state()).clips.length,1);
  await page.locator('.library-card').filter({hasText:'slide-yellow.png'}).dblclick();await page.locator('#source-image-duration').fill('5');await page.locator('#source-add').click();assert.equal(await page.evaluate(()=>projectDuration()),20);
  await page.evaluate(()=>selectProjectClip(project().clips[0].id));await page.locator('#clip-duration').fill('10');await page.locator('#clip-duration').blur();assert.equal(await page.evaluate(()=>projectDuration()),15);
  await page.locator('#number-zoom').fill('150');await page.locator('#number-zoom').blur();assert.equal(await page.evaluate(()=>projectClip().settings.zoom),1.5);await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>projectClip().settings.zoom),1);
  await screenshot('apresentacao-imagens');await page.setViewportSize({width:800,height:1000});await screenshot('editor-800');
  await page.getByRole('button',{name:'Imagens',exact:true}).click();await page.waitForFunction(()=>!busy&&editorKind==='image');await page.locator('#files').setInputFiles(image);await page.waitForFunction(()=>!busy&&current()?.kind==='image');
  await page.locator('#number-zoom').fill('150');await page.locator('#number-zoom').blur();assert.equal(await page.evaluate(()=>current().settings.zoom),1.5);await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>current().settings.zoom),1);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({composition:'passed',layers:'passed',library:'passed',loading:'passed',sources:'passed',images:'passed',shortcuts:'passed',errors,exported}));
 }catch(e){
  console.error(JSON.stringify({errors,state:await page.evaluate(()=>({busy,editorKind,job:job?.id,selected:compositionSelected,time:compositionCursor,focus:document.activeElement?.id}))}));await screenshot('erro-composicao');throw e;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
