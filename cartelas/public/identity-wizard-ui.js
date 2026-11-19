// "Identidade do cliente" in three steps: search (Instagram and/or site), check the proposal, apply and save.
// Captures sent by the browser extension arrive here on their own and are split, analyzed and proposed automatically.
import {instagramUsername} from './instagram-profile.js';
import {siteImageFile} from './site-import-ui.js';
import {suggestPalette} from './identity-suggest.js';

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ROLES=[['primary','Principal'],['accent','Destaque'],['background','Fundo']];
const SOURCE_NAMES={site:'site',feed:'Instagram'};

export function setupIdentityWizard({before,getToken,references,notify}){
  const $=id=>document.getElementById(id);
  const panel=document.createElement('section');panel.id='identity-wizard';panel.className='identity-wizard';
  panel.innerHTML=`<div class="wizard-head"><h3>Identidade do cliente</h3><ol class="wizard-steps"><li data-wz-mark="1" class="active">Buscar</li><li data-wz-mark="2">Conferir</li><li data-wz-mark="3">Salvar</li></ol></div>
<div class="wizard-step" data-wz-step="1"><p class="hint">Informe o Instagram, o site ou os dois. O Cartelas busca as referências, analisa e propõe o logo e as cores.</p>
<div class="two-col"><label>Instagram<input data-wz-ig maxlength="200" placeholder="@cliente"></label><label>Site (opcional)<input data-wz-site maxlength="500" placeholder="www.cliente.com.br"></label></div>
<button type="button" class="button primary full" data-wz-search>Buscar identidade</button><p class="hint" data-wz-status role="status"></p>
<div class="wizard-capture" data-wz-capture hidden><strong>Agora capture o Instagram no Chrome</strong><ol><li><a data-wz-open target="_blank" rel="noopener noreferrer">Abrir o perfil no Instagram</a> (abra no Google Chrome).</li><li>Clique no ícone <b>C</b> da extensão e em <b>Capturar perfil automaticamente</b>.</li></ol><p class="wizard-waiting" data-wz-waiting>Aguardando as capturas… elas entram aqui sozinhas.</p><button type="button" class="text-button" data-wz-skip>Continuar sem o Instagram</button></div></div>
<div class="wizard-step" data-wz-step="2" hidden><p class="hint" data-wz-summary></p>
<div class="wizard-logo" data-wz-logo-box hidden><h4>Logo</h4><div class="wizard-logos" data-wz-logos></div></div>
<h4>Cores</h4><div class="wizard-palette">${ROLES.map(([key,label])=>`<label class="wizard-slot" data-wz-slot="${key}"><input type="radio" name="wz-role" value="${key}" ${key==='primary'?'checked':''}><span>${label}</span><input type="color" data-wz-color="${key}"><small data-wz-source="${key}"></small></label>`).join('')}</div>
<p class="hint">Para trocar, escolha Principal, Destaque ou Fundo acima e clique numa das cores encontradas:</p><div class="wizard-swatches" data-wz-swatches></div></div>
<div class="wizard-step" data-wz-step="3" hidden><div class="properties-actions"><button type="button" class="button primary" data-wz-save>Aplicar e salvar cliente</button><button type="button" class="button" data-wz-apply>Só aplicar no cadastro</button><button type="button" class="text-button" data-wz-restart>Buscar de novo</button></div><p class="hint" data-wz-done role="status"></p></div>`;
  before.before(panel);
  const find=s=>panel.querySelector(s),status=find('[data-wz-status]');
  let site=null,feedColors=[],logos=[],logoIndex=-1,waiting=false,busy=false,token=getToken(),seenBatches=new Set(),timer=null,feedCount=0;

  function step(n){for(const el of panel.querySelectorAll('[data-wz-step]'))el.hidden=Number(el.dataset.wzStep)>n;panel.querySelectorAll('[data-wz-mark]').forEach(m=>m.classList.toggle('active',Number(m.dataset.wzMark)<=n));}
  function reset(){site=null;feedColors=[];logos.forEach(l=>l.url&&URL.revokeObjectURL(l.url));logos=[];logoIndex=-1;waiting=false;busy=false;feedCount=0;find('[data-wz-capture]').hidden=true;find('[data-wz-done]').textContent='';status.textContent='';for(const el of panel.querySelectorAll('[data-wz-step]'))el.hidden=el.dataset.wzStep!=='1';panel.querySelectorAll('[data-wz-mark]').forEach(m=>m.classList.toggle('active',m.dataset.wzMark==='1'));}
  function igUser(){const raw=find('[data-wz-ig]').value.trim();if(!raw)return '';try{return instagramUsername(raw);}catch{throw Error('Confira o @ ou o endereço do Instagram.');}}

  // Step 2: build the proposal from whatever has arrived (site and/or feed analysis).
  function propose(){
    const proposal=suggestPalette({siteColors:site?.colors||[],feedColors});
    if(!proposal&&!logos.length){status.textContent='Ainda não encontrei cores nem logo. Confira o endereço ou capture o Instagram.';return;}
    if(proposal)for(const [key] of ROLES){find(`[data-wz-color="${key}"]`).value=proposal[key];find(`[data-wz-source="${key}"]`).textContent=proposal.sources[key].length?'do '+proposal.sources[key].map(s=>SOURCE_NAMES[s]).join(' e '):'sugestão';}
    const swatches=find('[data-wz-swatches]');swatches.replaceChildren();
    for(const hex of proposal?.candidates||[]){const b=document.createElement('button');b.type='button';b.className='wizard-swatch';b.style.background=hex;b.title=hex;b.setAttribute('aria-label','Usar '+hex);b.onclick=()=>{const role=panel.querySelector('[name="wz-role"]:checked')?.value||'primary';find(`[data-wz-color="${role}"]`).value=hex;find(`[data-wz-source="${role}"]`).textContent='escolhida por você';};swatches.append(b);}
    const parts=[];if(feedCount)parts.push(feedCount+' publicação(ões) do Instagram');if(site)parts.push('site '+new URL(site.site).hostname);
    find('[data-wz-summary]').textContent='Proposta montada a partir de: '+(parts.join(' e ')||'referências')+'. Confira e troque o que quiser.';
    renderLogos();step(3);status.textContent='';
  }
  function renderLogos(){
    const box=find('[data-wz-logos]');box.replaceChildren();find('[data-wz-logo-box]').hidden=!logos.length;
    logos.forEach((logo,i)=>{const label=document.createElement('label');label.className='wizard-logo-option';label.innerHTML=`<input type="radio" name="wz-logo" value="${i}" ${i===logoIndex?'checked':''}><img alt="${escape(logo.label)}"><span>${escape(logo.label)}</span>`;label.querySelector('img').src=logo.url;label.querySelector('input').onchange=()=>{logoIndex=i;};box.append(label);});
    if(logos.length){const keep=document.createElement('label');keep.className='wizard-logo-option';keep.innerHTML=`<input type="radio" name="wz-logo" value="-1" ${logoIndex<0?'checked':''}><span class="wizard-keep">Manter o logo atual</span>`;keep.querySelector('input').onchange=()=>{logoIndex=-1;};box.append(keep);}
  }
  async function readSite(address){
    status.textContent='Lendo o site…';
    const r=await fetch('api/site/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:address})});
    let value;try{value=await r.json();}catch{throw Error('Reinicie o sistema atualizado para ler sites.');}
    if(!r.ok)throw Error(value.error||'Não foi possível ler o site.');
    site=value;
    for(const item of value.images){try{const res=await fetch(item.previewUrl);if(!res.ok)continue;const blob=await res.blob(),url=URL.createObjectURL(blob);await new Promise((ok,fail)=>{const img=new Image();img.onload=ok;img.onerror=fail;img.src=url;});logos.push({blob,url,label:item.label.replace('Imagem marcada como logo','Logo do site'),kind:item.kind});}catch{/* skip images that do not load */}}
    logoIndex=logos.findIndex(l=>l.kind==='logo');if(logoIndex<0&&logos.length)logoIndex=logos.findIndex(l=>l.kind==='icon');
  }
  async function readMeta(user){
    const availability=await fetch('api/instagram/availability').then(r=>r.ok?r.json():{ready:false}).catch(()=>({ready:false}));
    if(!availability.ready)return false;
    status.textContent='Buscando as publicações pela conexão Meta…';
    const r=await fetch('api/instagram/feed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'discovery',username:user,consent:true})}),value=await r.json();
    if(!r.ok)throw Error(value.error||'A conexão Meta não retornou as publicações.');
    const files=[];for(const post of value.posts.filter(p=>p.previewUrl).slice(0,12)){const res=await fetch(post.previewUrl);if(res.ok){const blob=await res.blob();files.push(new File([blob],'@'+user+' · post-'+post.id+'.jpg',{type:blob.type||'image/jpeg'}));}}
    if(!files.length)return false;
    await references.addFiles(files,{feedPost:true}).catch(()=>0);references.setProfile('https://www.instagram.com/'+user+'/');
    return analyzeFeed(files.length);
  }
  async function analyzeFeed(count){
    status.textContent='Analisando as cores do Instagram…';
    const analysis=await references.analyze();if(!analysis)return false;
    feedColors=analysis.colors.map(c=>({hex:c.hex}));feedCount=count;return true;
  }
  // Captures from the extension: imported into the open client, split into posts and analyzed.
  async function importBatch(batchId){
    const detail=await fetch('api/capture/batches/'+batchId).then(r=>r.ok?r.json():Promise.reject(Error('O lote expirou. Capture novamente.')));
    const user=instagramUsername(detail.profile),wanted=(()=>{try{return igUser();}catch{return '';}})();
    if(wanted&&wanted!==user){status.textContent=`Chegaram capturas de @${user}, mas este cadastro busca @${wanted}. Elas ficaram em Ajustes finos → Capturas do navegador.`;return;}
    if(!wanted)find('[data-wz-ig]').value='@'+user;
    const mine=getToken();busy=true;status.textContent='Recebendo as capturas de @'+user+'…';let posts=0;const ids=[];
    try{
      for(const item of detail.images){
        const res=await fetch(item.url);if(!res.ok)throw Error('O lote expirou. Capture novamente.');
        const file=new File([await res.blob()],item.name,{type:'image/png'});
        if(item.kind==='grid'&&item.rows&&item.columns)posts+=await references.addGridCapture(file,{rows:item.rows,columns:item.columns});
        else{await references.addFiles([file],{deduplicate:true});if(item.kind!=='profile')posts++;}
        ids.push(item.id);
      }
      if(mine!==getToken())return;
      references.setProfile('https://www.instagram.com/'+user+'/');
      await fetch('api/capture/batches/'+batchId+'/ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})}).catch(()=>{});
      waiting=false;find('[data-wz-capture]').hidden=true;
      if(await analyzeFeed(posts))propose();else status.textContent='As capturas chegaram, mas a análise não encontrou cores. Confira em Ajustes finos.';
    }finally{busy=false;}
  }
  async function poll(){
    if(busy||document.hidden||!panel.isConnected||panel.closest('[hidden]'))return;
    try{const state=await fetch('api/capture/state').then(r=>r.ok?r.json():null);if(!state)return;
      for(const batch of state.batches){if(seenBatches.has(batch.id))continue;seenBatches.add(batch.id);await importBatch(batch.id);break;}
    }catch(error){status.textContent=error.message;}
  }
  function startPolling(){if(!timer)timer=setInterval(poll,3000);}
  startPolling();

  find('[data-wz-search]').onclick=async()=>{
    if(busy)return;let user;try{user=igUser();}catch(e){status.textContent=e.message;return;}
    const address=find('[data-wz-site]').value.trim();
    if(!user&&!address){status.textContent='Informe o Instagram ou o site do cliente.';return;}
    busy=true;const mine=getToken();site=null;feedColors=[];logos=[];logoIndex=-1;feedCount=0;
    try{
      if(address)await readSite(address).catch(e=>{status.textContent=e.message+' Seguindo com o que for possível.';});
      let gotFeed=false;if(user)gotFeed=await readMeta(user).catch(()=>false);
      if(mine!==getToken())return;
      if(user&&!gotFeed){
        find('[data-wz-open]').href='https://www.instagram.com/'+user+'/';find('[data-wz-capture]').hidden=false;waiting=true;
        status.textContent=site?'Site lido. Falta capturar o Instagram.':'';
        if(site)propose();
      }else propose();
    }finally{busy=false;}
  };
  for(const input of [find('[data-wz-ig]'),find('[data-wz-site]')])input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find('[data-wz-search]').click();}});
  find('[data-wz-skip]').onclick=()=>{waiting=false;find('[data-wz-capture]').hidden=true;propose();};
  find('[data-wz-restart]').onclick=()=>{reset();find('[data-wz-ig]').focus();};

  async function apply(){
    for(const [key] of ROLES){const input=$('client-'+key);input.value=find(`[data-wz-color="${key}"]`).value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    if($('client-origin'))$('client-origin').value='references';
    if(logoIndex>=0&&logos[logoIndex]){const host=site?new URL(site.site).hostname.replace(/^www\./,''):'cliente';const file=await siteImageFile(logos[logoIndex].blob,'logo-'+host);const list=new DataTransfer();list.items.add(file);const input=$('client-logo-file');input.files=list.files;input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,400));}
    const profile=references.profile();if(profile&&$('client-notes')&&!$('client-notes').value.includes(profile))$('client-notes').value=[$('client-notes').value,'Instagram: '+profile].filter(Boolean).join('\n');
  }
  find('[data-wz-apply]').onclick=async()=>{await apply();find('[data-wz-done]').textContent='Aplicado no cadastro. Clique em Salvar cliente quando quiser guardar.';};
  find('[data-wz-save]').onclick=async()=>{
    if(!$('client-name').value.trim()){const user=(()=>{try{return igUser();}catch{return '';}})();if(site?.title||user)$('client-name').value=(site?.title||'').split(/[|\-–·]/)[0].trim()||'@'+user;}
    if(!$('client-name').value.trim()){find('[data-wz-done]').textContent='Informe o nome do cliente no topo do cadastro e clique de novo.';$('client-name').focus();return;}
    await apply();$('save-client').click();find('[data-wz-done]').textContent='Identidade aplicada e cliente salvo.';
  };

  return {reset(){reset();find('[data-wz-ig]').value='';find('[data-wz-site]').value='';token=getToken();}};
}
