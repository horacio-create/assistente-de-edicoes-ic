'use strict';
// Logo EAP: remove o fundo ou vetoriza em cores; PNG 1024×1024 em fundo branco, preto e transparente.
const eapDefaults={mode:'clean',background:'auto',threshold:null,keepInner:false,picks:[],connected:false,colors:null,smooth:1,detailPx:2,fixSeams:null,margin:.1,outlinePx:0,outlineColor:null,lightenDark:false};
const eapBackgroundHelp={auto:'Remove o fundo liso detectado nas bordas da imagem.',keep:'Não remove nada: a arte inteira, com estampa ou foto, vai para o quadrado.',pick:'Mantém só as cores clicadas na imagem original; o resto vira fundo.'};
let eapLogo=null,eapSettings={...eapDefaults},eapResult=null,eapSerial=0,eapTimer,eapFolder='';

function eapSync(){
 const s=eapSettings,a=eapLogo?.assessment;
 document.querySelectorAll('[data-eap-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.eapMode===s.mode));b.querySelector('small').hidden=a?.recommended!==b.dataset.eapMode;});
 $('eap-vector-controls').hidden=s.mode!=='vector';
 document.querySelectorAll('[data-eap-bg]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.eapBg===s.background)));
 $('eap-bg-help').textContent=eapBackgroundHelp[s.background];$('eap-auto-controls').hidden=s.background!=='auto';
 $('eap-pick-controls').hidden=$('eap-picker').hidden=s.background!=='pick';$('eap-connected').checked=s.connected;$('eap-clear-picks').disabled=!s.picks.length;
 $('eap-pick-marks').replaceChildren(...s.picks.map(([x,y])=>{const m=document.createElement('span');m.style.left=x*100+'%';m.style.top=y*100+'%';return m;}));
 $('eap-seams').checked=s.fixSeams??eapResult?.fixSeams??false;
 $('eap-outline').value=s.outlinePx;$('eap-outline-value').textContent=s.outlinePx?`${s.outlinePx} px`:'Sem contorno';
 $('eap-outline-auto').checked=s.outlineColor===null;$('eap-outline-color').disabled=s.outlineColor===null;
 if(s.outlineColor||eapResult?.outlineColor)$('eap-outline-color').value=s.outlineColor||eapResult.outlineColor;
 $('eap-auto').checked=s.threshold===null;$('eap-threshold').disabled=s.threshold===null;$('eap-threshold').value=s.threshold??eapResult?.threshold??128;
 $('eap-threshold-value').textContent=s.threshold===null?`Auto${eapResult?.threshold?' · '+eapResult.threshold:''}`:s.threshold;
 $('eap-inner').checked=s.keepInner;$('eap-lighten').checked=s.lightenDark;
 $('eap-colors-auto').checked=s.colors===null;$('eap-colors').disabled=s.colors===null;$('eap-colors').value=s.colors??eapResult?.colors??3;
 $('eap-colors-value').textContent=s.colors===null?`Auto${eapResult?.colors?' · '+eapResult.colors:''}`:s.colors;
 $('eap-smooth').value=s.smooth;$('eap-smooth-value').textContent=Number(s.smooth).toFixed(2);
 $('eap-detail').value=s.detailPx;$('eap-detail-value').textContent=`${String(s.detailPx).replace('.',',')} px`;
 $('eap-margin').value=s.margin;$('eap-margin-value').textContent=`${Math.round(s.margin*100)}%`;
 $('eap-empty').hidden=!!eapLogo;$('eap-editor').hidden=!eapLogo;$('eap-export').disabled=!eapResult||busy;
 $('eap-export-info').textContent=eapResult?`${eapLogo.name} · ${s.mode==='vector'?'vetorizada':'fundo removido'}`:eapLogo?'Processando…':'Adicione uma logo';
 $('eap-lighten-label').classList.toggle('attention',!s.lightenDark&&(eapResult?.darkShare??0)>.05);
 if(a){$('eap-quality').textContent=a.text;$('eap-quality').classList.toggle('warn',a.recommended==='vector');}
}
function eapChange(patch){Object.assign(eapSettings,patch);eapSync();queueEap();}
function queueEap(){clearTimeout(eapTimer);const serial=++eapSerial;$('eap-busy').hidden=false;$('eap-export').disabled=true;eapTimer=setTimeout(()=>renderEap(serial),300);}
async function renderEap(serial){
 if(!eapLogo)return;
 if(eapSettings.background==='pick'&&!eapSettings.picks.length){
  eapResult=null;for(const key of ['white','black','transparent'])$('eap-'+key).removeAttribute('src');
  $('eap-notes').replaceChildren();$('eap-stats').textContent='Clique na logo, na imagem original, para escolher o que manter.';$('eap-busy').hidden=true;eapSync();return;
 }
 try{
  const result=await request('/api/eap/preview',{id:eapLogo.id,settings:eapSettings});if(serial!==eapSerial)return;
  eapResult=result;eapLogo.assessment=result.assessment;
  for(const key of ['white','black','transparent'])$('eap-'+key).src=result.previews[key];
  const a=result.assessment;
  $('eap-stats').textContent=`Arte original ${a.artPx[0]} × ${a.artPx[1]} px${result.colors?` · ${result.colors} cor${result.colors>1?'es':''}`:''}`;
  $('eap-notes').replaceChildren(...result.notes.map(n=>{const p=document.createElement('p');p.textContent=n;p.insertAdjacentHTML('afterbegin',icon('alert','note-icon'));return p;}));
 }catch(e){if(serial!==eapSerial)return;eapResult=null;$('eap-notes').replaceChildren();$('eap-stats').textContent=e.message;}
 finally{if(serial===eapSerial){$('eap-busy').hidden=true;eapSync();}}
}
async function uploadEap(file){
 if(!file)return;
 await guard(async()=>{
  if(file.size>100*1024*1024)throw new Error('Limite de 100 MB por arquivo.');
  toast(`Abrindo ${file.name}…`);
  const response=await fetch(`/api/eap/upload?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'X-Indoor':'1','Content-Type':'application/octet-stream'},body:file});
  const data=await response.json();if(!response.ok)throw new Error(data.error);
  eapLogo=data;eapResult=null;eapSettings={...eapDefaults,margin:eapSettings.margin,mode:data.assessment.recommended};$('toast').hidden=true;
  $('eap-name').textContent=eapLogo.name;$('eap-source').src=`/eap/${eapLogo.id}`;for(const key of ['white','black','transparent'])$('eap-'+key).removeAttribute('src');
  if(!data.flatBackground)toast('O fundo desta imagem não é liso. Escolha “Manter arte” ou “Isolar cor” em Fundo.');
  eapSync();queueEap();
 });
 $('eap-file').value='';
}
function eapFiles(){
 const base=$('eap-filename').value.trim()||'…',names={white:'fundo branco',black:'fundo preto',transparent:'transparente'};
 const list=[...document.querySelectorAll('[data-eap-version]')].filter(c=>c.checked).map(c=>`${base} - ${names[c.dataset.eapVersion]}.png`);
 if(eapSettings.mode==='vector'&&$('eap-svg').checked)list.push(`${base}.svg`);
 $('eap-file-list').textContent=list.join('\n');$('eap-save').disabled=!list.length||!$('eap-filename').value.trim();$('eap-result').hidden=true;
}
async function openEapExport(){
 if(!eapResult)return;
 const folder=eapFolder||await chooseFolder();if(!folder)return;eapFolder=folder;
 $('eap-folder').textContent=folder;$('eap-filename').value=`EAP - ${eapLogo.name.replace(/\.[^.]+$/,'')}`;
 $('eap-svg-label').hidden=eapSettings.mode!=='vector';eapFiles();$('eap-dialog').showModal();
}
$('eap-choose').onclick=e=>{e.stopPropagation();$('eap-file').click();};
$('eap-replace').onclick=()=>$('eap-file').click();
$('eap-file').onchange=()=>uploadEap($('eap-file').files[0]);
$('eap-empty').onclick=()=>$('eap-file').click();
$('eap-empty').onkeydown=e=>{if(e.target===$('eap-empty')&&['Enter',' '].includes(e.key)){e.preventDefault();$('eap-file').click();}};
for(const zone of [$('eap-empty'),$('eap-editor')]){
 let depth=0;
 zone.addEventListener('dragenter',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();depth++;zone.classList.add('over');});
 zone.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
 zone.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;zone.classList.remove('over');}});
 zone.addEventListener('drop',e=>{e.preventDefault();depth=0;zone.classList.remove('over');uploadEap(e.dataTransfer.files[0]);});
}
document.querySelectorAll('[data-eap-mode]').forEach(b=>b.onclick=()=>{if(eapLogo&&eapSettings.mode!==b.dataset.eapMode)eapChange({mode:b.dataset.eapMode});});
$('eap-auto').onchange=()=>eapChange({threshold:$('eap-auto').checked?null:(eapResult?.threshold??128)});
$('eap-threshold').oninput=()=>eapChange({threshold:Number($('eap-threshold').value)});
$('eap-inner').onchange=()=>eapChange({keepInner:$('eap-inner').checked});
$('eap-colors-auto').onchange=()=>eapChange({colors:$('eap-colors-auto').checked?null:(eapResult?.colors??3)});
$('eap-colors').oninput=()=>eapChange({colors:Number($('eap-colors').value)});
$('eap-smooth').oninput=()=>eapChange({smooth:Number($('eap-smooth').value)});
$('eap-detail').oninput=()=>eapChange({detailPx:Number($('eap-detail').value)});
$('eap-margin').oninput=()=>eapChange({margin:Number($('eap-margin').value)});
$('eap-lighten').onchange=()=>eapChange({lightenDark:$('eap-lighten').checked});
document.querySelectorAll('[data-eap-bg]').forEach(b=>b.onclick=()=>{if(eapLogo&&eapSettings.background!==b.dataset.eapBg)eapChange({background:b.dataset.eapBg});});
$('eap-source').onclick=e=>{
 const r=$('eap-source').getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
 if(x<0||x>1||y<0||y>1||eapSettings.picks.length>=20)return;
 eapChange({picks:[...eapSettings.picks,[Math.round(x*1e4)/1e4,Math.round(y*1e4)/1e4]]});
};
$('eap-clear-picks').onclick=()=>eapChange({picks:[]});
$('eap-connected').onchange=()=>eapChange({connected:$('eap-connected').checked});
$('eap-seams').onchange=()=>eapChange({fixSeams:$('eap-seams').checked});
$('eap-outline').oninput=()=>eapChange({outlinePx:Number($('eap-outline').value)});
$('eap-outline-auto').onchange=()=>eapChange({outlineColor:$('eap-outline-auto').checked?null:$('eap-outline-color').value});
$('eap-outline-color').oninput=()=>eapChange({outlineColor:$('eap-outline-color').value});
$('eap-reset').onclick=()=>eapChange({...eapDefaults,mode:eapLogo?.assessment?.recommended||'clean'});
$('eap-export').onclick=()=>guard(openEapExport);
$('eap-filename').oninput=eapFiles;$('eap-svg').onchange=eapFiles;document.querySelectorAll('[data-eap-version]').forEach(c=>c.onchange=eapFiles);
$('eap-change-folder').onclick=()=>guard(async()=>{const folder=await chooseFolder();if(folder){eapFolder=folder;$('eap-folder').textContent=folder;eapFiles();}});
$('eap-save').onclick=()=>guard(async()=>{
 const versions=[...document.querySelectorAll('[data-eap-version]')].filter(c=>c.checked).map(c=>c.dataset.eapVersion);
 $('eap-result').hidden=false;$('eap-result').textContent='Gerando as logos…';
 try{
  const result=await request('/api/eap/export',{id:eapLogo.id,source:eapLogo.name,settings:eapSettings,folder:eapFolder,name:$('eap-filename').value.trim(),versions,svg:$('eap-svg').checked});
  $('eap-result').textContent=result.files.map(f=>'✓ '+f).join('\n');$('eap-save').disabled=true;
  toast(`${result.files.length} arquivo${result.files.length>1?'s':''} salvo${result.files.length>1?'s':''}.`);
 }catch(e){$('eap-result').textContent=e.message;throw e;}
});
eapSync();
