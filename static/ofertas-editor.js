// Conferência por cartela. O iframe usa o próprio template, sem duplicar o desenho.
(() => {
  const dialog=document.createElement('dialog');dialog.id='of-edicao-dialog';
  dialog.innerHTML=`<div class="edicao-cabecalho"><div><h2>Conferir e ajustar cartelas</h2><p>Arraste para mover; Shift seleciona vários. Alt + rolagem dá zoom; arraste com o botão direito para navegar.</p></div><button type="button" class="close" data-ed="fechar" aria-label="Fechar editor de cartelas">×</button></div>
    <div class="edicao-barra"><button type="button" data-ed="anterior" aria-label="Cartela anterior">←</button><select data-ed="cartela" aria-label="Cartela em edição"></select><button type="button" data-ed="proxima" aria-label="Próxima cartela">→</button><label>Selecionar <select data-ed="modo"><option value="grupo">Elementos inteiros</option><option value="caractere">Caracteres dos preços</option></select></label><label>Zoom <select data-ed="zoom"><option value="1">Ajustar à tela</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select></label><button type="button" data-ed="desfazer">Desfazer</button><button type="button" data-ed="refazer">Refazer</button></div>
    <div class="edicao-corpo"><div class="edicao-viewport"><div class="edicao-palco"><iframe title="Editor visual da cartela" sandbox="allow-scripts allow-same-origin"></iframe></div></div><aside class="edicao-propriedades"><h3>Seleção</h3><select data-ed="elemento" aria-label="Elemento para editar"><option value="">Clique em um elemento da cartela</option></select><p data-ed="selecao" role="status">Carregando cartelas…</p><label>Deslocamento X <input data-ed="x" type="number" step="1" min="-1920" max="1920"></label><label>Deslocamento Y <input data-ed="y" type="number" step="1" min="-1080" max="1080"></label><label>Tamanho (%) <input data-ed="escala" type="number" step="5" min="20" max="400"></label><div class="edicao-mover"><button type="button" data-ed="esquerda" aria-label="Mover seleção à esquerda">←</button><button type="button" data-ed="cima" aria-label="Mover seleção para cima">↑</button><button type="button" data-ed="baixo" aria-label="Mover seleção para baixo">↓</button><button type="button" data-ed="direita" aria-label="Mover seleção à direita">→</button></div><div class="edicao-mover"><button type="button" data-ed="menor">− Diminuir</button><button type="button" data-ed="maior">+ Aumentar</button></div><button type="button" data-ed="restaurar">Restaurar seleção</button><button type="button" data-ed="restaurar-cartela">Restaurar esta cartela</button><p class="help">Ctrl + Z desfaz; Ctrl + Shift + Z refaz. Setas movem 1 px; Shift + seta move 10 px. + e − alteram o tamanho. Os limites da área branca são respeitados.</p></aside></div>
    <div class="edicao-rodape"><p data-ed="status" role="status">Os ajustes só serão guardados ao salvar.</p><div><button type="button" data-ed="cancelar">Cancelar</button><button type="button" class="secondary" data-ed="salvar">Salvar ajustes</button><button type="button" class="primary" data-ed="gerar">Salvar e gerar vídeo</button></div></div>`;
  document.body.appendChild(dialog);
  const el=id=>dialog.querySelector(`[data-ed="${id}"]`),iframe=dialog.querySelector('iframe'),viewport=dialog.querySelector('.edicao-viewport');
  let op=null,sessao=null,pronto=false,cartela=0,cartelas=[],elementos=[],ajustes={},selecionados=[],ocupado=false,zoom=1,pan=null;
  function enviar(acao,extra={}){if(pronto)iframe.contentWindow.postMessage({tipo:'comando',sessao,acao,...extra},location.origin);}
  function redimensionar(){const largura=Math.min(viewport.clientWidth,viewport.clientHeight*1920/1080)*zoom;iframe.style.transform=`scale(${largura/1920})`;const palco=dialog.querySelector('.edicao-palco');palco.style.width=largura+'px';palco.style.height=largura*1080/1920+'px';}
  function definirZoom(valor,clientX,clientY){
    const r=iframe.getBoundingClientRect(),v=viewport.getBoundingClientRect();
    const x=clientX??v.left+v.width/2,y=clientY??v.top+v.height/2;
    const u=(x-r.left)/r.width,w=(y-r.top)/r.height;
    zoom=Math.max(1,Math.min(4,valor));
    const seletor=el('zoom');seletor.querySelector('[data-livre]')?.remove();
    if(![...seletor.options].some(o=>Number(o.value)===zoom)){const o=new Option(Math.round(zoom*100)+'%',String(zoom));o.dataset.livre='1';seletor.appendChild(o);}
    seletor.value=String(zoom);redimensionar();
    const novo=iframe.getBoundingClientRect();
    viewport.scrollLeft+=novo.left+u*novo.width-x;viewport.scrollTop+=novo.top+w*novo.height-y;
  }
  function navegarVista(d){
    if(d.acao==='zoom-vista'){
      const r=iframe.getBoundingClientRect();definirZoom(zoom*Math.exp(-d.delta*.002),r.left+d.x*r.width/1920,r.top+d.y*r.height/1080);
    }
    if(d.acao==='pan-inicio'){pan={x:viewport.scrollLeft,y:viewport.scrollTop};viewport.style.cursor='grabbing';}
    if(d.acao==='pan-mover'&&pan){viewport.scrollLeft=pan.x-d.x;viewport.scrollTop=pan.y-d.y;}
    if(d.acao==='pan-fim'){pan=null;viewport.style.cursor='';}
  }
  viewport.addEventListener('wheel',e=>{if(!e.altKey)return;e.preventDefault();definirZoom(zoom*Math.exp(-e.deltaY*(e.deltaMode===1?16:1)*.002),e.clientX,e.clientY);},{passive:false});
  viewport.addEventListener('contextmenu',e=>e.preventDefault());
  viewport.addEventListener('pointerdown',e=>{if(e.button!==2)return;e.preventDefault();pan={x:viewport.scrollLeft,y:viewport.scrollTop,sx:e.screenX,sy:e.screenY};viewport.setPointerCapture(e.pointerId);viewport.style.cursor='grabbing';});
  viewport.addEventListener('pointermove',e=>{if(!pan||pan.sx===undefined)return;viewport.scrollLeft=pan.x-(e.screenX-pan.sx);viewport.scrollTop=pan.y-(e.screenY-pan.sy);});
  for(const tipo of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(tipo,()=>{pan=null;viewport.style.cursor='';});
  dialog.addEventListener('keydown',e=>{
    if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z'||e.target.matches('input,textarea,[contenteditable]'))return;
    e.preventDefault();enviar(e.shiftKey?'refazer':'desfazer');
  });
  new ResizeObserver(redimensionar).observe(viewport);
  function listar(){
    const atual=el('elemento').value;el('elemento').replaceChildren(new Option('Clique em um elemento da cartela',''));
    elementos.filter(e=>e.cartela===cartela&&(el('modo').value==='caractere'||e.nivel==='grupo')).forEach(e=>el('elemento').appendChild(new Option(e.rotulo,e.id)));
    if([...el('elemento').options].some(o=>o.value===atual))el('elemento').value=atual;
    el('anterior').disabled=cartela===0;el('proxima').disabled=cartela===cartelas.length-1;
    el('cartela').value=String(cartela);
  }
  window.addEventListener('message',e=>{
    if(!op||!dialog.open||e.source!==iframe.contentWindow||e.origin!==location.origin||e.data?.sessao!==sessao)return;
    const d=e.data;
    if(d.tipo==='vista'){navegarVista(d);return;}
    if(d.tipo==='pronto'){
      pronto=true;cartelas=d.cartelas; elementos=d.elementos;ajustes=d.ajustes;
      el('cartela').replaceChildren(...cartelas.map((c,i)=>new Option(`Cartela ${i+1} · ${c.nomes.join(' / ')}`,String(i))));
      el('salvar').disabled=el('gerar').disabled=false;el('selecao').textContent='Clique na imagem, no título ou no preço.';listar();
      if(op.gerarDepois)el('status').textContent='Confira as cartelas. Depois, salve os ajustes e gere o vídeo.';
    }
    if(d.tipo==='estado'){
      const mudouCartela=cartela!==d.cartela;cartela=d.cartela;selecionados=d.selecionados||[];
      if(d.ajustes){ajustes=d.ajustes;el('status').textContent='Ajustes pendentes — clique em Salvar ajustes para guardar.';}
      el('desfazer').disabled=!d.desfazer;el('refazer').disabled=!d.refazer;
      if(mudouCartela)listar();
      el('elemento').value=selecionados[0]||'';
      el('selecao').textContent=selecionados.length?`${selecionados.length} ${selecionados.length===1?'elemento selecionado':'elementos selecionados'}`:'Clique em um elemento da cartela.';
      for(const k of ['x','y','escala']){
        el(k).disabled=!d.valor;
        if(document.activeElement!==el(k))el(k).value=d.valor?Math.round((k==='escala'?d.valor[k]*100:d.valor[k])*10)/10:'';
      }
      for(const k of ['esquerda','direita','cima','baixo','menor','maior','restaurar'])el(k).disabled=!selecionados.length;
    }
  });
  function fechar(){if(ocupado)return;dialog.close();iframe.removeAttribute('src');op=null;pronto=false;}
  el('fechar').onclick=el('cancelar').onclick=fechar;
  dialog.addEventListener('cancel',e=>{e.preventDefault();fechar();});
  el('anterior').onclick=()=>enviar('cartela',{numero:cartela-1});el('proxima').onclick=()=>enviar('cartela',{numero:cartela+1});
  el('cartela').onchange=()=>enviar('cartela',{numero:Number(el('cartela').value)});
  el('zoom').onchange=()=>definirZoom(Number(el('zoom').value));
  el('modo').onchange=()=>{enviar('modo',{valor:el('modo').value});listar();};
  el('elemento').onchange=()=>enviar('selecionar',{id:el('elemento').value});
  for(const k of ['desfazer','refazer','restaurar','restaurar-cartela'])el(k).onclick=()=>enviar(k);
  for(const [k,x,y] of [['esquerda',-1,0],['direita',1,0],['cima',0,-1],['baixo',0,1]])el(k).onclick=e=>enviar('mover',{x:x*(e.shiftKey?10:1),y:y*(e.shiftKey?10:1)});
  el('menor').onclick=()=>enviar('escala',{fator:.95});el('maior').onclick=()=>enviar('escala',{fator:1.05});
  for(const k of ['x','y','escala'])el(k).onchange=()=>{const v=Number(el(k).value);if(Number.isFinite(v))enviar('valor',{campo:k,valor:k==='escala'?v/100:v});el(k).blur();};
  async function salvar(gerar){
    if(!pronto||ocupado)return;ocupado=true;el('salvar').disabled=el('gerar').disabled=true;el('status').textContent='Salvando ajustes…';
    try{
      await op.onSalvar(ajustes);
      const gerarVideo=op.onGerar;ocupado=false;fechar();if(gerar)await gerarVideo();
    }catch(e){el('status').textContent=e.message||'Não foi possível salvar. Tente novamente.';}
    finally{ocupado=false;el('salvar').disabled=el('gerar').disabled=false;}
  }
  el('salvar').onclick=()=>salvar(false);el('gerar').onclick=()=>salvar(true);
  window.OfertasEdicao={abrir(options){
    op=options;sessao=crypto.randomUUID();pronto=false;cartela=0;cartelas=[];elementos=[];ajustes={};selecionados=[];
    zoom=1;pan=null;el('zoom').querySelector('[data-livre]')?.remove();el('zoom').value='1';viewport.scrollLeft=viewport.scrollTop=0;el('modo').value='grupo';el('elemento').replaceChildren(new Option('Carregando…',''));el('cartela').replaceChildren(new Option('Carregando cartelas…','0'));
    el('status').textContent='Os ajustes só serão guardados ao salvar.';el('selecao').textContent='Carregando cartelas…';
    for(const id of ['salvar','gerar','anterior','proxima','desfazer','refazer','x','y','escala','esquerda','direita','cima','baixo','menor','maior','restaurar'])el(id).disabled=true;
    iframe.src=`/ofertas/preview/${encodeURIComponent(options.pedido.id)}/index.html?v=${options.pedido.revision}&editar=1&sessao=${encodeURIComponent(sessao)}`;
    dialog.showModal();redimensionar();
  }};
})();
