// Usa o mesmo seletor de pasta dos editores; a geração não é refeita para entregar.
(() => {
  'use strict';
  const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dialog=document.createElement('dialog');dialog.className='of-entrega-dialog';
  dialog.innerHTML=`<div class="dialog-head"><div><h2>Exportar vídeos de Ofertas</h2><p>Selecione vídeos prontos ou ainda em geração. Cada MP4 será entregue assim que terminar.</p></div><button class="close" type="button" aria-label="Fechar">×</button></div>
  <div class="toolbar"><button type="button" data-oe="todos" class="text-button">Selecionar todos</button><button type="button" data-oe="nenhum" class="text-button">Limpar seleção</button></div>
  <div data-oe="videos" class="of-entrega-videos"></div>
  <label>Começar no número<input data-oe="inicio" type="number" min="1" max="99999" step="1" value="1"></label>
  <p class="help" data-oe="nomes">Nomes: VT 1.mp4, VT 2.mp4…</p>
  <div class="destination"><span>Pasta de saída</span><strong data-oe="pasta">Escolha a pasta</strong><button type="button" data-oe="escolher" class="secondary">Escolher pasta</button></div>
  <p class="help" data-oe="ajuda">Arquivos existentes são preservados. Você pode continuar trabalhando durante a geração.</p>
  <p data-oe="erro" role="status"></p><div class="dialog-footer"><button type="button" data-oe="cancelar" class="secondary">Cancelar</button><button type="button" data-oe="exportar" class="primary">Exportar quando prontos</button></div>`;
  document.body.append(dialog);
  const el=id=>dialog.querySelector(`[data-oe="${id}"]`),destinos=new Map(),emEntrega=new Set();
  let pasta=null,renderLista=[],configurando=false;
  async function api(path,body){
    const r=await fetch('/api/ofertas'+path,{method:body?'POST':'GET',headers:body?{'X-Indoor':'1','Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível exportar.');return d;
  }
  const selecionados=()=>[...el('videos').querySelectorAll('input:checked')].map(n=>n.value);
  function nomes(){const n=Number(el('inicio').value),q=selecionados().length;el('nomes').textContent=q?`${q} vídeo(s): VT ${n}.mp4${q>1?' até VT '+(n+q-1)+'.mp4':''}`:'Selecione os vídeos para conferir os nomes.';}
  function fechar(){if(!configurando)dialog.close();}
  dialog.querySelector('.close').onclick=el('cancelar').onclick=fechar;
  dialog.addEventListener('cancel',e=>{if(configurando)e.preventDefault();});
  el('inicio').oninput=nomes;el('videos').onchange=nomes;
  for(const [acao,checked] of [['todos',true],['nenhum',false]])el(acao).onclick=()=>{el('videos').querySelectorAll('input').forEach(n=>n.checked=checked);nomes();};
  el('escolher').onclick=async()=>{
    try{const label=await chooseFolder();if(!label)return;const target=browserTargets.get(label);pasta={label,target};el('pasta').textContent=label;
      el('ajuda').textContent=target?'Mantenha esta aba aberta para gravar os vídeos neste computador quando ficarem prontos. Arquivos existentes não serão substituídos.':'Os vídeos serão gravados automaticamente nesta pasta, mesmo se você fechar a aba. Se houver nomes existentes, a numeração continua no próximo livre.';
    }catch(e){el('erro').textContent=e.message;}
  };
  async function abrir(renders,ids=[]){
    pasta=null;el('pasta').textContent='Escolha a pasta';el('erro').textContent='';el('inicio').value='1';el('ajuda').textContent='Arquivos existentes são preservados. Você pode continuar trabalhando durante a geração.';
    renderLista=[...renders].filter(r=>['pronto','gerando','na_fila'].includes(r.status)).sort((a,b)=>a.criado.localeCompare(b.criado)||a.id.localeCompare(b.id));
    el('videos').innerHTML=renderLista.map(r=>`<label class="check"><input type="checkbox" value="${r.id}" ${ids.includes(r.id)?'checked':''}><span>${esc(r.titulo)}<small>${r.status==='pronto'?'Pronto':r.status==='gerando'?'Em geração':'Na fila'}</small></span></label>`).join('')||'<p>Nenhum vídeo pronto ou em geração.</p>';
    nomes();dialog.showModal();
  }
  el('exportar').onclick=async()=>{
    if(configurando)return;
    try{
      const ids=selecionados();if(!ids.length)throw Error('Selecione ao menos um vídeo.');if(!pasta)throw Error('Escolha a pasta de saída.');
      const inicio=Number(el('inicio').value);if(!Number.isInteger(inicio)||inicio<1||inicio>99999)throw Error('Confira a numeração inicial.');
      configurando=true;el('exportar').disabled=true;
      const r=await api('/exportacoes',{ids,inicio,navegador:!!pasta.target,pasta:pasta.target?'':pasta.label,rotulo:pasta.label});
      if(pasta.target)destinos.set(r.id,pasta.target);
      dialog.close();await atualizar();toast('Exportação configurada. Os vídeos serão entregues conforme ficarem prontos.');
    }catch(e){el('erro').textContent=e.message;}finally{configurando=false;el('exportar').disabled=false;}
  };
  async function entregar(job,target){
    if(emEntrega.has(job.id))return;emEntrega.add(job.id);
    try{
      for(const item of job.itens.filter(i=>i.estado==='disponivel')){
        if(!destinos.has(job.id))break;
        let erro=null;
        try{
          if(target.handle&&await target.handle.getFileHandle(item.nome).then(()=>true,()=>false))throw Error(`${item.nome} já existe. O arquivo foi preservado; exporte com outra numeração.`);
          const r=await fetch(`/ofertas/video/${item.render}.mp4`);if(!r.ok)throw Error('O MP4 não está disponível.');
          if(target.handle)await r.body.pipeTo(await(await target.handle.getFileHandle(item.nome,{create:true})).createWritable());
          else{const a=document.createElement('a');a.href=URL.createObjectURL(await r.blob());a.download=item.nome;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),60000);}
        }catch(e){erro=e.message;}
        await api('/exportacoes-confirmar',{id:job.id,render:item.render,erro});
      }
    }finally{emEntrega.delete(job.id);}
  }
  async function atualizar(){
    try{
      const jobs=await api('/exportacoes');
      const container=document.getElementById('of-entregas-resumo');if(!container)return;
      const rotulos={aguardando:'Aguardando geração',disponivel:'Aguardando entrega',salvo:'Entregue',falhou:'Falhou',cancelado:'Cancelado'};
      container.innerHTML=jobs.slice(0,15).map(j=>`<details class="of-entrega-status"><summary><strong>Exportação · ${esc(j.rotulo)}</strong> · ${j.itens.filter(i=>i.estado==='salvo').length}/${j.itens.length} entregues</summary><ul>${j.itens.map(i=>`<li>${esc(i.nome)} — ${rotulos[i.estado]}${i.erro?' · '+esc(i.erro):''}</li>`).join('')}</ul>${j.itens.some(i=>['aguardando','disponivel'].includes(i.estado))?`<div class="toolbar">${j.navegador&&!destinos.has(j.id)?`<button type="button" class="secondary" data-retomar="${j.id}">Escolher pasta e retomar entrega</button>`:''}<button type="button" class="text-button" data-cancelar="${j.id}">Cancelar entrega pendente</button></div>`:''}</details>`).join('');
      container.querySelectorAll('[data-cancelar]').forEach(b=>b.onclick=async()=>{await api('/exportacoes-cancelar',{id:b.dataset.cancelar});destinos.delete(b.dataset.cancelar);atualizar();});
      container.querySelectorAll('[data-retomar]').forEach(b=>b.onclick=async()=>{try{const label=await browserFolder(false);if(label){destinos.set(b.dataset.retomar,browserTargets.get(label));atualizar();}}catch(e){toast(e.message);}});
      for(const j of jobs)if(j.navegador&&destinos.has(j.id)&&j.itens.some(i=>i.estado==='disponivel'))entregar(j,destinos.get(j.id)).catch(e=>toast(e.message));
    }catch{/* A próxima consulta tenta novamente sem interromper a fila de geração. */}
  }
  window.OfertasEntregas={abrir,atualizar};
})();
