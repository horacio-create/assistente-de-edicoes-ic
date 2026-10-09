'use strict';

const editionName=document.createElement('button');editionName.id='edition-name';editionName.type='button';editionName.className='edition-name text-button';editionName.hidden=true;
editionName.dataset.help='Renomear esta edição. O nome aparece nas edições recentes e no histórico.';
editionName.setAttribute('aria-label','Renomear edição');$('page-title').after(editionName);
const renameDialog=document.createElement('dialog');renameDialog.id='rename-dialog';renameDialog.setAttribute('aria-labelledby','rename-heading');
const namePencil=icon('pencil');
renameDialog.innerHTML='<div class="dialog-head"><h2 id="rename-heading">Nome da edição</h2><button class="close" type="button" aria-label="Fechar">'+icon('x')+'</button></div><form id="rename-form"><label for="edition-title">Nome</label><input id="edition-title" maxlength="90" required autocomplete="off"><div class="dialog-footer"><button class="secondary" type="button" id="rename-cancel">Cancelar</button><button class="primary" type="submit">Salvar nome</button></div></form>';
document.body.append(renameDialog);let renameJob=null;
renameDialog.querySelector('.close').onclick=$('rename-cancel').onclick=()=>renameDialog.close();
async function openRename(id){
 await guard(async()=>{if(job?.id===id)await save();renameJob=await request('/api/job?id='+id);$('edition-title').value=renameJob.title;renameDialog.showModal();$('edition-title').focus();$('edition-title').select();});
}
editionName.onclick=()=>{if(job)openRename(job.id);};
$('rename-form').onsubmit=e=>{e.preventDefault();guard(async()=>{
 const renamed=await request('/api/rename',{id:renameJob.id,revision:renameJob.revision,title:$('edition-title').value});
 if(job?.id===renamed.id){job=renamed;plan=null;syncEditionName();$('save-state').textContent='Nome salvo neste PC';}
 renameDialog.close();if(!$('recent').hidden)await loadRecent();if(!$('history').hidden)await loadHistory();toast('Nome da edição salvo.');
});};
function syncEditionName(){editionName.hidden=!job||$('studio').hidden;const label=document.createElement('span');label.textContent=job?.title||'Nova edição';editionName.replaceChildren(label);editionName.insertAdjacentHTML('beforeend',namePencil);editionName.disabled=busy;}
const namesUpdateCounts=updateCounts;updateCounts=function(){namesUpdateCounts();syncEditionName();};
const namesShowView=showView;showView=async function(view){await namesShowView(view);syncEditionName();};
const namesSetBusy=setBusy;setBusy=function(value){namesSetBusy(value);syncEditionName();};
const namesLoadRecent=loadRecent;loadRecent=async function(){
 await namesLoadRecent();for(const card of $('recent-list').querySelectorAll('.recent-card')){
  const wrapper=document.createElement('div');wrapper.className='recent-entry';card.replaceWith(wrapper);wrapper.append(card);
  const rename=document.createElement('button');rename.type='button';rename.className='recent-rename text-button';rename.innerHTML=namePencil;rename.setAttribute('aria-label','Renomear '+card.querySelector('strong').textContent);rename.dataset.help='Renomear esta edição';
  // The renderer assigns the edition ID, independent of list order or title.
  rename.onclick=()=>openRename(card.dataset.jobId);wrapper.append(rename);
 }
};
syncEditionName();
