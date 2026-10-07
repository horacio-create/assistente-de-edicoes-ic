const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const [url,video,logo,music,output]=process.argv.slice(2);fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>!busy&&project()),state=()=>page.evaluate(()=>structuredClone(projectClip().settings));
 const drag=async(x,y,dx,dy)=>{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();};
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();await page.locator('#files').setInputFiles(video);await ready();await page.waitForFunction(()=>project()?.clips.length===1);
  assert.equal(await page.locator('#media-transform-box').isVisible(),true);assert.equal(await page.locator('.media-transform-handle').count(),9);
  await page.locator('#logo-file').setInputFiles(logo);await ready();await page.waitForFunction(()=>projectMedia()?.role==='logo');
  const logoId=await page.evaluate(()=>projectClip().id),videoId=await page.evaluate(()=>project().clips.find(c=>projectMedia(c).kind==='video').id);
  assert.equal(await page.locator('#zoom').getAttribute('aria-label'),'Escala');
  const baseline=await state(),stage=await page.locator('#stage').boundingBox();
  // Pointer starts away from selected logo: neither logo nor video can move.
  const allBefore=await page.evaluate(()=>JSON.stringify(project().clips));await drag(stage.x+stage.width*.35,stage.y+stage.height*.6,35,20);assert.equal(await page.evaluate(()=>JSON.stringify(project().clips)),allBefore);
  await page.locator('#toggle-transform-controls').click();assert.equal(await page.locator('#media-transform-box').isVisible(),false);await drag(stage.x+stage.width*.35,stage.y+stage.height*.6,35,20);assert.equal(await page.evaluate(()=>JSON.stringify(project().clips)),allBefore);await page.locator('#toggle-transform-controls').click();
  let box=await page.locator('#media-transform-box').boundingBox();await drag(box.x+box.width*.6,box.y+box.height*.74,-40,25);assert.ok((await state()).x<baseline.x-.03);
  await page.locator('#montage-playhead').focus();await page.keyboard.press('Control+z');assert.ok(Math.abs((await state()).x-baseline.x)<.00001);await page.keyboard.press('Control+Shift+z');assert.ok((await state()).x<baseline.x-.03);
  const beforeScale=await state(),handle=await page.locator('.media-transform-handle.se').boundingBox();await drag(handle.x+handle.width/2,handle.y+handle.height/2,25,25);assert.ok((await state()).zoom>beforeScale.zoom);
  const rotate=page.locator('.media-transform-handle.rotate');await rotate.focus();await page.keyboard.press('ArrowRight');assert.equal((await state()).rotation,1);await page.keyboard.press('Shift+ArrowRight');assert.equal((await state()).rotation,16);
  box=await page.locator('#media-transform-box').boundingBox();const r=await rotate.boundingBox();await drag(r.x+r.width/2,r.y+r.height/2,20,20);assert.notEqual((await state()).rotation,16);
  await page.evaluate(()=>change({x:1,y:1,rotation:73,zoom:3}));await page.locator('#montage-playhead').focus();await page.keyboard.press('Home');const restored=await state();assert.equal(restored.x,0);assert.equal(restored.y,0);assert.equal(restored.rotation,0);assert.equal(restored.zoom,baseline.zoom);
  await page.evaluate(()=>change({x:.2}));await page.locator('#number-pos-x').focus();await page.keyboard.press('Home');assert.equal((await state()).x,.2);await page.locator('#montage-playhead').focus();await page.keyboard.press('Home');
  await page.locator('.track-header [data-property=locked]').first().click();assert.equal(await page.locator('.media-transform-handle.rotate').isDisabled(),true);const locked=await state();await page.keyboard.press('Home');assert.deepEqual(await state(),locked);await page.locator('.track-header [data-property=locked]').first().click();
  await page.evaluate(()=>change({lockSize:true}));assert.equal(await page.locator('.media-transform-handle.se').isDisabled(),true);await page.evaluate(()=>change({lockSize:false,rotation:27,x:.2,y:-.1}));
  if(await page.locator('#save-composition').isEnabled())await page.locator('#save-composition').click();await ready();const jobId=await page.evaluate(()=>job.id);
  await page.locator('#toggle-transform-controls').click();await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Edições recentes',exact:true}).click();await page.locator(`.recent-card[data-job-id="${jobId}"]`).click();await ready();await page.evaluate(id=>selectProjectClip(id),logoId);assert.equal((await state()).rotation,27);assert.equal(await page.locator('#media-transform-box').isVisible(),false);await page.locator('#toggle-transform-controls').click();
  // Bounds can be toggled without changing pixels that go to the export canvas.
  const pixels=await page.evaluate(()=>$('live-preview').toDataURL());await page.locator('#toggle-transform-controls').click();assert.equal(await page.evaluate(()=>$('live-preview').toDataURL()),pixels);await page.locator('#toggle-transform-controls').click();
  await page.locator('#files').setInputFiles(music);await ready();await page.waitForFunction(()=>projectMedia()?.kind==='audio');assert.equal(await page.locator('#media-transform-box').isVisible(),false);
  await page.evaluate(id=>selectProjectClip(id),videoId);assert.equal(await page.locator('#media-transform-box').isVisible(),true);assert.equal(await page.locator('#zoom').getAttribute('aria-label'),'Zoom');
  await page.evaluate(id=>selectProjectClip(id),logoId);await ready();await page.screenshot({path:path.join(output,'transform-controls.png')});
  await page.setViewportSize({width:1366,height:1400});await page.getByRole('button',{name:'Imagens',exact:true}).click();await page.locator('#files').setInputFiles(logo);await page.waitForFunction(()=>!busy&&current()?.kind==='image');assert.equal(await page.locator('#media-transform-box').isVisible(),true);
  const imageBefore=await page.evaluate(()=>structuredClone(current().settings)),imageStage=await page.locator('#stage').boundingBox();await drag(imageStage.x+5,imageStage.y+imageStage.height/2,20,10);assert.deepEqual(await page.evaluate(()=>current().settings),imageBefore);
  const imageBox=await page.locator('#media-transform-box').boundingBox();await drag(imageBox.x+imageBox.width*.6,imageBox.y+imageBox.height*.7,20,10);assert.ok((await page.evaluate(()=>current().settings.x))>0);await page.locator('#media-transform-box').focus();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>current().settings.x),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({selectedObjectOnly:true,handles:true,rotation:true,scale:true,undo:true,home:true,locks:true,persistence:true,audioHidden:true,exportUnchanged:true,errors}));
 }catch(e){await page.screenshot({path:path.join(output,'transform-error.png')});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
