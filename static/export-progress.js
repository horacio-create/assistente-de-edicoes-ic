'use strict';

const exportProgressDialog=document.createElement('dialog');exportProgressDialog.id='export-progress-dialog';exportProgressDialog.setAttribute('aria-labelledby','export-progress-title');
exportProgressDialog.innerHTML='<h2 id="export-progress-title">Exportando</h2><p id="export-time" role="status">Calculando tempo restante…</p><div class="export-progress-row"><progress id="export-progress-bar" max="100" value="0" aria-label="Progresso da exportação"></progress><strong id="export-percent">0%</strong></div><p id="export-progress-detail"></p><div class="dialog-footer"><button id="cancel-export" type="button" class="secondary">Cancelar</button></div>';
document.body.append(exportProgressDialog);exportProgressDialog.addEventListener('cancel',e=>e.preventDefault());
const progressRequest=request;
request=async function(path,body,method){
 if(path!=='/api/export')return progressRequest(path,body,method);
 let polling=true,cancelRequested=false;const token=body.token;
 $('cancel-export').disabled=false;$('cancel-export').textContent='Cancelar';
 $('cancel-export').onclick=async()=>{if(cancelRequested)return;cancelRequested=true;$('cancel-export').disabled=true;$('cancel-export').textContent='Cancelando…';
  try{await progressRequest('/api/export-cancel',{token});}catch(error){if(polling){cancelRequested=false;$('cancel-export').disabled=false;$('cancel-export').textContent='Cancelar';toast(error.message);}}
 };
 $('export-progress-title').textContent='Exportando '+(plan?.files[0]?.name||'seu arquivo');
 $('export-progress-bar').value=0;$('export-percent').textContent='0%';$('export-time').textContent='Calculando tempo restante…';$('export-progress-detail').textContent='';exportProgressDialog.showModal();
 const poll=async()=>{while(polling){try{const state=await progressRequest('/api/export-progress?token='+encodeURIComponent(token));if(!polling)break;
  if(state.name)$('export-progress-title').textContent='Exportando '+state.name;
  $('export-progress-bar').value=state.percent||0;$('export-percent').textContent=Math.floor(state.percent||0)+'%';
  $('export-time').textContent=cancelRequested?'Cancelando exportação…':state.remaining===null?'Calculando tempo restante…':state.remaining<1?'Finalizando…':'Tempo restante estimado: '+remainingTime(state.remaining);
  $('export-progress-detail').textContent=state.detail||'';
 }catch(error){/* The export response reports failures; a missed poll keeps its last value. */}if(polling)await new Promise(resolve=>setTimeout(resolve,500));}};
 const pollingTask=poll();
 try{const result=await progressRequest(path,body,method);if(!result.cancelled&&result.results.length&&result.results.every(r=>r.ok)){$('export-progress-bar').value=100;$('export-percent').textContent='100%';$('export-time').textContent='Exportação concluída';await new Promise(resolve=>setTimeout(resolve,250));}return result;}
 finally{polling=false;exportProgressDialog.close();await pollingTask;}
};
function remainingTime(seconds){const time=Math.max(1,Math.ceil(seconds)),minutes=Math.floor(time/60),remainder=time%60;return minutes?`${minutes} min${remainder?' e '+remainder+' s':''}`:`${time} s`;}
