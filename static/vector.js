'use strict';
// Vetorização M6S: logo → peças (contorno + furos) com 12 mm de altura → DXF em mm para o laser.
// A mini seção "Editar vetores" corrige à mão o que o automático não acerta; o desenho editado é o que vai para o DXF.
const vectorDefaults={threshold:null,invert:false,smooth:1,detailMm:.08,denoise:true};
let vec=null,vecSettings={...vectorDefaults},vecResult=null,vecSerial=0,vecTimer,vecFolder='',vecView='engrave';
let vecParts=null,vecHistory=[],vecSel=null,vecOrigem='vetor',vecDrag=null;
const vecZoom=criarZoom($('vector-svg'),document.querySelector('.vector-shell'));

function vectorSync(){
 const s=vecSettings,fromVector=vec?.vetor&&vecOrigem==='vetor';
 $('vector-auto').checked=s.threshold===null;$('vector-threshold').disabled=s.threshold===null;
 $('vector-threshold').value=s.threshold??vecResult?.threshold??128;$('vector-threshold-value').textContent=s.threshold===null?`Auto${vecResult?.threshold?' · '+vecResult.threshold:''}`:s.threshold;
 $('vector-invert').checked=s.invert;$('vector-denoise').checked=s.denoise;$('vector-smooth').value=s.smooth;$('vector-smooth-value').textContent=Number(s.smooth).toFixed(2);$('vector-detail').value=s.detailMm;
 $('vector-empty').hidden=!!vec;$('vector-editor').hidden=!vec;$('vector-export').disabled=!vecParts||busy;
 $('vector-origin').hidden=!vec?.vetor;$('vector-use-original').checked=vecOrigem==='vetor';$('vector-auto-settings').hidden=fromVector;
 $('vector-dimensions').textContent=vecResult?`${fmtMm(vecResult.width)} mm de largura, proporcional`:'—';
 $('vector-export-info').textContent=vecResult?`${vec.name} · ${fmtMm(vecResult.width)} × ${fmtMm(vecResult.height)} mm`:vec?'Vetorizando…':'Adicione uma logo';
 syncVectorEdit();
}
function fmtMm(v){return Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2});}
function vectorChange(patch){
 if(vecHistory.length&&!confirm('Mudar os ajustes automáticos descarta as edições manuais deste desenho. Continuar?')){vectorSync();return;}
 Object.assign(vecSettings,patch);vectorSync();queueTrace();
}
function queueTrace(){clearTimeout(vecTimer);const serial=++vecSerial;$('vector-busy').hidden=false;$('vector-export').disabled=true;vecTimer=setTimeout(()=>traceVector(serial),250);}
async function traceVector(serial){
 if(!vec)return;
 try{
  const result=await request('/api/vector/trace',{id:vec.id,settings:vecSettings,origem:vecOrigem});if(serial!==vecSerial)return;
  vecHistory=[];vecSel=null;showVectorResult(result);
 }catch(e){if(serial!==vecSerial)return;vecResult=null;vecParts=null;$('vector-parts').replaceChildren();$('vector-notes').replaceChildren();$('vector-stats').textContent=e.message;$('vector-size').textContent='— mm';}
 finally{if(serial===vecSerial){$('vector-busy').hidden=true;vectorSync();}}
}
function showVectorResult(result){
 vecResult=result;vecParts=result.parts;drawVector();
 const extra=vec?.motivoVetor&&vecOrigem==='vetor'?[`Arquivo vetorial redesenhado pelo sistema: ${vec.motivoVetor}.`]:[];
 $('vector-notes').replaceChildren(...[...extra,...result.notes].map(n=>{const p=document.createElement('p');p.textContent=n;p.insertAdjacentHTML('afterbegin',icon('alert','note-icon'));return p;}));
}
const svgNS='http://www.w3.org/2000/svg';
function ringPath(r){return 'M'+r.map(([x,y])=>`${x.toFixed(3)} ${(-y).toFixed(3)}`).join(' L')+' Z';}
function drawVector(){
 const r=vecResult,m=Math.max(r.width,r.height)*.04,svg=$('vector-svg'),g=$('vector-parts');
 vecZoom.definir(-r.width/2-m,-r.height/2-m,r.width+2*m,r.height+2*m);
 svg.style.setProperty('--stroke',Math.max(r.width,r.height)/500);
 const nodes=[];
 vecParts.forEach((p,i)=>{
  const path=document.createElementNS(svgNS,'path');path.setAttribute('d',[p.outer,...p.holes].map(ringPath).join(' '));path.setAttribute('fill-rule','evenodd');
  path.dataset.part=i;path.classList.add('vector-part');if(vecSel?.part===i&&vecSel.hole==null)path.classList.add('is-selected');nodes.push(path);
 });
 // furos por cima, invisíveis mas clicáveis: clicar no miolo de uma letra seleciona o furo
 vecParts.forEach((p,i)=>p.holes.forEach((h,j)=>{const hole=document.createElementNS(svgNS,'path');hole.setAttribute('d',ringPath(h));hole.dataset.part=i;hole.dataset.hole=j;hole.classList.add('vector-hole');if(vecSel?.part===i&&vecSel.hole===j)hole.classList.add('is-selected');nodes.push(hole);}));
 g.replaceChildren(...nodes);drawHandles();
 $('vector-size').textContent=`${fmtMm(r.width)} × ${fmtMm(r.height)} mm`;
 $('vector-stats').textContent=`${r.contours} contorno${r.contours!==1?'s':''} fechado${r.contours!==1?'s':''} · ${r.points.toLocaleString('pt-BR')} pontos${vecHistory.length?' · editado à mão':''}${r.origem==='vetor'?' · vetor original':''}`;
}
function setVectorView(view){
 vecView=view;const shell=document.querySelector('.vector-shell');shell.classList.toggle('outline',view==='outline');shell.classList.toggle('original',view==='original');
 $('vector-original').hidden=view!=='original';$('vector-svg').style.display=view==='original'?'none':'';
 document.querySelectorAll('[data-vector-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vectorView===view)));
}

// ---------- Editar vetores ----------
function syncVectorEdit(){
 const part=vecSel&&vecSel.hole==null,hole=vecSel&&vecSel.hole!=null;
 $('vector-erase').disabled=!part||busy;$('vector-fill').disabled=!hole||busy;
 $('vector-undo').disabled=!vecHistory.length||busy;$('vector-restore').disabled=!vecHistory.length||busy;
 for(const id of ['vector-smooth-apply','vector-thicken-apply'])$(id).disabled=!vecParts||busy;
 $('vector-edit-hint').textContent=part?'Parte selecionada. Suavizar e engrossar valem só para ela.':hole?'Furo selecionado: “Preencher furo” fecha o miolo.':'Clique numa parte do desenho para selecionar. Sem seleção, suavizar e engrossar valem para o desenho todo.';
 $('vector-move-hint').textContent=part?'Arraste os pontos verdes. O contorno desta parte é simplificado para ficar fácil de mexer.':'Selecione uma parte do desenho para ver os pontos.';
}
async function vectorEdit(op,alvo,quantidade,parts=vecParts){
 await guard(async()=>{
  const result=await request('/api/vector/edit',{parts,op,alvo,quantidade});
  vecHistory.push(vecParts);vecSel=null;showVectorResult({...result,origem:vecResult.origem,threshold:vecResult.threshold});vectorSync();
 });
}
function vectorUndo(){if(!vecHistory.length)return;const parts=vecHistory.pop();vecSel=null;request('/api/vector/edit',{parts,op:'normalizar'}).then(r=>{showVectorResult({...r,origem:vecResult.origem,threshold:vecResult.threshold});vectorSync();}).catch(e=>toast(e.message));}
$('vector-parts').addEventListener('click',e=>{
 const el=e.target.closest('[data-part]');if(!el||vecDrag)return;
 const sel={part:Number(el.dataset.part),hole:el.dataset.hole!=null?Number(el.dataset.hole):null};
 vecSel=vecSel&&vecSel.part===sel.part&&vecSel.hole===sel.hole?null:sel;drawVector();syncVectorEdit();
});
$('vector-svg').addEventListener('click',e=>{if(e.target===$('vector-svg')&&vecSel){vecSel=null;drawVector();syncVectorEdit();}});
$('vector-erase').onclick=()=>vectorEdit('apagar',[vecSel.part]);
$('vector-fill').onclick=()=>vectorEdit('preencher',{part:vecSel.part,hole:vecSel.hole});
$('vector-smooth-amount').oninput=()=>$('vector-smooth-amount-value').textContent=fmtMm($('vector-smooth-amount').value)+' mm';
$('vector-thicken-amount').oninput=()=>$('vector-thicken-amount-value').textContent=fmtMm($('vector-thicken-amount').value)+' mm';
$('vector-smooth-apply').onclick=()=>vectorEdit('suavizar',vecSel&&vecSel.hole==null?[vecSel.part]:[],Number($('vector-smooth-amount').value));
$('vector-thicken-apply').onclick=()=>vectorEdit('engrossar',vecSel&&vecSel.hole==null?[vecSel.part]:[],Number($('vector-thicken-amount').value));
$('vector-undo').onclick=vectorUndo;
$('vector-restore').onclick=()=>{if(confirm('Voltar ao desenho automático? As edições manuais serão descartadas.')){vecHistory=[];queueTrace();}};
$('vector-advanced').addEventListener('toggle',()=>drawHandles());
document.addEventListener('keydown',e=>{
 if($('vector').hidden||e.target.closest('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]'))return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&vecHistory.length){e.preventDefault();vectorUndo();}
 else if((e.key==='Delete'||e.key==='Backspace')&&vecSel&&vecSel.hole==null){e.preventDefault();vectorEdit('apagar',[vecSel.part]);}
 else if(e.key==='Escape'&&vecSel){vecSel=null;drawVector();syncVectorEdit();}
});

// Mover pontos (avançado): a parte selecionada vira um contorno simplificado com poucos pontos arrastáveis.
function simplify(points,tolerance){
 if(points.length<4)return points;
 const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;const stack=[[0,points.length-1]];
 while(stack.length){const [a,b]=stack.pop();let far=0,idx=-1;const [ax,ay]=points[a],[bx,by]=points[b],len=Math.hypot(bx-ax,by-ay)||1e-9;
  for(let i=a+1;i<b;i++){const d=Math.abs((bx-ax)*(ay-points[i][1])-(ax-points[i][0])*(by-ay))/len;if(d>far){far=d;idx=i;}}
  if(far>tolerance){keep[idx]=1;stack.push([a,idx],[idx,b]);}}
 return points.filter((_,i)=>keep[i]);
}
function partSpot(parts,i){
 const box=pts=>pts.reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)],[Infinity,Infinity,-Infinity,-Infinity]);
 const all=box(parts.flatMap(p=>p.outer)),b=box(parts[i].outer);
 return [((b[0]+b[2])/2-all[0])/((all[2]-all[0])||1),((b[1]+b[3])/2-all[1])/((all[3]-all[1])||1)];
}
function simplifiedRing(r){let t=.03,s=simplify(r,t);while(s.length>80&&t<2){t*=1.6;s=simplify(r,t);}return s.length>=3?s:r;}
function drawHandles(){
 const layer=$('vector-handles');layer.replaceChildren();
 if(!$('vector-advanced').open||!vecSel||vecSel.hole!=null||!vecParts?.[vecSel.part])return;
 const part=vecParts[vecSel.part],rings=[part.outer,...part.holes].map(simplifiedRing),size=vecZoom.px(4);  // 4 px na tela, com ou sem zoom
 const outline=document.createElementNS(svgNS,'path');outline.setAttribute('d',rings.map(ringPath).join(' '));outline.classList.add('vector-handle-line');layer.append(outline);
 rings.forEach((ringPts,ri)=>ringPts.forEach(([x,y],pi)=>{
  const c=document.createElementNS(svgNS,'circle');c.setAttribute('cx',x);c.setAttribute('cy',-y);c.setAttribute('r',size);c.classList.add('vector-handle');
  c.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();c.setPointerCapture(e.pointerId);vecDrag={rings,ri,pi,c,outline};});
  layer.append(c);
 }));
}
$('vector-handles').addEventListener('pointermove',e=>{
 if(!vecDrag)return;const svg=$('vector-svg'),pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse());
 vecDrag.rings[vecDrag.ri][vecDrag.pi]=[p.x,-p.y];vecDrag.c.setAttribute('cx',p.x);vecDrag.c.setAttribute('cy',p.y);vecDrag.outline.setAttribute('d',vecDrag.rings.map(ringPath).join(' '));
});
$('vector-handles').addEventListener('pointerup',()=>{
 if(!vecDrag)return;const {rings}=vecDrag,part=vecSel.part;vecDrag=null;
 const parts=vecParts.map((p,i)=>i===part?{outer:rings[0],holes:rings.slice(1)}:p),spot=partSpot(parts,part);
 // o servidor reordena e reescala as peças: a seleção segue a peça pela posição relativa no desenho
 vectorEdit('normalizar',null,null,parts).then(()=>{if(!vecParts.length)return;
  const near=vecParts.map((_,i)=>{const s=partSpot(vecParts,i);return Math.hypot(s[0]-spot[0],s[1]-spot[1]);});
  vecSel={part:near.indexOf(Math.min(...near)),hole:null};drawVector();syncVectorEdit();});
});

async function uploadVector(file){
 if(!file)return;
 await guard(async()=>{
  if(file.size>100*1024*1024)throw new Error('Limite de 100 MB por arquivo.');
  toast(`Abrindo ${file.name}…`);
  const response=await fetch(`/api/vector/upload?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'X-Indoor':'1','Content-Type':'application/octet-stream'},body:file});
  const data=await response.json();if(!response.ok)throw new Error(data.error);
  vec=data;vecZoom.novo();vecResult=null;vecParts=null;vecHistory=[];vecSel=null;vecOrigem='vetor';vecSettings={...vectorDefaults};$('toast').hidden=true;
  $('vector-name').textContent=vec.name;$('vector-original').src=`/vetor/${vec.id}`;$('vector-parts').replaceChildren();
  vectorSync();queueTrace();
 });
 $('vector-file').value='';
}
async function openVectorExport(){
 if(!vecParts)return;
 const folder=vecFolder||await chooseFolder();if(!folder)return;vecFolder=folder;
 $('vector-folder').textContent=folder;$('vector-result').hidden=true;$('vector-save').disabled=false;
 // padrão da equipe: Impressão logo M6S - PAPITO (33,18mm x 12mm); a medida é a do vetor que vai para o laser
 const base=vec.name.replace(/\.[^.]+$/,'').trim().slice(0,45);
 $('vector-filename').value=`Impressão logo M6S - ${base} (${fmtMm(vecResult.width)}mm x ${fmtMm(vecResult.height)}mm)`;
 $('vector-dialog-size').textContent=`${fmtMm(vecResult.width)} × ${fmtMm(vecResult.height)} mm · ${vecResult.contours} contornos fechados · centralizado na origem (0,0)`;
 $('vector-dialog').showModal();
}
$('vector-choose').onclick=e=>{e.stopPropagation();$('vector-file').click();};
$('vector-replace').onclick=()=>$('vector-file').click();
$('vector-file').onchange=()=>uploadVector($('vector-file').files[0]);
$('vector-empty').onclick=()=>$('vector-file').click();
$('vector-empty').onkeydown=e=>{if(e.target===$('vector-empty')&&['Enter',' '].includes(e.key)){e.preventDefault();$('vector-file').click();}};
for(const zone of [$('vector-empty'),$('vector-editor')]){
 let depth=0;
 zone.addEventListener('dragenter',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();depth++;zone.classList.add('over');});
 zone.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
 zone.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;zone.classList.remove('over');}});
 zone.addEventListener('drop',e=>{e.preventDefault();depth=0;zone.classList.remove('over');uploadVector(e.dataTransfer.files[0]);});
}
$('vector-use-original').onchange=()=>{
 if(vecHistory.length&&!confirm('Trocar a origem descarta as edições manuais deste desenho. Continuar?')){vectorSync();return;}
 vecOrigem=$('vector-use-original').checked?'vetor':'imagem';vectorSync();queueTrace();
};
$('vector-detail').oninput=()=>{const v=Number($('vector-detail').value);if($('vector-detail').validity.valid&&$('vector-detail').value!=='')vectorChange({detailMm:v});};
$('vector-detail').onchange=()=>{if(!$('vector-detail').validity.valid||$('vector-detail').value===''){$('vector-detail').value=vecSettings.detailMm;toast('Use um valor entre 0 e 2 mm.');}};
$('vector-auto').onchange=()=>vectorChange({threshold:$('vector-auto').checked?null:(vecResult?.threshold??128)});
$('vector-threshold').oninput=()=>vectorChange({threshold:Number($('vector-threshold').value)});
$('vector-smooth').oninput=()=>vectorChange({smooth:Number($('vector-smooth').value)});
$('vector-invert').onchange=()=>vectorChange({invert:$('vector-invert').checked});
$('vector-denoise').onchange=()=>vectorChange({denoise:$('vector-denoise').checked});
$('vector-reset').onclick=()=>vectorChange({...vectorDefaults});
document.querySelectorAll('[data-vector-view]').forEach(b=>b.onclick=()=>setVectorView(b.dataset.vectorView));
$('vector-export').onclick=()=>guard(openVectorExport);
$('vector-change-folder').onclick=()=>guard(async()=>{const folder=await chooseFolder();if(folder){vecFolder=folder;$('vector-folder').textContent=folder;}});
$('vector-save').onclick=()=>guard(async()=>{
 const name=$('vector-filename').value.trim();if(!name)throw new Error('Preencha o nome do arquivo.');
 $('vector-result').hidden=false;$('vector-result').textContent='Gerando o DXF…';
 try{
  const result=await request('/api/vector/export',{id:vec.id,source:vec.name,settings:vecSettings,origem:vecOrigem,parts:vecParts,folder:vecFolder,name});
  $('vector-result').textContent=`✓ ${result.name}\n${result.path}`;$('vector-save').disabled=true;
  toast(`DXF salvo: ${fmtMm(result.width)} × ${fmtMm(result.height)} mm.`);
 }catch(e){$('vector-result').textContent=e.message;throw e;}
});
$('vector-filename').oninput=()=>{$('vector-save').disabled=false;$('vector-result').hidden=true;};
$('vector-svg').addEventListener('zoom',()=>{if(!vecDrag)drawHandles();});
setVectorView('engrave');vectorSync();
