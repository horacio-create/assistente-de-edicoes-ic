import {connectFileDrop} from './imports.js';
import {suggestBriefing,formatBriefing,validateBriefingSources,validateIntakeDraft} from './briefing.js';
import {parseBrief,uid} from './core.js';
import {FIELD_NAMES} from './corrections.js';
import {saveSourceMedia,readSourceMedia} from './storage.js';
import {recognitionSignals,sourceReviewCounts,audioTime} from './source-review.js';
export function setupIntake({getProject,saveSources,saveDraft,applyScript,notify}){
  const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let projectId=null,sources=[],files=[],busy=false,jobId=null,token=0,lastSources=null,lastDraft=null,warnings=[];
  const previews=new Map();
  const expandedSources=new Set();
  const attentionOnlySources=new Set();
  const reviewSummary=document.createElement('p');reviewSummary.id='intake-review-summary';reviewSummary.className='intake-review-summary';reviewSummary.setAttribute('role','status');$('intake-sources').before(reviewSummary);
  const originalDialog=document.createElement('dialog');originalDialog.className='intake-original-dialog';originalDialog.innerHTML='<button class="button" data-close-original>Fechar print</button><img alt="Print original ampliado">';document.body.append(originalDialog);originalDialog.querySelector('button').onclick=()=>originalDialog.close();
  async function hydrateOriginals(){const target=projectId,loaded=await Promise.allSettled(sources.filter(s=>s.kind!=='text'&&!previews.has(s.id)).map(async s=>({id:s.id,media:await readSourceMedia(s.id)})));if(target!==projectId)return;let changed=false;for(const result of loaded)if(result.status==='fulfilled'&&result.value.media&&sources.some(s=>s.id===result.value.id)&&!previews.has(result.value.id)){const {id,media}=result.value;previews.set(id,{kind:media.kind,url:URL.createObjectURL(media.blob)});changed=true;}if(changed)renderSources();}
  function segmentMarkup(source){const signals=recognitionSignals(source),count=signals.filter(s=>s.attention).length;return `<details class="recognition-segments" ${(source.kind==='audio'&&count)||signals.some(s=>s.reason==='Leitura incerta')?'open':''}><summary>Trechos da leitura inicial · ${count} para conferir</summary><p class="hint">Amarelo indica leitura incerta ou dados importantes. Confira também os demais trechos.</p><label class="check-label"><input type="checkbox" data-only-attention="${esc(source.id)}" ${attentionOnlySources.has(source.id)?'checked':''}> Mostrar só os destacados</label><ol>${signals.map(s=>`<li class="${s.attention?'needs-attention':''}" data-attention="${s.attention}" ${attentionOnlySources.has(source.id)&&!s.attention?'hidden':''}>${s.reason?`<small>${esc(s.reason)}</small>`:''}${source.kind==='audio'&&Number.isFinite(s.start)?`<button class="text-button" data-listen-source="${esc(source.id)}" data-start="${s.start}">Ouvir ${audioTime(s.start)}</button>`:''}<span>${esc(s.text)}</span></li>`).join('')}</ol></details>`;}
  const fields=['clientName','subtitle','services','cta','phone','profile'];
  let origins={},corrections=[],manualFields=[],stale=false,scriptNeedsUpdate=false;
  let aiReady=false;
  const aiOptions=document.createElement('details');aiOptions.className='intake-ai';aiOptions.innerHTML='<summary>Interpretação com IA <span>Opcional</span></summary><p id="intake-ai-status" class="hint">Verificando configuração…</p><label class="check-label"><input id="intake-ai-consent" type="checkbox"> Enviar os textos das fontes à OpenAI para interpretar este pedido</label><button id="intake-ai-run" class="button" disabled>Interpretar textos com IA</button><p class="hint">Áudios e prints são lidos primeiro neste computador. Esta opção envia somente mensagens e textos reconhecidos. O resultado precisa ser revisado e pode ter custo na conta da API.</p>';
  $('intake-status').after(aiOptions);
  const evidence=document.createElement('section');evidence.id='intake-evidence';evidence.className='intake-warning';$('intake-warnings').after(evidence);
  function renderEvidence(){
    const applied=corrections.filter(c=>c.status==='applied'),pending=corrections.filter(c=>c.status==='pending');
    const row=c=>`<p><strong>${c.status==='applied'?'Aplicada à proposta':'Pendente de revisão'} · ${FIELD_NAMES[c.field]}</strong><br>${esc(c.excerpt)}<br><small>${esc(c.sourceName)}</small>${c.status==='applied'?`<br><small>Antes: ${esc(c.before||'vazio')}<br>Depois: ${esc(c.after||'removido')}</small>`:''}</p>`;
    evidence.innerHTML=`${stale?'<p><strong>As fontes mudaram.</strong> Clique em Identificar informações novamente antes de gerar ou usar o roteiro.</p>':''}<h3>De onde vieram as informações</h3><p class="hint">Correções explícitas seguem a ordem das fontes abaixo. Use as setas para ajustar essa ordem antes de identificar.</p>${fields.map(key=>`<p><strong>${FIELD_NAMES[key]}:</strong> ${manualFields.includes(key)?'revisado manualmente':(origins[key]||[]).length?(origins[key]||[]).map(o=>`<button class="text-button" data-show-evidence="${esc(o.sourceId)}">${esc(o.sourceName)}</button>`).join(' · '):'sem origem identificada; confira o campo'}</p>`).join('')}${pending.length?'<h3>Correções pendentes</h3>'+pending.map(row).join(''):''}${applied.length?`<details data-applied-corrections><summary>${applied.length} correção(ões) aplicada(s) · conferir antes e depois</summary>${applied.map(row).join('')}</details>`:''}`;
    evidence.querySelectorAll('[data-show-evidence]').forEach(button=>button.onclick=()=>{const source=document.querySelector(`[data-source-details="${CSS.escape(button.dataset.showEvidence)}"]`);if(source){source.open=true;source.scrollIntoView({behavior:'smooth',block:'center'});}else notify('Essa fonte foi removida. Identifique as informações novamente.');});
    if(scriptNeedsUpdate)evidence.insertAdjacentHTML('afterbegin','<p><strong>Os campos mudaram.</strong> Gere novamente ou edite o roteiro antes de usar no pedido.</p>');
    $('intake-generate').disabled=stale;$('intake-apply').disabled=stale||scriptNeedsUpdate;
  }
  function updateNextAction(){
    const readable=sources.filter(s=>s.text.trim()).length,pendingMessage=!!$('intake-message').value.trim();
    $('intake-ai-run').disabled=!aiReady||busy||!!files.length||pendingMessage||!readable||!$('intake-ai-consent').checked;
    $('intake-next-read').hidden=busy||!files.length;$('intake-next-read').textContent=`Ler ${files.length} arquivo(s) →`;
    $('intake-suggest').hidden=busy||!!files.length;
    $('intake-suggest').disabled=busy||!!files.length||pendingMessage||!readable;
    $('intake-resume').hidden=busy||!!files.length||pendingMessage||$('intake-review').hidden;
    $('intake-next-title').textContent=busy?'Leitura em andamento':files.length?'Arquivos aguardando leitura':pendingMessage?'Mensagem ainda não adicionada':readable?'Leitura concluída — continuar para o briefing':sources.length?'Nenhum texto disponível — confira os avisos':'Comece pelo pedido recebido';
    $('intake-next-description').textContent=busy?'Aguarde a leitura terminar. Os resultados aparecerão nas fontes abaixo.':files.length?`${files.length} arquivo(s) aguardam leitura. Leia este lote antes de identificar as informações.`:pendingMessage?'Clique em “Adicionar mensagem ao pedido” para incluir o texto digitado.':readable?`${readable} fonte(s) com texto. Abra as fontes para conferir e depois identifique as informações.`:sources.length?'Nenhum texto foi reconhecido. Confira os avisos nas fontes e envie o arquivo novamente.':'Adicione uma mensagem, um print ou um áudio. O próximo passo será indicado aqui.';
  }
  $('intake-ai-consent').onchange=updateNextAction;
  async function aiAvailability(){try{const r=await fetch('api/ai/availability');if(!r.ok)throw new Error();const state=await r.json();aiReady=!!state.ready;$('intake-ai-status').textContent=state.message;}catch{aiReady=false;$('intake-ai-status').textContent='IA indisponível. Continue com a identificação local.';}updateNextAction();}
  $('intake-ai-run').onclick=async()=>{
    if(!aiReady||!$('intake-ai-consent').checked||busy||files.length)return;
    const run=++token,target=getProject().id,original=JSON.stringify(sources);busy=true;renderFiles();renderSources();$('intake-progress').textContent='Interpretando os textos com IA…';
    try{const response=await fetch('api/ai/briefing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sources,consent:true})}),proposal=await response.json();if(!response.ok)throw new Error(proposal.error||'A IA não concluiu o pedido.');if(run!==token||target!==getProject().id)return;if(original!==JSON.stringify(sources))throw new Error('As fontes mudaram durante a interpretação. Os campos anteriores foram preservados.');
      validateIntakeDraft(proposal);const savedFields=readFields(),reviewed=[...manualFields];origins=proposal.origins;corrections=proposal.corrections;manualFields=reviewed;stale=false;scriptNeedsUpdate=false;
      for(const key of fields)$('intake-'+key).value=reviewed.includes(key)?savedFields[key]:proposal.fields[key];for(const key of ['logo','photos','qr'])$('intake-'+key).checked=proposal.fields[key];warnings=[...proposal.warnings];if(reviewed.length)warnings.push('Seus campos revisados manualmente foram mantidos. Gere o roteiro após conferir.');
      $('intake-proposal').value=reviewed.length?'':proposal.script;$('intake-review').hidden=false;$('intake-script-found').hidden=!proposal.script;$('intake-warnings').replaceChildren(...warnings.map(w=>{const p=document.createElement('p');p.textContent=w;return p;}));storeDraft();$('intake-progress').textContent='Proposta de IA pronta. Confira os campos e as origens antes de gerar o roteiro.';$('intake-review').scrollIntoView({block:'start',behavior:'smooth'});
    }catch(error){if(run===token){$('intake-progress').textContent='IA não concluída. O pedido anterior foi preservado.';notify(error.message);}}finally{if(run===token){busy=false;renderFiles();renderSources();}}
  };
  async function refreshAvailability(){try{const r=await fetch('api/reader/availability');const state=await r.json();$('intake-status').textContent=state.message;$('intake-status').dataset.ready=state.ready?'yes':'no';}catch{$('intake-status').textContent='Reinicie o aplicativo local para ativar a leitura de arquivos.';}}
  function persist(next,{contentChanged=true}={}){validateBriefingSources(next);sources=structuredClone(next);saveSources(sources);if(contentChanged&&!$('intake-review').hidden){stale=true;storeDraft();}renderSources();}
function renderSources(){
  const counts=sourceReviewCounts(sources);reviewSummary.textContent=sources.length?`${counts.reviewed} de ${counts.total} fontes conferidas · ${counts.attention} trecho(s) destacado(s).`:'';
  $('intake-sources').innerHTML=sources.map(source=>{const media=previews.get(source.id);return `<article class="intake-source"><div class="panel-heading"><h3>${esc(source.name)}</h3><button class="text-button danger" data-remove-source="${esc(source.id)}" ${busy?'disabled':''}>Remover</button></div><details data-source-details="${esc(source.id)}" ${expandedSources.has(source.id)||!source.text.trim()?'open':''}><summary>${source.kind==='audio'?'Áudio transcrito':source.kind==='image'?'Print lido':'Mensagem adicionada'} · ${source.reviewedAt?'Conferida':'Revisão pendente'}${source.warnings.length?` · ${source.warnings.length} aviso(s)`:''}</summary>${source.warnings.map(w=>`<p class="intake-warning">${esc(w)}</p>`).join('')}<div class="intake-compare"><section class="intake-original-column">${media?(media.kind==='audio'?`<audio data-original-audio="${esc(source.id)}" class="intake-original" controls src="${media.url}" preload="metadata"></audio>`:`<button class="original-image-button" data-enlarge-source="${esc(source.id)}"><img class="intake-original" src="${media.url}" alt="Print original para conferência"><span>Ampliar print</span></button>`):source.kind!=='text'?`<label class="drop-zone original-reattach" tabindex="0" role="button"><strong>Reanexar original</strong><small>Arraste ou clique. O original antigo não está neste navegador.</small><input data-attach-source="${esc(source.id)}" type="file" accept="${source.kind==='image'?'image/png,image/jpeg,image/webp':'audio/*,video/mp4,video/webm'}" hidden></label>`:''}${segmentMarkup(source)}</section><label>Texto reconhecido — confira e corrija<textarea data-source-text="${esc(source.id)}" rows="14" maxlength="50000">${esc(source.text)}</textarea><small class="hint">As correções são salvas neste campo; os trechos iniciais ficam ao lado para comparação.</small></label></div><label class="check-label source-reviewed"><input type="checkbox" data-source-reviewed="${esc(source.id)}" ${source.reviewedAt?'checked':''} ${busy?'disabled':''}> Conferi esta fonte com o original</label></details></article>`;}).join('');
  document.querySelectorAll('[data-source-details]').forEach(el=>el.ontoggle=()=>{if(el.isConnected){if(el.open)expandedSources.add(el.dataset.sourceDetails);else expandedSources.delete(el.dataset.sourceDetails);}});
  document.querySelectorAll('[data-remove-source]').forEach(button=>{const id=button.dataset.removeSource,index=sources.findIndex(s=>s.id===id);for(const [delta,label] of [[-1,'Subir fonte'],[1,'Descer fonte']]){const move=document.createElement('button');move.className='text-button';move.textContent=delta<0?'↑':'↓';move.setAttribute('aria-label',label+' '+sources[index].name);move.disabled=busy||index+delta<0||index+delta>=sources.length;move.onclick=()=>{const next=structuredClone(sources);[next[index],next[index+delta]]=[next[index+delta],next[index]];persist(next);};button.before(move);}});
  document.querySelectorAll('[data-source-text]').forEach(el=>el.onchange=()=>{try{const next=structuredClone(sources),source=next.find(s=>s.id===el.dataset.sourceText);if(source.text===el.value)return;source.text=el.value;source.reviewedAt=null;persist(next);}catch(err){notify(err.message);renderSources();}});
  document.querySelectorAll('[data-source-reviewed]').forEach(el=>el.onchange=()=>{const next=structuredClone(sources);next.find(s=>s.id===el.dataset.sourceReviewed).reviewedAt=el.checked?new Date().toISOString():null;persist(next,{contentChanged:false});});
  document.querySelectorAll('[data-only-attention]').forEach(el=>el.onchange=()=>{if(el.checked)attentionOnlySources.add(el.dataset.onlyAttention);else attentionOnlySources.delete(el.dataset.onlyAttention);el.closest('.recognition-segments').querySelectorAll('li').forEach(li=>li.hidden=el.checked&&li.dataset.attention!=='true');});
  document.querySelectorAll('[data-listen-source]').forEach(button=>button.onclick=()=>{const audio=document.querySelector(`[data-original-audio="${CSS.escape(button.dataset.listenSource)}"]`);if(!audio)return notify('Reanexe o áudio original para ouvir este trecho.');audio.currentTime=Number(button.dataset.start);audio.play().catch(()=>notify('Use o controle de reprodução para ouvir o áudio.'));});
  document.querySelectorAll('[data-enlarge-source]').forEach(button=>button.onclick=()=>{originalDialog.querySelector('img').src=previews.get(button.dataset.enlargeSource).url;originalDialog.showModal();});
  document.querySelectorAll('[data-attach-source]').forEach(input=>connectFileDrop(input,input.closest('label'),async file=>{const target=projectId,source=sources.find(s=>s.id===input.dataset.attachSource);if(!source)throw Error('Fonte removida.');const valid=source.kind==='image'?/^(image\/(png|jpeg|webp))$/.test(file.type):/\.(mp3|wav|ogg|opus|m4a|mp4|webm|flac)$/i.test(file.name);if(!valid)throw Error('Reanexe o mesmo tipo de material desta fonte.');await saveSourceMedia(source.id,{name:file.name,kind:source.kind,blob:file});if(projectId!==target)return;const previous=previews.get(source.id);if(previous)URL.revokeObjectURL(previous.url);previews.set(source.id,{kind:source.kind,url:URL.createObjectURL(file)});const next=structuredClone(sources);next.find(s=>s.id===source.id).reviewedAt=null;persist(next);notify('Original reanexado. Confira se corresponde ao texto desta fonte.');return 'Original guardado neste navegador.';}));
  document.querySelectorAll('[data-remove-source]').forEach(el=>el.onclick=()=>{if(!busy){const media=previews.get(el.dataset.removeSource);if(media)URL.revokeObjectURL(media.url);previews.delete(el.dataset.removeSource);persist(sources.filter(s=>s.id!==el.dataset.removeSource));}});
  updateNextAction();
}
    function renderFiles(){
    $('intake-files').innerHTML=files.map(f=>`<div class="intake-file">${f.kind==='image'?`<img src="${f.url}" alt="Print selecionado">`:`<audio controls src="${f.url}" preload="metadata"></audio>`}<div><strong>${esc(f.file.name)}</strong><small>${f.kind==='image'?'Print para leitura local':'Áudio para transcrição local'}</small></div><button class="text-button danger" data-remove-input="${f.id}" ${busy?'disabled':''}>Remover</button></div>`).join('');
    document.querySelectorAll('[data-remove-input]').forEach(el=>el.onclick=()=>{const target=files.find(f=>f.id===el.dataset.removeInput);URL.revokeObjectURL(target.url);files=files.filter(f=>f.id!==target.id);renderFiles();});$('intake-read').disabled=busy||!files.length;$('intake-cancel').hidden=!busy;$('intake-add-message').disabled=busy;
    updateNextAction();
  }
  function readFields(){const result=Object.fromEntries(fields.map(key=>[key,$('intake-'+key).value]));for(const key of ['logo','photos','qr'])result[key]=$('intake-'+key).checked;return result;}
  function storeDraft(){saveDraft({fields:readFields(),script:$('intake-proposal').value,warnings:[...warnings],origins:structuredClone(origins),corrections:structuredClone(corrections),manualFields:[...manualFields],stale,scriptNeedsUpdate});renderEvidence();updateNextAction();}
  function restoreDraft(draft){if(!draft){clearDraft();return;}origins=structuredClone(draft.origins||{});corrections=structuredClone(draft.corrections||[]);manualFields=[...(draft.manualFields||[])];stale=!!draft.stale;scriptNeedsUpdate=!!draft.scriptNeedsUpdate;for(const key of fields)$('intake-'+key).value=draft.fields[key];for(const key of ['logo','photos','qr'])$('intake-'+key).checked=draft.fields[key];warnings=[...draft.warnings];$('intake-proposal').value=draft.script;$('intake-review').hidden=false;$('intake-warnings').innerHTML=warnings.map(w=>`<p>${esc(w)}</p>`).join('');renderEvidence();updateNextAction();}
  for(const key of [...fields,'logo','photos','qr'])$('intake-'+key).onchange=()=>{try{if(fields.includes(key)&&!manualFields.includes(key))manualFields.push(key);if($('intake-proposal').value.trim())scriptNeedsUpdate=true;storeDraft();}catch(err){notify(err.message);}};
  $('intake-proposal').onchange=()=>{try{scriptNeedsUpdate=false;storeDraft();}catch(err){notify(err.message);}};
  function clearDraft(){origins={};corrections=[];manualFields=[];stale=false;scriptNeedsUpdate=false;for(const key of fields)$('intake-'+key).value='';$('intake-logo').checked=true;$('intake-photos').checked=true;$('intake-qr').checked=false;warnings=[];$('intake-proposal').value='';$('intake-review').hidden=true;$('intake-script-found').hidden=true;$('intake-warnings').textContent='';renderEvidence();updateNextAction();}
  function sync(){
    if(getProject().id===projectId){if(getProject().briefingSources!==lastSources){lastSources=getProject().briefingSources;sources=structuredClone(lastSources||[]);renderSources();hydrateOriginals();}if(getProject().intakeDraft!==lastDraft){lastDraft=getProject().intakeDraft;restoreDraft(lastDraft);}return;}
    token++;if(jobId)fetch('api/reader/cancel/'+jobId,{method:'POST'}).catch(()=>{});jobId=null;busy=false;projectId=getProject().id;expandedSources.clear();attentionOnlySources.clear();$('intake-ai-consent').checked=false;
    for(const f of files)URL.revokeObjectURL(f.url);for(const media of previews.values())URL.revokeObjectURL(media.url);previews.clear();files=[];lastSources=getProject().briefingSources;lastDraft=getProject().intakeDraft;sources=structuredClone(lastSources||[]);restoreDraft(lastDraft);$('intake-progress').textContent='';$('intake-message').value='';renderSources();renderFiles();hydrateOriginals();
  }
  $('intake-check').onclick=refreshAvailability;
  $('intake-message').oninput=updateNextAction;
  $('intake-next-read').onclick=()=>$('intake-read').click();
  $('intake-resume').onclick=()=>{$('intake-review').scrollIntoView({behavior:'smooth',block:'start'});};
  $('intake-add-message').onclick=()=>{const text=$('intake-message').value.trim();if(!text)return notify('Cole a mensagem recebida.');try{persist([...sources,{id:uid(),name:`Mensagem ${sources.filter(s=>s.kind==='text').length+1}`,kind:'text',text,warnings:[]}]);$('intake-message').value='';updateNextAction();}catch(err){notify(err.message);}};
  connectFileDrop($('intake-file'),$('intake-drop'),async received=>{
    const target=projectId;
    if(busy)throw new Error('Aguarde a leitura ou cancele antes de adicionar arquivos.');
    if(files.length+received.filter(f=>!f.name.toLowerCase().endsWith('.txt')).length>10)throw new Error('Envie até 10 arquivos por leitura.');
    const media=[],texts=[];let bytes=files.reduce((n,f)=>n+f.file.size,0);
    for(const file of received){
      const ext=file.name.split('.').at(-1).toLowerCase();
      if(ext==='txt'){if(file.size>200000)throw new Error('O texto excede 200 KB.');texts.push({id:uid(),name:file.name,kind:'text',text:await file.text(),warnings:[]});continue;}
      const kind=['png','jpg','jpeg','webp'].includes(ext)?'image':['mp3','wav','ogg','opus','m4a','mp4','webm','flac'].includes(ext)?'audio':null;
      if(!kind)throw new Error('Use PNG/JPG/WebP, TXT ou áudio MP3/WAV/OGG/OPUS/M4A/MP4/WEBM/FLAC.');
      if(file.size>(kind==='image'?8:20)*1024*1024)throw new Error('Prints: até 8 MB. Áudios: até 20 MB e 10 minutos.');bytes+=file.size;if(bytes>40*1024*1024)throw new Error('Envie até 40 MB por leitura.');media.push({id:uid(),kind,file});
    }
    if(projectId!==target)throw new Error('O trabalho foi alterado. Envie os materiais no trabalho correto.');
    if(sources.length+texts.length+files.length+media.length>20)throw new Error('Use até 20 fontes por trabalho. Remova fontes antigas antes de continuar.');
    validateBriefingSources([...sources,...texts]);if(texts.length)persist([...sources,...texts]);files.push(...media.map(f=>({...f,url:URL.createObjectURL(f.file)})));renderFiles();return 'Materiais adicionados. Clique em “Ler arquivos”.';
  },{multiple:true});
  const base64=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(new Error('Não foi possível abrir o arquivo.'));r.readAsDataURL(file);});
  $('intake-read').onclick=async()=>{
    const run=++token,target=projectId,selected=[...files];busy=true;renderFiles();renderSources();$('intake-progress').textContent='Preparando leitura local…';
    try{
      const payload={files:await Promise.all(selected.map(async f=>({id:f.id,name:f.file.name,data:await base64(f.file)})))};
      if(run!==token)return;const response=await fetch('api/reader/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const job=await response.json();if(!response.ok)throw new Error(job.error||'Não foi possível iniciar a leitura.');
      if(run!==token){fetch('api/reader/cancel/'+job.id,{method:'POST'}).catch(()=>{});return;}jobId=job.id;let state;
      for(let i=0;i<1800;i++){
        if(run!==token)return;const r=await fetch('api/reader/status/'+job.id);state=await r.json();if(!r.ok)throw new Error(state.error||'Leitura indisponível.');$('intake-progress').textContent=`${state.message} (${state.done}/${state.total})`;
        if(['complete','error','cancelled'].includes(state.state))break;await new Promise(resolve=>setTimeout(resolve,1000));
      }
      if(target!==getProject().id||run!==token)return;
      if(state.state!=='complete')throw new Error(state.message||'A leitura ainda não foi concluída.');
      const incoming=state.sources.map(s=>({id:s.id,name:s.name,kind:s.kind,text:s.text,segments:s.segments||[],reviewedAt:null,warnings:s.warnings}));for(const f of selected){previews.set(f.id,{kind:f.kind,url:f.url});try{await saveSourceMedia(f.id,{name:f.file.name,kind:f.kind,blob:f.file});}catch{const source=incoming.find(s=>s.id===f.id);if(source&&source.warnings.length<30)source.warnings.push('Não foi possível guardar o original neste navegador; faça a conferência antes de fechar a página.');}}persist([...sources,...incoming]);
      files=files.filter(f=>!selected.includes(f));$('intake-progress').textContent=state.sources.some(s=>s.error)?'Alguns arquivos não puderam ser lidos. Confira os avisos nas fontes.':'Leitura concluída. Confira os textos e clique em “Identificar informações”.';
    }catch(err){if(run===token){$('intake-progress').textContent='Leitura não concluída.';notify(err.message);}}
    finally{if(run===token){busy=false;jobId=null;renderFiles();renderSources();}}
  };
  $('intake-cancel').onclick=()=>{token++;if(jobId)fetch('api/reader/cancel/'+jobId,{method:'POST'}).catch(()=>{});jobId=null;busy=false;$('intake-progress').textContent='Leitura cancelada.';renderFiles();renderSources();};
  $('intake-suggest').onclick=()=>{
    try{const proposal=suggestBriefing(sources);origins=proposal.origins;corrections=proposal.corrections;manualFields=[];stale=false;scriptNeedsUpdate=false;for(const key of fields)$('intake-'+key).value=proposal.fields[key];for(const key of ['logo','photos','qr'])$('intake-'+key).checked=proposal.fields[key];warnings=proposal.warnings;$('intake-review').hidden=false;$('intake-warnings').innerHTML=warnings.map(w=>`<p>${esc(w)}</p>`).join('');$('intake-proposal').value=proposal.script;$('intake-script-found').hidden=!proposal.script;storeDraft();$('intake-review').scrollIntoView({behavior:'smooth',block:'start'});}catch(err){notify(err.message);}
  };
  $('intake-generate').onclick=()=>{try{$('intake-proposal').value=formatBriefing(readFields());scriptNeedsUpdate=false;$('intake-script-found').hidden=true;storeDraft();notify('Roteiro proposto. Confira os textos e instruções antes de usar.');}catch(err){notify(err.message);}};
  $('intake-apply').onclick=()=>{
    // A conferência do briefing já é a revisão do roteiro: as cartelas são montadas em seguida.
    // Se o trabalho já tiver cartelas, "Organizar cartelas" pede confirmação antes de substituí-las.
    try{const script=$('intake-proposal').value.trim();parseBrief(script);applyScript(script);document.querySelector('[data-view="editor"]').click();
      const before=getProject().cards;$('parse').click();
      if(getProject().cards===before)notify('Roteiro levado ao pedido. As cartelas atuais foram mantidas; clique em “Reorganizar cartelas” para montar com o novo roteiro.');}catch(err){notify(err.message);}
  };
  refreshAvailability();aiAvailability();return {sync};
}
