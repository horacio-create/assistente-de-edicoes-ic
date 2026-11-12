'use strict';
// Vetorização M6S: logo → peças (contorno + furos) com 12 mm de altura → DXF em mm para o laser.
// A mini seção "Editar vetores" corrige à mão o que o automático não acerta; o desenho editado é o que vai para o DXF.
const vectorDefaults={threshold:null,invert:false,smooth:1,detailMm:.08,denoise:true};
let vec=null,vecSettings={...vectorDefaults},vecResult=null,vecSerial=0,vecTimer,vecFolder='',vecView='engrave';
let vecParts=null,vecHistory=[],vecSel=null,vecOrigem='vetor',vecDrag=null;
// Seleção: vecPicked guarda as partes escolhidas (uma ou várias); vecSel é a parte única (pontos) ou o furo escolhido.
let vecPicked=new Set(),vecMarquee=null,vecMarqueeDone=false;
const vecZoom=criarZoom($('vector-svg'),document.querySelector('.vector-shell'));

function vectorSync(){
 const s=vecSettings,fromVector=vec?.vetor&&vecOrigem==='vetor';
 $('vector-auto').checked=s.threshold===null;$('vector-threshold').disabled=s.threshold===null;
 $('vector-threshold').value=s.threshold??vecResult?.threshold??128;$('vector-threshold-value').textContent=s.threshold===null?`Auto${vecResult?.threshold?' · '+vecResult.threshold:''}`:s.threshold;
 $('vector-invert').checked=s.invert;$('vector-denoise').checked=s.denoise;$('vector-smooth').value=s.smooth;$('vector-smooth-value').textContent=Number(s.smooth).toFixed(2);$('vector-detail').value=s.detailMm;
 $('vector-empty').hidden=!!vec;$('vector-editor').hidden=!vec;$('vector-export').disabled=!vecParts||busy;$('vector-vc-open').disabled=!vecParts||busy;
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
  vecHistory=[];clearVectorSelection();showVectorResult(result);
 }catch(e){if(serial!==vecSerial)return;vecResult=null;vecParts=null;$('vector-parts').replaceChildren();$('vector-notes').replaceChildren();$('vector-stats').textContent=e.message;$('vector-size').textContent='— mm';}
 finally{if(serial===vecSerial){$('vector-busy').hidden=true;vectorSync();}}
}
function showVectorResult(result){
 vecResult=result;vecParts=result.parts;drawVector();
 const extra=vec?.motivoVetor&&vecOrigem==='vetor'?[`Arquivo vetorial redesenhado pelo sistema: ${vec.motivoVetor}.${vcOrigem&&DICAS_VC[vec.motivoVetor]?' '+DICAS_VC[vec.motivoVetor]:''}`]:[];
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
  path.dataset.part=i;path.classList.add('vector-part');if(vecPicked.has(i))path.classList.add('is-selected');nodes.push(path);
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
function clearVectorSelection(){vecPicked=new Set();vecSel=null;}
// Escolhe as partes (índices) ou um furo ({part, hole}) e redesenha.
function setVectorSelection(parts=[],hole=null){
 vecPicked=new Set(hole?[]:parts);
 vecSel=hole?{part:hole.part,hole:hole.hole}:vecPicked.size===1?{part:[...vecPicked][0],hole:null}:null;
 drawVector();syncVectorEdit();
}
const plural=(n,um,varios)=>n===1?um:varios;
function syncVectorEdit(){
 const n=vecPicked.size,hole=vecSel&&vecSel.hole!=null,total=vecParts?.length||0;
 $('vector-erase').disabled=!n||n>=total||busy;$('vector-fill').disabled=!hole||busy;
 $('vector-keep').disabled=!n||n>=total||busy;
 $('vector-erase').textContent=n>1?`Apagar ${n} partes`:'Apagar parte';
 $('vector-undo').disabled=!vecHistory.length||busy;$('vector-restore').disabled=!vecHistory.length||busy;
 for(const id of ['vector-smooth-apply','vector-thicken-apply'])$(id).disabled=!vecParts||busy;
 $('vector-edit-hint').textContent=n?`${n} ${plural(n,'parte selecionada','partes selecionadas')} de ${total}. Suavizar e engrossar valem só para ${plural(n,'ela','elas')}. Shift + clique soma ou tira partes.`
  :hole?'Furo selecionado: “Preencher furo” fecha o miolo.'
  :'Clique numa parte ou arraste um retângulo em volta de várias (telefone, site, endereço). Shift + clique soma partes; Ctrl + A seleciona tudo.';
 $('vector-move-hint').textContent=n===1?'Arraste os pontos verdes. O contorno desta parte é simplificado para ficar fácil de mexer.':n>1?'Para mover pontos, selecione uma parte só.':'Selecione uma parte do desenho para ver os pontos.';
}
async function vectorEdit(op,alvo,quantidade,parts=vecParts){
 await guard(async()=>{
  const result=await request('/api/vector/edit',{parts,op,alvo,quantidade});
  vecHistory.push(vecParts);clearVectorSelection();showVectorResult({...result,origem:vecResult.origem,threshold:vecResult.threshold});vectorSync();
 });
}
function vectorUndo(){if(!vecHistory.length)return;const parts=vecHistory.pop();clearVectorSelection();request('/api/vector/edit',{parts,op:'normalizar'}).then(r=>{showVectorResult({...r,origem:vecResult.origem,threshold:vecResult.threshold});vectorSync();}).catch(e=>toast(e.message));}
$('vector-parts').addEventListener('click',e=>{
 const el=e.target.closest('[data-part]');if(!el||vecDrag||vecMarqueeDone)return;
 const part=Number(el.dataset.part),soma=e.shiftKey||e.ctrlKey||e.metaKey;
 if(el.dataset.hole!=null&&!soma){const hole=Number(el.dataset.hole);
  return vecSel&&vecSel.part===part&&vecSel.hole===hole?setVectorSelection():setVectorSelection([],{part,hole});}
 if(soma){const s=new Set(vecPicked);s.has(part)?s.delete(part):s.add(part);return setVectorSelection([...s]);}
 setVectorSelection(vecPicked.size===1&&vecPicked.has(part)?[]:[part]);
});
$('vector-svg').addEventListener('click',e=>{if(e.target===$('vector-svg')&&!vecMarqueeDone&&(vecPicked.size||vecSel))setVectorSelection();vecMarqueeDone=false;});
// Seleção por retângulo: arrastar a partir do fundo seleciona as partes que ficam inteiras dentro dele
// (assim dá para pegar o telefone ou o site sem levar a logo junto). Com Shift, soma à seleção.
function vectorPoint(e){const svg=$('vector-svg'),pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(svg.getScreenCTM().inverse());}
$('vector-svg').addEventListener('pointerdown',e=>{
 if(e.button!==0||!vecParts||vecView==='original'||e.target.closest('[data-part],.vector-handle'))return;
 const p=vectorPoint(e),rect=document.createElementNS(svgNS,'rect');rect.classList.add('vector-marquee');$('vector-svg').append(rect);
 vecMarquee={x:p.x,y:p.y,sx:e.clientX,sy:e.clientY,rect,soma:e.shiftKey||e.ctrlKey||e.metaKey,base:new Set(vecPicked)};
 $('vector-svg').setPointerCapture(e.pointerId);
});
function marqueeHits(a,b){
 const [x0,x1]=[Math.min(a.x,b.x),Math.max(a.x,b.x)],[y0,y1]=[Math.min(a.y,b.y),Math.max(a.y,b.y)];
 return vecParts.flatMap((p,i)=>p.outer.every(([x,y])=>x>=x0&&x<=x1&&-y>=y0&&-y<=y1)?[i]:[]);
}
$('vector-svg').addEventListener('pointermove',e=>{
 if(!vecMarquee)return;const m=vecMarquee,p=vectorPoint(e);
 if(Math.hypot(e.clientX-m.sx,e.clientY-m.sy)<4&&!m.moved)return;m.moved=true;
 m.rect.setAttribute('x',Math.min(m.x,p.x));m.rect.setAttribute('y',Math.min(m.y,p.y));m.rect.setAttribute('width',Math.abs(p.x-m.x));m.rect.setAttribute('height',Math.abs(p.y-m.y));
 const hits=marqueeHits(m,p);document.querySelectorAll('#vector-parts .vector-part').forEach(el=>el.classList.toggle('is-selected',hits.includes(Number(el.dataset.part))||m.soma&&m.base.has(Number(el.dataset.part))));
});
function endMarquee(e){
 if(!vecMarquee)return;const m=vecMarquee;vecMarquee=null;m.rect.remove();if(!m.moved)return;
 vecMarqueeDone=true;setTimeout(()=>{vecMarqueeDone=false;},0);  // o clique que vem logo depois não desfaz a seleção
 const hits=marqueeHits(m,vectorPoint(e));setVectorSelection(m.soma?[...new Set([...m.base,...hits])]:hits);
 if(!hits.length)toast('Nenhuma parte ficou inteira dentro do retângulo. Arraste um pouco maior.');
}
$('vector-svg').addEventListener('pointerup',endMarquee);
$('vector-svg').addEventListener('pointercancel',()=>{if(vecMarquee){vecMarquee.rect.remove();vecMarquee=null;drawVector();}});
$('vector-erase').onclick=()=>vectorEdit('apagar',[...vecPicked]);
// O caso mais comum: a logo vem com telefone, site e endereço. Seleciona a logo e apaga todo o resto.
$('vector-keep').onclick=()=>vectorEdit('apagar',vecParts.map((_,i)=>i).filter(i=>!vecPicked.has(i)));
$('vector-fill').onclick=()=>vectorEdit('preencher',{part:vecSel.part,hole:vecSel.hole});
$('vector-smooth-amount').oninput=()=>$('vector-smooth-amount-value').textContent=fmtMm($('vector-smooth-amount').value)+' mm';
$('vector-thicken-amount').oninput=()=>$('vector-thicken-amount-value').textContent=fmtMm($('vector-thicken-amount').value)+' mm';
$('vector-smooth-apply').onclick=()=>vectorEdit('suavizar',[...vecPicked],Number($('vector-smooth-amount').value));
$('vector-thicken-apply').onclick=()=>vectorEdit('engrossar',[...vecPicked],Number($('vector-thicken-amount').value));
$('vector-undo').onclick=vectorUndo;
$('vector-restore').onclick=()=>{if(confirm('Voltar ao desenho automático? As edições manuais serão descartadas.')){vecHistory=[];queueTrace();}};
$('vector-advanced').addEventListener('toggle',()=>drawHandles());
document.addEventListener('keydown',e=>{
 if($('vector').hidden||e.target.closest('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]'))return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&vecHistory.length){e.preventDefault();vectorUndo();}
 else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&vecParts){e.preventDefault();setVectorSelection(vecParts.map((_,i)=>i));}
 else if((e.key==='Delete'||e.key==='Backspace')&&vecPicked.size){e.preventDefault();if(vecPicked.size<vecParts.length)vectorEdit('apagar',[...vecPicked]);else toast('Não dá para apagar o desenho inteiro.');}
 else if(e.key==='Escape'&&(vecPicked.size||vecSel)){setVectorSelection();}
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
  setVectorSelection([near.indexOf(Math.min(...near))]);});
});

// Devolve true quando o arquivo foi aceito (a volta do VectorCraft só mexe no nome se deu certo).
async function uploadVector(file){
 if(!file)return false;
 let ok=false;
 await guard(async()=>{
  if(file.size>100*1024*1024)throw new Error('Limite de 100 MB por arquivo.');
  toast(`Abrindo ${file.name}…`);
  const response=await fetch(`/api/vector/upload?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'X-Indoor':'1','Content-Type':'application/octet-stream'},body:file});
  const data=await response.json();if(!response.ok)throw new Error(data.error);
  vec=data;vecZoom.novo();vecResult=null;vecParts=null;vecHistory=[];clearVectorSelection();vecOrigem='vetor';vcOrigem=null;vecSettings={...vectorDefaults};$('toast').hidden=true;
  $('vector-name').textContent=vec.name;$('vector-original').src=`/vetor/${vec.id}`;$('vector-parts').replaceChildren();
  vectorSync();queueTrace();ok=true;
 });
 $('vector-file').value='';
 return ok;
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
// ---------- Edição avançada no VectorCraft (ida e volta por arquivo) ----------
// O sistema roda num servidor e não abre programas no computador de quem usa: baixa um SVG do desenho atual, a pessoa
// edita no VectorCraft e traz o arquivo de volta (SVG, PDF ou AI viram contornos fiéis, sem redesenhar).
const VC_KEY='indoor-vectorcraft';
const DICAS_VC={
 'há textos que não foram convertidos em curvas':'No VectorCraft, selecione os textos e use Type › Create Outlines antes de salvar.',
 'há linhas sem preenchimento':'No VectorCraft, selecione as linhas e use Object › Path › Outline Stroke antes de salvar.',
 'o arquivo tem imagens dentro':'O arquivo tem imagens coladas: apague-as no VectorCraft e deixe só vetores.',
 'nenhuma forma preenchida escura':'Nada está pintado de preto: no VectorCraft, pinte de preto o que deve ser gravado.',
};
let vcOrigem=null;  // nome da logo antes da ida ao VectorCraft: a volta mantém o nome (e o do DXF)
function vectorBaseName(){return (vcOrigem||vec.name).replace(/\.[^.]+$/,'').trim();}
function vectorSvg(){
 const pts=vecParts.flatMap(p=>p.outer),xs=pts.map(p=>p[0]),ys=pts.map(p=>-p[1]);
 const x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0,n=v=>+v.toFixed(3);
 // uma forma por parte: no VectorCraft cada letra ou pedaço é um objeto separado
 const paths=vecParts.map(p=>`  <path fill="#000000" fill-rule="evenodd" d="${[p.outer,...p.holes].map(ringPath).join(' ')}"/>`).join('\n');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}mm" height="${n(h)}mm" viewBox="${n(x0)} ${n(y0)} ${n(w)} ${n(h)}">\n${paths}\n</svg>\n`;
}
function vcShow(){
 let tem=false;try{tem=localStorage.getItem(VC_KEY)==='sim';}catch{}
 $('vector-vc-need').hidden=tem;$('vector-vc-steps').hidden=!tem;$('vector-vc-foot').hidden=!tem;
 $('vector-vc-heading').textContent=tem?'Editar no VectorCraft':'Você tem o VectorCraft?';
}
$('vector-vc-open').onclick=()=>{if(!vecParts)return;$('vector-vc-saved').textContent='';vcShow();$('vector-vc-dialog').showModal();};
$('vector-vc-have').onclick=()=>{try{localStorage.setItem(VC_KEY,'sim');}catch{}vcShow();};
$('vector-vc-download').onclick=()=>{
 if(!vecParts?.length)return toast('Não há desenho para baixar.');
 const name=`${vectorBaseName()} - para editar.svg`,url=URL.createObjectURL(new Blob([vectorSvg()],{type:'image/svg+xml'}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('vector-vc-saved').textContent=`Baixado: ${name} (na pasta de downloads do navegador).`;
};
$('vector-vc-return').onclick=()=>$('vector-vc-file').click();
$('vector-vc-file').onchange=async()=>{
 const file=$('vector-vc-file').files[0];$('vector-vc-file').value='';if(!file)return;
 if(!/\.(svg|pdf|ai)$/i.test(file.name))return toast('Traga o arquivo salvo como SVG, PDF ou AI. Imagens (PNG, JPG) perdem a edição vetorial.');
 if(vecHistory.length&&!confirm('Trazer o arquivo do VectorCraft substitui o desenho atual, com as edições feitas aqui. Continuar?'))return;
 const nome=vectorBaseName();
 $('vector-vc-dialog').close();
 if(await uploadVector(file)){vcOrigem=nome;vec.name=nome+'.svg';$('vector-name').textContent=`${nome} (editado no VectorCraft)`;vectorSync();
  if(vec.motivoVetor)toast(DICAS_VC[vec.motivoVetor]||`O arquivo não veio só com formas preenchidas (${vec.motivoVetor}); o sistema redesenhou a partir da imagem.`);}
};

// A prévia ocupa a tela até a barra "Exportar DXF", sem rolar a página: só o painel de ajustes rola.
// A altura é medida (o título da página e a barra mudam de tamanho), não chutada no CSS.
function fitVectorLayout(){
 const editor=$('vector-editor'),layout=editor?.querySelector('.editor-layout'),bar=document.querySelector('#vector .export-bar');
 if(!layout||!editor.offsetParent)return;
 const fundo=editor.getBoundingClientRect().bottom+scrollY+parseFloat(getComputedStyle(editor).marginBottom)+(bar?.offsetHeight||0);
 const altura=Math.max(420,Math.floor(layout.offsetHeight-(fundo-innerHeight)));
 if(Math.abs(altura-layout.offsetHeight)>1)layout.style.height=altura+'px';
}
window.addEventListener('resize',fitVectorLayout);
// As edições rodam dentro de guard(), com o sistema ocupado: ao liberar, os botões (Exportar DXF, Apagar…) são reavaliados.
const vectorSetBusy=setBusy;setBusy=function(value){vectorSetBusy(value);if(!value&&!$('vector').hidden)vectorSync();};
new ResizeObserver(fitVectorLayout).observe($('vector-editor'));
setVectorView('engrave');vectorSync();
