// Functions injected into the Instagram tab with chrome.scripting. Each one must be self-contained.
export function pagePrepare(){
  const text=(document.querySelector('main')?.innerText||'').toLowerCase();
  const login=[...document.querySelectorAll('input[name="password"]')].some(i=>i.offsetParent);
  const isPrivate=/esta conta é privada|this account is private/.test(text);
  window.scrollTo({top:0,behavior:'instant'});window.__cartelasNext=undefined;
  return {login,isPrivate,hasMain:!!document.querySelector('main')};
}
// First call: the profile header (profile picture, name, bio). Next calls: only whole rows of the post grid,
// scrolling so each screen starts where the previous one ended (no repeated posts).
export async function pageMeasure(first){
  const sleep=t=>new Promise(r=>setTimeout(r,t));
  const tileRects=()=>[...document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]')].map(a=>a.getBoundingClientRect()).filter(r=>r.width>60&&r.height>60);
  if(!first){
    if(Number.isFinite(window.__cartelasNext))window.scrollTo({top:window.__cartelasNext,behavior:'instant'});
    else window.scrollBy({top:Math.round(innerHeight*.85),behavior:'instant'});
  }
  await sleep(700);
  const inView=()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.width>40;});
  for(let t=0;t<10&&inView().some(i=>!i.complete);t++)await sleep(250);
  const clip=r=>{const x=Math.max(0,r.left),y=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;};
  const main=document.querySelector('main'),login=[...document.querySelectorAll('input[name="password"]')].some(i=>i.offsetParent);
  const atEnd=scrollY+innerHeight>=document.documentElement.scrollHeight-4;
  const tiles=tileRects();
  if(first){
    // Header: from the top of main down to the first post row; the grid starts on the next screen.
    const firstRow=tiles.length?Math.min(...tiles.map(r=>r.top)):null;
    window.__cartelasNext=firstRow!==null?Math.max(0,scrollY+firstRow-8):undefined;
    let rect=main?clip(main.getBoundingClientRect()):null;
    if(rect&&firstRow!==null&&firstRow>rect.y+120&&firstRow<innerHeight)rect={...rect,height:firstRow-rect.y};
    return {rect,viewport:{width:innerWidth,height:innerHeight},atEnd:false,login,kind:'profile'};
  }
  const whole=tiles.filter(r=>r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1);
  if(!whole.length){window.__cartelasNext=undefined;return {rect:main?clip(main.getBoundingClientRect()):null,viewport:{width:innerWidth,height:innerHeight},atEnd,login,kind:'screen'};}
  const group=(values)=>values.sort((a,b)=>a-b).reduce((rows,v)=>{if(!rows.length||v-rows[rows.length-1]>8)rows.push(v);return rows;},[]);
  const rows=group(whole.map(r=>r.top)).length,columns=group(whole.map(r=>r.left)).length;
  const x=Math.min(...whole.map(r=>r.left)),y=Math.min(...whole.map(r=>r.top)),right=Math.max(...whole.map(r=>r.right)),bottom=Math.max(...whole.map(r=>r.bottom));
  // The next screen begins at the first row that did not fit entirely.
  const below=tiles.filter(r=>r.top>bottom-2);
  window.__cartelasNext=below.length?scrollY+Math.min(...below.map(r=>r.top))-8:scrollY+bottom;
  return {rect:{x,y,width:right-x,height:bottom-y},viewport:{width:innerWidth,height:innerHeight},atEnd:atEnd&&!below.length,login,kind:columns<=3&&rows<=6?'grid':'screen',rows,columns};
}
export function pageReset(){window.scrollTo({top:0,behavior:'instant'});window.__cartelasNext=undefined;}
