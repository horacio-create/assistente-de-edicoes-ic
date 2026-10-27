// Conferência por cartela. O iframe usa o próprio template, sem duplicar o desenho.
(() => {
function criarEditor(inline=false,host=null) {
  const desenho={
    anterior:'<path d="m15 18-6-6 6-6"/>',proxima:'<path d="m9 18 6-6-6-6"/>',
    desfazer:'<path d="M3 10h10a7 7 0 0 1 0 14" transform="translate(0 -5)"/><path d="m7 1-4 4 4 4"/>',
    refazer:'<path d="M21 5H11a7 7 0 0 0 0 14"/><path d="m17 1 4 4-4 4"/>',
    menos:'<path d="M5 12h14"/>',mais:'<path d="M5 12h14M12 5v14"/>',
    ajustar:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
    expandir:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    recolher:'<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5"/>',
    elementos:'<path d="m4 3 15 9-7 2-3 7z"/>',caracteres:'<path d="M4 5h16M12 5v15M8 20h8"/>',
    play:'<path d="m8 4 12 8-12 8z"/>',editar:'<path d="m4 16 12-12 4 4L8 20H4zm10-10 4 4"/>'
  };
  const svg=nome=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${desenho[nome]||''}</svg>`;
  const ferramenta=(id,nome,icone,texto='')=>`<button type="button" data-ed="${id}" class="${texto?'edicao-acao':'edicao-icone'}" aria-label="${nome}" title="${nome}">${svg(icone)}${texto?`<span>${texto}</span>`:''}</button>`;
  const dialog=document.createElement(inline?'section':'dialog');dialog.id=inline?'of-edicao-inline':'of-edicao-dialog';
  dialog.innerHTML=`<div class="edicao-cabecalho"><div><h2>Conferir e ajustar cartelas</h2><p>Arraste para mover; Shift seleciona vários. Alt + rolagem dá zoom; arraste com o botão direito para navegar.</p></div><button type="button" class="close" data-ed="fechar" aria-label="Fechar editor de cartelas">×</button></div>
    <div class="edicao-barra"><button type="button" data-ed="anterior" aria-label="Cartela anterior">←</button><select data-ed="cartela" aria-label="Cartela em edição"></select><button type="button" data-ed="proxima" aria-label="Próxima cartela">→</button><label>Selecionar <select data-ed="modo"><option value="grupo">Elementos inteiros</option><option value="caractere">Caracteres dos preços</option></select></label><label>Zoom <select data-ed="zoom"><option value="1">Ajustar à tela</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select></label><button type="button" data-ed="desfazer">Desfazer</button><button type="button" data-ed="refazer">Refazer</button></div>
    <div class="edicao-corpo"><div class="edicao-viewport"><div class="edicao-palco"><iframe title="Editor visual da cartela" sandbox="allow-scripts allow-same-origin"></iframe></div></div><aside class="edicao-propriedades"><h3>Seleção</h3><select data-ed="elemento" aria-label="Elemento para editar"><option value="">Clique em um elemento da cartela</option></select><p data-ed="selecao" role="status">Carregando cartelas…</p><label>Deslocamento X <input data-ed="x" type="number" step="1" min="-1920" max="1920"></label><label>Deslocamento Y <input data-ed="y" type="number" step="1" min="-1080" max="1080"></label><label>Tamanho (%) <input data-ed="escala" type="number" step="5" min="20" max="400"></label><div class="edicao-mover"><button type="button" data-ed="esquerda" aria-label="Mover seleção à esquerda">←</button><button type="button" data-ed="cima" aria-label="Mover seleção para cima">↑</button><button type="button" data-ed="baixo" aria-label="Mover seleção para baixo">↓</button><button type="button" data-ed="direita" aria-label="Mover seleção à direita">→</button></div><div class="edicao-mover"><button type="button" data-ed="menor">− Diminuir</button><button type="button" data-ed="maior">+ Aumentar</button></div><button type="button" data-ed="restaurar">Restaurar seleção</button><button type="button" data-ed="restaurar-cartela">Restaurar esta cartela</button><p class="help">Ctrl + Z desfaz; Ctrl + Shift + Z refaz. Setas movem 1 px; Shift + seta move 10 px. + e − alteram o tamanho. Os limites da área branca são respeitados.</p></aside></div>
    <div class="edicao-rodape"><p data-ed="status" role="status">Os ajustes só serão guardados ao salvar.</p><div><button type="button" data-ed="cancelar">Cancelar</button><button type="button" class="secondary" data-ed="salvar">Salvar ajustes</button><button type="button" class="primary" data-ed="gerar">Salvar e gerar vídeo</button></div></div>`;
  if(inline){
    dialog.className='edicao-integrada';
    dialog.setAttribute('aria-label','Editor de cartelas');
    dialog.querySelector('.edicao-cabecalho').hidden=true;
    dialog.querySelector('.edicao-rodape').hidden=true;
    const corpo=dialog.querySelector('.edicao-corpo'),vista=dialog.querySelector('.edicao-viewport');
    const coluna=document.createElement('div');coluna.className='edicao-coluna';vista.before(coluna);coluna.append(vista);
    const preview=document.createElement('div');preview.className='edicao-preview';preview.hidden=true;coluna.append(preview);
    const faixa=document.createElement('div');faixa.className='edicao-faixa';
    faixa.innerHTML=ferramenta('faixa-anterior','Mostrar cartelas anteriores','anterior')+'<nav class="edicao-miniaturas" aria-label="Miniaturas das cartelas"></nav>'+ferramenta('faixa-proxima','Mostrar cartelas seguintes','proxima');coluna.append(faixa);
    const barra=dialog.querySelector('.edicao-barra');
    barra.innerHTML=`<div class="edicao-ferramentas" aria-label="Navegar pelas cartelas">${ferramenta('anterior','Cartela anterior','anterior')}<select data-ed="cartela" aria-label="Cartela em edição"></select>${ferramenta('proxima','Próxima cartela','proxima')}</div>
      <div class="edicao-ferramentas edicao-modos" role="group" aria-label="Tipo de seleção"><select data-ed="modo" hidden><option value="grupo">Elementos</option><option value="caractere">Caracteres</option></select>${ferramenta('modo-grupo','Selecionar elementos inteiros','elementos','Elementos')}${ferramenta('modo-caractere','Selecionar caracteres dos preços','caracteres','Caracteres')}</div>
      <div class="edicao-ferramentas" aria-label="Zoom">${ferramenta('zoom-menos','Diminuir zoom','menos')}<select data-ed="zoom" aria-label="Zoom"><option value="1">Ajustar</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select>${ferramenta('zoom-mais','Aumentar zoom','mais')}${ferramenta('zoom-ajustar','Ajustar cartela à tela','ajustar')}</div>
      <div class="edicao-ferramentas">${ferramenta('desfazer','Desfazer','desfazer')}${ferramenta('refazer','Refazer','refazer')}</div>
      <div class="edicao-ferramentas edicao-acoes-vista">${ferramenta('mini-atualizar','Atualizar miniaturas','refazer')}${ferramenta('reproduzir','Reproduzir prévia','play','Prévia')}${ferramenta('expandir','Expandir editor','expandir')}<button type="button" class="primary" data-ed="continuar">Vídeos →</button></div>`;
    const atalhos=document.createElement('p');atalhos.className='edicao-atalhos';atalhos.textContent='Arraste para mover · Shift seleciona vários · Alt + rolagem dá zoom · Botão direito navega · Ctrl + Z desfaz';barra.after(atalhos);
    const aside=corpo.querySelector('aside'),conteudo=document.createElement('div');conteudo.className='edicao-conteudo';
    const produtos=document.createElement('div');produtos.className='edicao-produtos';produtos.setAttribute('aria-label','Produtos da cartela');
    const dados=document.createElement('div');dados.dataset.ed='dados';
    const detalhes=document.createElement('details');detalhes.className='edicao-transformacoes';detalhes.open=true;
    const resumo=document.createElement('summary');resumo.textContent='Posição e tamanho da seleção';detalhes.append(resumo);
    while(aside.firstChild)detalhes.append(aside.firstChild);
    const aviso=document.createElement('p');aviso.className='edicao-aviso-previa';aviso.textContent='Prévia em reprodução. Use “Voltar a editar” para ajustar a cartela selecionada.';
    conteudo.append(dados);aside.append(aviso,produtos,detalhes,conteudo);
    host.append(dialog);
  }else document.body.appendChild(dialog);
  const ferramentas=document.createElement('section');ferramentas.className='edicao-alinhamento';
  ferramentas.innerHTML=`<strong>Alinhar seleção</strong><label>Referência <select data-ed="referencia"><option value="selecao">Entre selecionados</option><option value="cartela">Área da cartela</option></select></label><div class="edicao-grade-acoes">${[['esquerda','⇤','Esquerda'],['centro-x','↔','Centralizar horizontalmente'],['direita','⇥','Direita'],['topo','↥','Topo'],['centro-y','↕','Centralizar verticalmente'],['base','↧','Base']].map(([e,i,t])=>`<button type="button" data-alinhar="${e}" title="${t}" aria-label="${t}">${i}</button>`).join('')}<button type="button" data-distribuir="x" title="Distribuir horizontalmente" aria-label="Distribuir horizontalmente">↔↔</button><button type="button" data-distribuir="y" title="Distribuir verticalmente" aria-label="Distribuir verticalmente">↕↕</button></div><label><input type="checkbox" data-ed="encaixe" checked> Guias e encaixe ao arrastar</label><small>Um elemento: alinha na cartela. Dois ou mais: alinha entre eles. Distribuição requer três.</small>`;
  if(inline)dialog.querySelector('.edicao-conteudo').before(ferramentas);else dialog.querySelector('.edicao-propriedades').append(ferramentas);
  if(inline){
    const lote=document.createElement('details');lote.className='edicao-padronizar';
    lote.innerHTML=`<summary>Padronizar várias cartelas</summary><p>Use o produto ativo como modelo. Copia a escala do elemento; textos, imagens e valores são preservados.</p><label>Elemento <select data-ed="lote-parte"><option value="produto">Imagem do produto</option><option value="titulo">Título</option><option value="normal">Preço normal</option><option value="de-unidade">Unidade do preço normal (KG, CADA, 100g…)</option><option value="selo">Selo completo</option><option value="clube-virgula">Vírgula do preço do selo</option><option value="precos">Conjunto de preços</option></select></label><label><input type="checkbox" data-ed="lote-posicao"> Copiar também deslocamento X e Y</label><div class="edicao-lote-cartelas" data-ed="lote-cartelas"></div><div class="edicao-lote-botoes"><button type="button" data-ed="lote-ver">Ver prévia</button><button type="button" data-ed="lote-confirmar" class="primary" disabled>Aplicar</button><button type="button" data-ed="lote-cancelar" disabled>Cancelar prévia</button></div><p role="status" data-ed="lote-status">Escolha as cartelas que receberão o ajuste.</p>`;
    dialog.querySelector('.edicao-conteudo').before(lote);
  }
  const el=id=>dialog.querySelector(`[data-ed="${id}"]`),iframe=dialog.querySelector('iframe'),viewport=dialog.querySelector('.edicao-viewport');
  let op=null,sessao=null,pronto=false,cartela=0,cartelas=[],elementos=[],ajustes={},selecionados=[],ocupado=false,zoom=1,pan=null,assinatura=null,retomar=null,produtoAtivo=null,emPrevia=false,recarregarConteudo=false,observadorMini=null,ampliado=false;
  let cancelarPadronizacao=()=>{};
  function enviar(acao,extra={}){if(pronto)iframe.contentWindow.postMessage({tipo:'comando',sessao,acao,...extra},location.origin);}
  function redimensionar(){const largura=Math.min(viewport.clientWidth,viewport.clientHeight*1920/1080)*zoom;iframe.style.transform=`scale(${largura/1920})`;const palco=dialog.querySelector('.edicao-palco');palco.style.width=largura+'px';palco.style.height=largura*1080/1920+'px';enviar('vista-escala',{valor:largura/1920});}
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
    e.preventDefault();pararPrevia();enviar(e.shiftKey?'refazer':'desfazer');
  });
  new ResizeObserver(redimensionar).observe(viewport);
  function listar(){
    const atual=el('elemento').value;el('elemento').replaceChildren(new Option('Clique em um elemento da cartela',''));
    elementos.filter(e=>e.cartela===cartela&&(el('modo').value==='caractere'||e.nivel==='grupo')).forEach(e=>el('elemento').appendChild(new Option(e.rotulo,e.id)));
    if([...el('elemento').options].some(o=>o.value===atual))el('elemento').value=atual;
    el('anterior').disabled=cartela===0;el('proxima').disabled=cartela===cartelas.length-1;
    el('cartela').value=String(cartela);
    if(inline){
      el('cartela').title=cartelas[cartela]?.nomes.join(' / ')||'Cartela em edição';
      for(const modo of ['grupo','caractere'])el('modo-'+modo).setAttribute('aria-pressed',String(el('modo').value===modo));
    }
  }
  window.addEventListener('message',e=>{
    if(!op||(!inline&&!dialog.open)||e.source!==iframe.contentWindow||e.origin!==location.origin||e.data?.sessao!==sessao)return;
    const d=e.data;
    if(d.tipo==='vista'){navegarVista(d);return;}
    if(d.tipo==='pronto'){
      pronto=true;cartelas=d.cartelas; elementos=d.elementos;ajustes=d.ajustes;
      if(inline)dialog.classList.remove('atualizando');
      if(inline)enviar('modo',{valor:el('modo').value});
      el('cartela').replaceChildren(...cartelas.map((c,i)=>new Option(inline?`${i+1} de ${cartelas.length}`:`Cartela ${i+1} · ${c.nomes.join(' / ')}`,String(i))));
      el('salvar').disabled=el('gerar').disabled=false;el('selecao').textContent='Clique na imagem, no título ou no preço.';listar();
      if(inline){
        desenharMiniaturas();
        el('lote-cartelas').replaceChildren(...cartelas.map((c,i)=>{const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.value=String(i);label.append(check,document.createTextNode(`Cartela ${i+1}`));return label;}));
        if(retomar){enviar('cartela',{numero:Math.min(retomar.cartela,cartelas.length-1)});if(retomar.id)enviar('selecionar',{id:retomar.id});retomar=null;}
        else atualizarContexto();
        redimensionar();
      }
      redimensionar();
      if(op.gerarDepois)el('status').textContent='Confira as cartelas. Depois, salve os ajustes e gere o vídeo.';
    }
    if(d.tipo==='estado'){
      if(!pronto)return;
      const mudouCartela=cartela!==d.cartela;cartela=d.cartela;selecionados=d.selecionados||[];
      if(d.ajustes){ajustes=d.ajustes;el('status').textContent='Ajustes pendentes — clique em Salvar ajustes para guardar.';if(inline)op.onAlterar?.(ajustes);}
      el('desfazer').disabled=!d.desfazer;el('refazer').disabled=!d.refazer;
      if(mudouCartela)listar();
      if(inline){if(mudouCartela)produtoAtivo=null;atualizarContexto();}
      el('elemento').value=selecionados[0]||'';
      el('selecao').textContent=selecionados.length?`${selecionados.length} ${selecionados.length===1?'elemento selecionado':'elementos selecionados'}`:'Clique em um elemento da cartela.';
      el('escala').max=selecionados.length&&selecionados.every(id=>id.endsWith(':produto'))?'1200':'400';
      for(const k of ['x','y','escala']){
        el(k).disabled=!d.valor;
        if(document.activeElement!==el(k))el(k).value=d.valor?Math.round((k==='escala'?d.valor[k]*100:d.valor[k])*10)/10:'';
      }
      for(const k of ['esquerda','direita','cima','baixo','menor','maior','restaurar'])el(k).disabled=!selecionados.length;
      dialog.querySelectorAll('[data-alinhar]').forEach(b=>b.disabled=!selecionados.length);
      dialog.querySelectorAll('[data-distribuir]').forEach(b=>b.disabled=selecionados.length<3);
    }
  });
  function fechar(){if(ocupado)return;dialog.close();iframe.removeAttribute('src');op=null;pronto=false;}
  el('fechar').onclick=el('cancelar').onclick=fechar;
  dialog.addEventListener('cancel',e=>{e.preventDefault();fechar();});
  el('anterior').onclick=()=>{pararPrevia();enviar('cartela',{numero:cartela-1});};el('proxima').onclick=()=>{pararPrevia();enviar('cartela',{numero:cartela+1});};
  el('cartela').onchange=()=>{pararPrevia();enviar('cartela',{numero:Number(el('cartela').value)});};
  el('zoom').onchange=()=>{pararPrevia();definirZoom(Number(el('zoom').value));};
  el('modo').onchange=()=>{pararPrevia();enviar('modo',{valor:el('modo').value});listar();};
  el('elemento').onchange=()=>enviar('selecionar',{id:el('elemento').value});
  for(const k of ['desfazer','refazer','restaurar','restaurar-cartela'])el(k).onclick=()=>{pararPrevia();enviar(k);};
  for(const [k,x,y] of [['esquerda',-1,0],['direita',1,0],['cima',0,-1],['baixo',0,1]])el(k).onclick=e=>enviar('mover',{x:x*(e.shiftKey?10:1),y:y*(e.shiftKey?10:1)});
  dialog.querySelectorAll('[data-alinhar]').forEach(b=>{b.disabled=true;b.onclick=()=>{pararPrevia();enviar('alinhar',{eixo:b.dataset.alinhar,referencia:el('referencia').value});};});
  dialog.querySelectorAll('[data-distribuir]').forEach(b=>{b.disabled=true;b.onclick=()=>{pararPrevia();enviar('distribuir',{eixo:b.dataset.distribuir});};});
  el('encaixe').onchange=()=>enviar('encaixe',{valor:el('encaixe').checked});
  if(inline){
    const previa=ativa=>{
      dialog.classList.toggle('previa-padronizacao',ativa);
      for(const seletor of ['.edicao-produtos','.edicao-transformacoes','.edicao-conteudo','.edicao-alinhamento'])dialog.querySelector(seletor).inert=ativa;
      dialog.querySelectorAll('.edicao-barra .edicao-ferramentas:not(:first-child)').forEach(no=>no.inert=ativa);
      el('lote-ver').disabled=ativa;
      el('lote-confirmar').disabled=el('lote-cancelar').disabled=!ativa;
    };
    const cancelar=()=>{if(!dialog.classList.contains('previa-padronizacao'))return;enviar('lote-cancelar');previa(false);el('lote-status').textContent='Prévia cancelada. Os ajustes anteriores foram preservados.';};
    cancelarPadronizacao=cancelar;
    el('lote-ver').onclick=()=>{
      const destinos=[...el('lote-cartelas').querySelectorAll('input:checked')].map(i=>Number(i.value));
      if(!pronto||!destinos.length||!produtoAtivo){el('lote-status').textContent='Selecione ao menos uma cartela e um produto de origem.';return;}
      const parte=el('lote-parte').value;
      if(!elementos.some(e=>e.produto===produtoAtivo&&e.id.endsWith(':'+parte))){el('lote-status').textContent='O produto ativo não possui esse elemento. Escolha outro produto.';return;}
      pararPrevia();enviar('lote-previa',{origem:produtoAtivo,parte,cartelas:destinos,posicao:el('lote-posicao').checked});previa(true);
      el('lote-status').textContent=`Prévia em ${destinos.length} cartela(s), usando o produto ${produtoAtivo}. Clique em Aplicar para guardar. Ctrl + Z poderá desfazer a aplicação.`;
    };
    el('lote-confirmar').onclick=()=>{enviar('lote-aplicar');previa(false);el('lote-status').textContent='Padronização aplicada. Você pode desfazer com Ctrl + Z.';};
    el('lote-cancelar').onclick=cancelar;
    for(const no of [el('lote-parte'),el('lote-posicao'),el('lote-cartelas')])no.addEventListener('change',()=>{if(dialog.classList.contains('previa-padronizacao'))cancelar();});
    dialog.querySelector('.edicao-padronizar').addEventListener('toggle',()=>{if(!dialog.querySelector('.edicao-padronizar').open&&dialog.classList.contains('previa-padronizacao'))cancelar();});
  }
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
  const apiEditor={abrir(options){
    cancelarPadronizacao();
    assinatura=options.conteudo??null;retomar=null;produtoAtivo=null;emPrevia=false;recarregarConteudo=false;
    op=options;sessao=crypto.randomUUID();pronto=false;cartela=0;cartelas=[];elementos=[];ajustes={};selecionados=[];
    zoom=1;pan=null;el('zoom').querySelector('[data-livre]')?.remove();el('zoom').value='1';viewport.scrollLeft=viewport.scrollTop=0;el('modo').value='grupo';el('elemento').replaceChildren(new Option('Carregando…',''));el('cartela').replaceChildren(new Option('Carregando cartelas…','0'));
    el('status').textContent='Os ajustes só serão guardados ao salvar.';el('selecao').textContent='Carregando cartelas…';
    for(const id of ['salvar','gerar','anterior','proxima','desfazer','refazer','x','y','escala','esquerda','direita','cima','baixo','menor','maior','restaurar'])el(id).disabled=true;
    iframe.src=`/ofertas/preview/${encodeURIComponent(options.pedido.id)}/index.html?v=${options.pedido.revision}&editar=1&sessao=${encodeURIComponent(sessao)}`;
    if(inline){dialog.hidden=false;dialog.classList.remove('em-previa');dialog.querySelector('.edicao-viewport').hidden=false;dialog.querySelector('.edicao-preview').hidden=true;rotuloPrevia(false);}
    else dialog.showModal();redimensionar();
  },
  atualizar(options){
    // A URL da prévia lê a revisão salva no servidor. Não registre uma assinatura
    // nova enquanto seus dados ainda não foram salvos: isso manteria o iframe antigo.
    if(options.salvo===false&&op?.pedido.id===options.pedido.id){op=options;return;}
    if(!op||op.pedido.id!==options.pedido.id){apiEditor.abrir(options);return;}
    op=options;
    if(assinatura===options.conteudo&&!recarregarConteudo){if(inline&&pronto){atualizarContexto();atualizarMiniaturas();}return;}
    cancelarPadronizacao();
    assinatura=options.conteudo;retomar={cartela,id:selecionados[0]||''};pronto=false;recarregarConteudo=false;sessao=crypto.randomUUID();
    iframe.src=`/ofertas/preview/${encodeURIComponent(options.pedido.id)}/index.html?v=${options.pedido.revision}&editar=1&sessao=${encodeURIComponent(sessao)}`;
  },
  irParaCartela(numero){if(pronto)enviar('cartela',{numero});else retomar={cartela:numero,id:''};},
  get dados(){return inline?el('dados'):null;},
  get preview(){return inline?dialog.querySelector('.edicao-preview'):null;},
  selecionarProduto(numero){
    produtoAtivo=numero;enviar('selecionar',{id:`${numero}:produto`});atualizarContexto();
  },
  editar(){pararPrevia();},
  conteudoAlterado(){if(!inline)return;cancelarPadronizacao();pararPrevia();pronto=false;recarregarConteudo=true;dialog.classList.add('atualizando');},
  get pronto(){return pronto;},
  get cartela(){return cartela;}
  ,recolher(){cancelarPadronizacao();expandir(false);}
  };
  function numerosDaCartela(numero=cartela){return [...new Set(elementos.filter(e=>e.cartela===numero).map(e=>e.produto))];}
  function atualizarContexto(){
    if(!inline||!pronto)return;
    const produtos=numerosDaCartela();
    const selecionado=Number((selecionados[0]||'').split(':')[0]);
    produtoAtivo=produtos.includes(selecionado)?selecionado:produtos.includes(produtoAtivo)?produtoAtivo:produtos[0];
    const destino=dialog.querySelector('.edicao-produtos');
    const selecaoAtual=selecionados.join('|');
    if(dialog.dataset.selecao!==selecaoAtual){dialog.querySelector('.edicao-transformacoes').open=selecionados.length>0;dialog.dataset.selecao=selecaoAtual;}
    const assinaturaProdutos=JSON.stringify(produtos.map(n=>[n,op.pedido.dados.produtos[n-1]?.nome]));
    if(destino.dataset.produtos!==assinaturaProdutos){
      destino.dataset.produtos=assinaturaProdutos;destino.replaceChildren();
      for(const numero of produtos){
        const p=op.pedido.dados.produtos[numero-1],b=document.createElement('button');b.type='button';b.dataset.produto=String(numero);
        b.textContent=p?.nome||`Produto ${numero}`;b.title=b.textContent;
        b.onclick=()=>apiEditor.selecionarProduto(numero);destino.append(b);
      }
    }
    destino.querySelectorAll('[data-produto]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.produto)===produtoAtivo)));
    dialog.querySelectorAll('[data-mini-cartela]').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.miniCartela)===cartela?'true':'false'));
    const nav=dialog.querySelector('.edicao-miniaturas');
    if(nav.dataset.ativa!==String(cartela)){
      nav.dataset.ativa=String(cartela);
      const b=nav.querySelector(`[data-mini-cartela="${cartela}"]`);
      if(b){const r=b.getBoundingClientRect(),v=nav.getBoundingClientRect();if(r.left<v.left)nav.scrollLeft-=v.left-r.left+4;else if(r.right>v.right)nav.scrollLeft+=r.right-v.right+4;}
    }
    op.onContexto?.({cartela,produto:produtoAtivo,produtos,selecionados:[...selecionados]});
  }
  let miniTimer=null,miniGeracao=0;
  function desenharMiniaturas(){
    if(!inline)return;
    const nav=dialog.querySelector('.edicao-miniaturas');nav.replaceChildren();delete nav.dataset.ativa;
    cartelas.forEach((c,i)=>{
      const b=document.createElement('button');b.type='button';b.dataset.miniCartela=String(i);b.dataset.carregada='false';
      b.setAttribute('aria-label',`Ir para cartela ${i+1}: ${c.nomes.join(' / ')}`);
      const imagens=document.createElement('span');imagens.className='edicao-mini-imagens';
      const mini=document.createElement('img');mini.alt=`Prévia da cartela ${i+1}`;mini.loading='lazy';mini.decoding='async';mini.dataset.cartela=String(i);imagens.append(mini);
      mini.onload=()=>{b.dataset.carregada='true';};mini.onerror=()=>{b.dataset.carregada='erro';mini.removeAttribute('src');};
      const titulo=document.createElement('strong');titulo.textContent=`Cartela ${i+1}`;
      const nomes=document.createElement('small');nomes.textContent=c.nomes.join(' / ');nomes.title=nomes.textContent;
      b.title=c.nomes.join(' / ');b.append(imagens,titulo,nomes);b.onclick=()=>{pararPrevia();enviar('cartela',{numero:i});};nav.append(b);
    });
    atualizarMiniaturas();atualizarSetasFaixa();
  }
  function assinaturaMiniatura(numero){return JSON.stringify({...op.pedido.dados,produtos:numerosDaCartela(numero).map(n=>op.pedido.dados.produtos[n-1])});}
  async function atualizarMiniaturas(tentar=false){
    if(!inline||!op)return;clearTimeout(miniTimer);const geracao=++miniGeracao,id=op.pedido.id;
    try{
      const r=await fetch(`/api/ofertas/cartelas-miniaturas?id=${encodeURIComponent(id)}${tentar===true?'&tentar=1':''}`);if(!r.ok)throw Error('Miniaturas indisponíveis');
      const dados=await r.json();if(geracao!==miniGeracao||op?.pedido.id!==id)return;
      dialog.querySelectorAll('.edicao-miniaturas img').forEach(mini=>{
        if(dados.erro)mini.closest('button').dataset.carregada='erro';
        const item=dados.cartelas?.[Number(mini.dataset.cartela)];if(!item)return;
        if(item.url&&mini.getAttribute('src')!==item.url){mini.closest('button').dataset.carregada='false';mini.src=item.url;}
        if(dados.erro)mini.closest('button').dataset.carregada='erro';
      });
      if(dados.pendente)miniTimer=setTimeout(atualizarMiniaturas,1800);
    }catch{if(geracao===miniGeracao)dialog.querySelectorAll('[data-mini-cartela]').forEach(b=>{b.dataset.carregada='erro';});}
  }
  function redimensionarMiniaturas(){}
  function atualizarSetasFaixa(){if(!inline)return;const n=dialog.querySelector('.edicao-miniaturas');el('faixa-anterior').disabled=n.scrollLeft<2;el('faixa-proxima').disabled=n.scrollLeft+n.clientWidth>=n.scrollWidth-2;}
  function rotuloPrevia(tocando){if(!inline)return;const b=el('reproduzir'),nome=tocando?'Voltar a editar':'Reproduzir prévia';b.innerHTML=svg(tocando?'editar':'play')+`<span>${tocando?'Editar':'Prévia'}</span>`;b.setAttribute('aria-label',nome);b.title=nome;b.setAttribute('aria-pressed',String(tocando));}
  function expandir(valor){
    if(!inline)return;ampliado=valor;dialog.classList.toggle('edicao-ampliado',valor);document.body.classList.toggle('of-editor-expandido',valor);
    const b=el('expandir'),nome=valor?'Recolher editor':'Expandir editor';b.innerHTML=svg(valor?'recolher':'expandir');b.setAttribute('aria-label',nome);b.title=nome;b.setAttribute('aria-pressed',String(valor));redimensionar();
  }
  if(inline){
    const nav=dialog.querySelector('.edicao-miniaturas');
    nav.addEventListener('scroll',atualizarSetasFaixa,{passive:true});
    for(const [id,direcao] of [['faixa-anterior',-1],['faixa-proxima',1]])el(id).onclick=()=>nav.scrollBy({left:direcao*nav.clientWidth*.7,behavior:'smooth'});
    nav.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const b=e.target.closest('[data-mini-cartela]');if(!b)return;e.preventDefault();
      const n=Math.max(0,Math.min(cartelas.length-1,e.key==='Home'?0:e.key==='End'?cartelas.length-1:Number(b.dataset.miniCartela)+(e.key==='ArrowLeft'?-1:1)));
      pararPrevia();enviar('cartela',{numero:n});nav.querySelector(`[data-mini-cartela="${n}"]`)?.focus({preventScroll:true});
    });
    new ResizeObserver(()=>{redimensionarMiniaturas();atualizarSetasFaixa();}).observe(nav);
    for(const modo of ['grupo','caractere'])el('modo-'+modo).onclick=()=>{el('modo').value=modo;el('modo').onchange();};
    el('zoom-menos').onclick=()=>{pararPrevia();definirZoom(zoom/1.2);};el('zoom-mais').onclick=()=>{pararPrevia();definirZoom(zoom*1.2);};el('zoom-ajustar').onclick=()=>{pararPrevia();definirZoom(1);viewport.scrollLeft=viewport.scrollTop=0;};
    el('mini-atualizar').onclick=()=>atualizarMiniaturas(true);
    el('expandir').onclick=()=>expandir(!ampliado);
    el('continuar').onclick=async()=>{expandir(false);try{await op.onContinuar?.();}catch(e){op.onErro?.(e);}};
    const escapar=e=>{if(ampliado&&e.key==='Escape'){e.preventDefault();expandir(false);el('expandir').focus();}};
    document.addEventListener('keydown',escapar);iframe.addEventListener('load',()=>{try{iframe.contentDocument.addEventListener('keydown',escapar);}catch{}});
  }
  function pararPrevia(){
    if(!inline)return;emPrevia=false;op?.onPararPrevia?.();dialog.classList.remove('em-previa');
    dialog.querySelector('.edicao-preview').hidden=true;viewport.hidden=false;
    rotuloPrevia(false);redimensionar();
  }
  if(inline)el('reproduzir').onclick=async()=>{
    if(emPrevia){pararPrevia();return;}
    const botao=el('reproduzir');botao.disabled=true;
    try{await op.onReproduzir?.(cartela,cartelas.length);emPrevia=true;dialog.classList.add('em-previa');viewport.hidden=true;dialog.querySelector('.edicao-preview').hidden=false;rotuloPrevia(true);}
    catch(e){op.onErro?.(e);}finally{botao.disabled=false;}
  };
  return apiEditor;
}
const modal=criarEditor();let integrado=null;
window.OfertasEdicao={
  abrir:modal.abrir,
  montar(options,host){if(!integrado)integrado=criarEditor(true,host);integrado.atualizar(options);return integrado;},
  atualizar(options){integrado?.atualizar(options);},
  irParaCartela(numero){integrado?.irParaCartela(numero);},
  editar(){integrado?.editar();},
  conteudoAlterado(){integrado?.conteudoAlterado();},
  recolher(){integrado?.recolher();},
  selecionarProduto(numero){integrado?.selecionarProduto(numero);}
};
})();
