'use strict';
// Vetorização M6S: logo → contornos fechados → DXF em mm para o laser.
const vectorDefaults={widthMm:30,threshold:null,invert:false,smooth:1,detailMm:.08,denoise:true};
let vec=null,vecSettings={...vectorDefaults},vecResult=null,vecSerial=0,vecTimer,vecFolder='',vecView='engrave';

function vectorSync(){
 const s=vecSettings;$('vector-width').value=s.widthMm;$('vector-auto').checked=s.threshold===null;$('vector-threshold').disabled=s.threshold===null;
 $('vector-threshold').value=s.threshold??vecResult?.threshold??128;$('vector-threshold-value').textContent=s.threshold===null?`Auto${vecResult?' · '+vecResult.threshold:''}`:s.threshold;
 $('vector-invert').checked=s.invert;$('vector-denoise').checked=s.denoise;$('vector-smooth').value=s.smooth;$('vector-smooth-value').textContent=Number(s.smooth).toFixed(2);$('vector-detail').value=s.detailMm;
 $('vector-empty').hidden=!!vec;$('vector-editor').hidden=!vec;$('vector-export').disabled=!vecResult||busy;
 $('vector-export-info').textContent=vecResult?`${vec.name} · ${fmtMm(vecResult.width)} × ${fmtMm(vecResult.height)} mm`:vec?'Vetorizando…':'Adicione uma logo';
}
function fmtMm(v){return Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2});}
function vectorChange(patch){Object.assign(vecSettings,patch);vectorSync();queueTrace();}
function queueTrace(){clearTimeout(vecTimer);const serial=++vecSerial;$('vector-busy').hidden=false;$('vector-export').disabled=true;vecTimer=setTimeout(()=>traceVector(serial),250);}
async function traceVector(serial){
 if(!vec)return;
 try{
  const result=await request('/api/vector/trace',{id:vec.id,settings:vecSettings});if(serial!==vecSerial)return;
  vecResult=result;drawVector();
 }catch(e){if(serial!==vecSerial)return;vecResult=null;$('vector-path').setAttribute('d','');$('vector-notes').replaceChildren();$('vector-stats').textContent=e.message;$('vector-size').textContent='— mm';}
 finally{if(serial===vecSerial){$('vector-busy').hidden=true;vectorSync();}}
}
function drawVector(){
 const r=vecResult,m=Math.max(r.width,r.height)*.04,svg=$('vector-svg');
 svg.setAttribute('viewBox',`${-r.width/2-m} ${-r.height/2-m} ${r.width+2*m} ${r.height+2*m}`);
 svg.style.setProperty('--stroke',Math.max(r.width,r.height)/500);
 $('vector-path').setAttribute('d',r.path);
 $('vector-size').textContent=`${fmtMm(r.width)} × ${fmtMm(r.height)} mm`;
 $('vector-stats').textContent=`${r.contours} contorno${r.contours!==1?'s':''} fechado${r.contours!==1?'s':''} · ${r.points.toLocaleString('pt-BR')} pontos`;
 $('vector-notes').replaceChildren(...r.notes.map(n=>{const p=document.createElement('p');p.textContent=n;p.insertAdjacentHTML('afterbegin',icon('alert','note-icon'));return p;}));
}
function setVectorView(view){
 vecView=view;const shell=document.querySelector('.vector-shell');shell.classList.toggle('outline',view==='outline');shell.classList.toggle('original',view==='original');
 $('vector-original').hidden=view!=='original';$('vector-svg').style.display=view==='original'?'none':'';
 document.querySelectorAll('[data-vector-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vectorView===view)));
}
async function uploadVector(file){
 if(!file)return;
 await guard(async()=>{
  if(file.size>100*1024*1024)throw new Error('Limite de 100 MB por arquivo.');
  toast(`Abrindo ${file.name}…`);
  const response=await fetch(`/api/vector/upload?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'X-Indoor':'1','Content-Type':'application/octet-stream'},body:file});
  const data=await response.json();if(!response.ok)throw new Error(data.error);
  vec=data;vecResult=null;vecSettings={...vectorDefaults,widthMm:vecSettings.widthMm};$('toast').hidden=true;
  $('vector-name').textContent=vec.name;$('vector-original').src=`/vetor/${vec.id}`;$('vector-path').setAttribute('d','');
  vectorSync();queueTrace();
 });
 $('vector-file').value='';
}
async function openVectorExport(){
 if(!vecResult)return;
 const folder=vecFolder||await chooseFolder();if(!folder)return;vecFolder=folder;
 $('vector-folder').textContent=folder;$('vector-result').hidden=true;$('vector-save').disabled=false;
 $('vector-filename').value=`M6S - ${vec.name.replace(/\.[^.]+$/,'')} ${dateName()}`;
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
$('vector-width').oninput=()=>{const v=Number($('vector-width').value);if($('vector-width').validity.valid&&v>=1&&v<=500)vectorChange({widthMm:v});};
$('vector-width').onchange=()=>{if(!$('vector-width').validity.valid||!$('vector-width').value){$('vector-width').value=vecSettings.widthMm;toast('Use uma largura entre 1 e 500 mm.');}};
$('vector-detail').oninput=()=>{const v=Number($('vector-detail').value);if($('vector-detail').validity.valid&&$('vector-detail').value!=='')vectorChange({detailMm:v});};
$('vector-detail').onchange=()=>{if(!$('vector-detail').validity.valid||$('vector-detail').value===''){$('vector-detail').value=vecSettings.detailMm;toast('Use um valor entre 0 e 2 mm.');}};
$('vector-auto').onchange=()=>vectorChange({threshold:$('vector-auto').checked?null:(vecResult?.threshold??128)});
$('vector-threshold').oninput=()=>vectorChange({threshold:Number($('vector-threshold').value)});
$('vector-smooth').oninput=()=>vectorChange({smooth:Number($('vector-smooth').value)});
$('vector-invert').onchange=()=>vectorChange({invert:$('vector-invert').checked});
$('vector-denoise').onchange=()=>vectorChange({denoise:$('vector-denoise').checked});
$('vector-reset').onclick=()=>vectorChange({...vectorDefaults,widthMm:vecSettings.widthMm});
document.querySelectorAll('[data-vector-view]').forEach(b=>b.onclick=()=>setVectorView(b.dataset.vectorView));
$('vector-export').onclick=()=>guard(openVectorExport);
$('vector-change-folder').onclick=()=>guard(async()=>{const folder=await chooseFolder();if(folder){vecFolder=folder;$('vector-folder').textContent=folder;}});
$('vector-save').onclick=()=>guard(async()=>{
 const name=$('vector-filename').value.trim();if(!name)throw new Error('Preencha o nome do arquivo.');
 $('vector-result').hidden=false;$('vector-result').textContent='Gerando o DXF…';
 try{
  const result=await request('/api/vector/export',{id:vec.id,source:vec.name,settings:vecSettings,folder:vecFolder,name});
  $('vector-result').textContent=`✓ ${result.name}\n${result.path}`;$('vector-save').disabled=true;
  toast(`DXF salvo: ${fmtMm(result.width)} × ${fmtMm(result.height)} mm.`);
 }catch(e){$('vector-result').textContent=e.message;throw e;}
});
$('vector-filename').oninput=()=>{$('vector-save').disabled=false;$('vector-result').hidden=true;};
setVectorView('engrave');vectorSync();
