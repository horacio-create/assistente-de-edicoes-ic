// "Ler site do cliente": suggests brand colors and logo candidates from the client's public website.
// Nothing is applied automatically; each color or image needs a click.
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The analysis and the client logo accept PNG, JPG or WebP; SVG logos are rasterized here.
export async function siteImageFile(blob,name){
  if(blob.type!=='image/svg+xml')return new File([blob],name+'.'+(blob.type.split('/')[1]||'png').replace('jpeg','jpg'),{type:blob.type});
  const url=URL.createObjectURL(blob);
  try{
    const image=new Image();image.src=url;await image.decode();
    const w=image.naturalWidth||800,h=image.naturalHeight||800,scale=Math.min(4,1200/Math.max(w,h)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Não foi possível converter o logo.')),'image/png'));
    return new File([png],name+'.png',{type:'image/png'});
  }finally{URL.revokeObjectURL(url);}
}

export function setupSiteImport({before,getToken,onImport,notify}){
  const panel=document.createElement('details');panel.id='site-import';panel.className='instagram-import site-import';
  panel.innerHTML='<summary>Ler site do cliente <span>Logo e cores</span></summary><p class="hint">Lê a página pública do site, Linktree ou cardápio online e sugere as cores da marca e imagens de logo. Nada é aplicado sem o seu clique.</p><label>Site do cliente<input data-site-url maxlength="500" placeholder="www.cliente.com.br"></label><div class="properties-actions"><button type="button" class="button" data-site-read>Ler site</button></div><p data-site-state class="hint" role="status"></p><div data-site-colors class="site-colors"></div><div data-site-images class="instagram-posts site-images"></div><div class="properties-actions" data-site-image-actions hidden><button type="button" class="button" data-site-logo>Usar como logo do cliente</button><button type="button" class="button" data-site-analyze>Usar na análise de cores</button></div>';
  before.before(panel);
  const find=s=>panel.querySelector(s),state=find('[data-site-state]');let current=null,busy=false,token=null;
  function controls(){find('[data-site-read]').disabled=busy;const checked=panel.querySelectorAll('[data-site-images] input:checked').length;find('[data-site-logo]').disabled=busy||checked!==1;find('[data-site-analyze]').disabled=busy||!checked;}
  function clear(){current=null;find('[data-site-colors]').replaceChildren();find('[data-site-images]').replaceChildren();find('[data-site-image-actions]').hidden=true;}
  function setColor(key,color){const input=document.getElementById('client-'+key);if(!input)return;input.value=color;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));notify(`Cor ${color} aplicada em ${({primary:'Principal',accent:'Destaque',background:'Fundo'})[key]}. Clique em Salvar cliente para guardar.`);}
  function render(result){
    clear();current=result;
    const colors=find('[data-site-colors]');
    if(result.colors.length)colors.innerHTML='<h4>Cores encontradas</h4>'+result.colors.map(c=>`<div class="site-color"><span class="site-swatch" style="background:${escape(c.color)}"></span><span><b>${escape(c.color)}</b><small>${escape(c.reason)}</small></span><span class="site-color-use"><button type="button" class="text-button" data-site-color="${escape(c.color)}" data-site-key="primary">Principal</button><button type="button" class="text-button" data-site-color="${escape(c.color)}" data-site-key="accent">Destaque</button><button type="button" class="text-button" data-site-color="${escape(c.color)}" data-site-key="background">Fundo</button></span></div>`).join('');
    colors.querySelectorAll('[data-site-color]').forEach(b=>b.onclick=()=>setColor(b.dataset.siteKey,b.dataset.siteColor));
    const images=find('[data-site-images]');
    for(const item of result.images){
      const article=document.createElement('article');article.className='instagram-post';
      const img=document.createElement('img');img.alt=item.label;img.loading='lazy';
      fetch(item.previewUrl).then(r=>r.ok?r.blob():Promise.reject()).then(blob=>{if(current!==result)return;item.blob=blob;img.onerror=()=>{item.check=null;article.remove();controls();};img.src=URL.createObjectURL(blob);}).catch(()=>{item.check=null;article.remove();});
      const label=document.createElement('label');label.className='check-label';const check=document.createElement('input');check.type='checkbox';check.onchange=controls;label.append(check,' '+item.label);item.check=check;
      article.append(img,label);images.append(article);
    }
    find('[data-site-image-actions]').hidden=!result.images.length;controls();
  }
  async function chosenFiles(){
    const chosen=current.images.filter(i=>i.check?.checked);if(chosen.some(i=>!i.blob))throw Error('Aguarde as imagens carregarem ou desmarque as indisponíveis.');
    const host=new URL(current.site).hostname.replace(/^www\./,'');
    return Promise.all(chosen.map((i,n)=>siteImageFile(i.blob,`site-${host}-${i.kind}-${n+1}`)));
  }
  find('[data-site-read]').onclick=async()=>{
    if(busy)return;busy=true;controls();clear();token=getToken();const mine=token;state.textContent='Lendo o site…';
    try{
      const r=await fetch('api/site/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:find('[data-site-url]').value})});
      let value;try{value=await r.json();}catch{throw Error('Reinicie o sistema atualizado para ler sites.');}
      if(!r.ok)throw Error(value.error||'Não foi possível ler o site.');
      if(mine!==getToken())return;render(value);state.textContent=(value.title?value.title+' · ':'')+value.message;
    }catch(error){state.textContent=error.message;}finally{busy=false;controls();}
  };
  find('[data-site-url]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find('[data-site-read]').click();}});
  find('[data-site-logo]').onclick=async()=>{
    try{const [file]=await chosenFiles(),input=document.getElementById('client-logo-file');if(!input)throw Error('Abra o cadastro do cliente para trocar o logo.');const list=new DataTransfer();list.items.add(file);input.files=list.files;input.dispatchEvent(new Event('change',{bubbles:true}));state.textContent='Logo enviado ao cadastro. Confira a prévia do logo e salve o cliente.';}
    catch(error){state.textContent=error.message;}
  };
  find('[data-site-analyze]').onclick=async()=>{
    if(busy)return;busy=true;controls();
    try{const count=await onImport(await chosenFiles());state.textContent=count?count+' imagem(ns) adicionada(s) às referências. Clique em Analisar referências.':'Estas imagens já estão nas referências.';}
    catch(error){state.textContent=error.message;}finally{busy=false;controls();}
  };
  return {reset(){clear();state.textContent='';find('[data-site-url]').value='';}};
}
