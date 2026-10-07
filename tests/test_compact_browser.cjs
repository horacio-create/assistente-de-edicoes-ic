// Run only against an isolated server and synthetic sample media.
const {chromium}=require(process.env.INDOOR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const [url,sample,output]=process.argv.slice(2);fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1902,height:911}}),errors=[];
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const stable=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const shot=async name=>{await stable();await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});};
 const geometry=()=>page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};return {page:document.documentElement.scrollHeight,height:innerHeight,header:box('main>header'),presets:box('.presetbar'),preview:box('.canvas-shell'),stage:box('#stage'),controls:box('#composition-position'),timeline:box('#video-timeline'),adjustments:box('.adjustments'),footer:box('.export-bar'),gap:box('#video-timeline').top-box('.canvas-shell').bottom};});
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Vídeos',exact:true}).click();
  await page.locator('#files').setInputFiles(sample);await page.waitForFunction(()=>!busy&&project()?.clips.length===1);
  await page.locator('#editor .canvas-shell').hover();assert.equal(await page.locator('.composition-track').count(),1);
  assert.equal(await page.locator('#mode-help').isVisible(),false);assert.equal(await page.locator('.video-timeline>.help').isVisible(),false);
  // Additional tracks must stay inside the timeline, including at the export bar.
  await page.evaluate(()=>{editProject(()=>{for(let i=1;i<4;i++){const track={id:freshId(),locked:false,previewVisible:true};project().tracks.push(track);const clip=structuredClone(project().clips[0]);clip.id=freshId();clip.track=track.id;project().clips.push(clip);}});updateCounts();});
  for(const [width,height] of [[1902,911],[1366,768],[1280,720],[1024,768],[800,1000]]){
   await page.setViewportSize({width,height});await stable();const g=await geometry();
   assert.ok(g.page<=height+1,JSON.stringify(g));assert.ok(g.header.height<=40);assert.ok(g.presets.height<=60);
   assert.ok(g.timeline.bottom<=g.footer.top,JSON.stringify(g));assert.ok(g.gap<=45,JSON.stringify(g));
   assert.ok(Math.abs(g.timeline.bottom-g.adjustments.bottom)<=7,JSON.stringify(g));
   assert.ok(Math.abs(g.controls.width-g.stage.width)<=1,JSON.stringify(g));
   await page.locator('#layered-timeline').evaluate(el=>el.scrollTop=el.scrollHeight);
   assert.equal(await page.evaluate(()=>{const b=$('open-export').getBoundingClientRect();return document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)?.closest('.export-bar')!==null;}),true);
   await shot('video-'+width+'x'+height);
  }
  await page.setViewportSize({width:1366,height:768});await stable();
  await page.locator('#layered-timeline').evaluate(el=>el.scrollTop=0);
  const before=await page.locator('#editor .adjustments').evaluate(el=>el.scrollTop);await page.locator('#editor .adjustments').hover();await page.mouse.wheel(0,600);
  await page.waitForFunction(before=>document.querySelector('.adjustments').scrollTop>before,before);assert.equal(await page.evaluate(()=>scrollY),0);
  await page.locator('#mode').scrollIntoViewIfNeeded();await page.locator('#mode').hover();
  const hovered=Date.now();await page.waitForTimeout(1000);assert.equal(await page.locator('#hover-help').isVisible(),false);
  await page.locator('#hover-help').waitFor({state:'visible'});assert.ok(Date.now()-hovered>=2900);
  assert.match(await page.locator('#hover-help').textContent(),/Preserva toda a arte/);await shot('dica-enquadramento');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#hover-help').isVisible(),false);
  await page.locator('#mode').selectOption('cover');await page.locator('#editor .canvas-shell').hover();await page.locator('#mode').hover();
  await page.locator('#hover-help').waitFor({state:'visible'});assert.match(await page.locator('#hover-help').textContent(),/bordas da arte podem ser cortadas/);
  await page.locator('#editor .canvas-shell').hover();assert.equal(await page.locator('#hover-help').isVisible(),false);
  const eye=page.locator('.track-property[data-property="previewVisible"]').first();await eye.hover();await page.locator('#hover-help').waitFor({state:'visible'});
  assert.match(await page.locator('#hover-help').textContent(),/Oculta só a prévia/);assert.equal(await eye.getAttribute('title'),null);
  assert.equal(await page.locator('label.check').filter({hasText:'Travar centro horizontal'}).isVisible(),true);
  await page.locator('#editor .canvas-shell').hover();await page.getByRole('button',{name:'Edições recentes',exact:true}).click();
  await page.waitForFunction(()=>$('studio').hidden&&!document.body.classList.contains('video-workspace'));
  assert.equal(await page.evaluate(()=>document.body.classList.contains('video-workspace')),false);
  await page.getByRole('button',{name:'Imagens',exact:true}).click();await page.locator('#files').setInputFiles(path.join(path.dirname(sample),'slide-green.png'));
  await page.waitForFunction(()=>!busy&&current()?.kind==='image');assert.equal(await page.evaluate(()=>document.body.classList.contains('video-workspace')),false);
  assert.equal(await page.locator('#mode-help').isVisible(),false);await page.locator('#mode').hover();await page.locator('#hover-help').waitFor({state:'visible'});
  assert.match(await page.locator('#hover-help').textContent(),/Preserva toda a arte/);await shot('imagens-com-dicas');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({layout:'passed',viewportSizes:5,exportBar:'passed',panelScrolling:'passed',tooltipDelay:'3 seconds',dynamicTips:'passed',imageEditor:'passed',errors}));
 }catch(error){console.error(JSON.stringify({errors,geometry:await geometry().catch(()=>null),help:await page.evaluate(()=>({target:helpTarget?.id,origin:helpOrigin,visible:helpVisible,pointer:helpPointer,text:helpText(helpTarget),actual:helpPointer?document.elementFromPoint(helpPointer.x,helpPointer.y)?.outerHTML:null}))}));await shot('erro-layout');throw error;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
