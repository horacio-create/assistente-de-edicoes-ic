/* Os mesmos elementos e ajustes são usados na conferência e na exportação. */
(function(global) {
  const valido = /^(titulo|produto|precos|selo|normal|selo-titulo|(?:de|clube)-(?:int|cent)-\d{1,2}|clube-virgula|(?:de|clube)-(?:unidade|moeda))$/;
  const limitar=(v,min,max,padrao)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):padrao;
  function limpar(bruto) {
    try {
      const obj=typeof bruto==='string'?JSON.parse(bruto||'{}'):bruto;
      const elementos={};
      for(const [id,a] of Object.entries(obj?.elementos||{}).slice(0,200)) {
        if(!valido.test(id)||!a||typeof a!=='object')continue;
        elementos[id]={x:limitar(a.x,-1920,1920,0),y:limitar(a.y,-1080,1080,0),escala:limitar(a.escala,.2,4,1)};
      }
      return {v:1,elementos};
    } catch {return {v:1,elementos:{}};}
  }
  function preparar(p,n,bruto) {
    p.dataset.numeroProduto=n;p.__ajustes=limpar(bruto);
    function marcar(no,id,rotulo,nivel='grupo') {
      if(!no)return;
      no.dataset.editavel=id;no.dataset.rotulo=rotulo;no.dataset.nivel=nivel;
      no.style.transformOrigin='center center';
    }
    function envolver(no,classe,id,rotulo,flex=false) {
      const dentro=document.createElement('div');dentro.className=classe;
      while(no.firstChild)dentro.appendChild(no.firstChild);
      no.appendChild(dentro);marcar(dentro,id,rotulo);
      if(flex){dentro.style.display='flex';dentro.style.flex='0 0 auto';dentro.style.whiteSpace='nowrap';}
      return dentro;
    }
    envolver(p.querySelector('.nome'),'ajuste-titulo','titulo','Título');
    const foto=envolver(p.querySelector('.foto-box'),'ajuste-produto','produto','Imagem do produto',true);
    foto.style.cssText+=';width:100%;height:100%;align-items:center;justify-content:center';
    const precos=envolver(p.querySelector('.precos'),'ajuste-precos','precos','Todos os preços');
    precos.style.cssText+=';position:absolute;inset:0';
    const selo=envolver(p.querySelector('.selo'),'ajuste-selo','selo','Selo completo');
    selo.style.cssText+=';position:absolute;inset:0';
    const de=p.querySelector('.de');if(de)envolver(de,'ajuste-normal','normal','Preço normal',true);
    for(const [seletor,prefixo] of [['.de','de'],['.selo-preco','clube']]) {
      const preco=p.querySelector(seletor);if(!preco)continue;
      for(const parte of ['int','cent']) {
        const no=preco.querySelector('.'+parte),texto=no.textContent;no.textContent='';no.style.whiteSpace='nowrap';no.style.flexShrink='0';
        Array.from(texto).forEach((c,i)=>{
          const span=document.createElement('span');span.textContent=c;span.style.display='inline-block';
          marcar(span,`${prefixo}-${parte}-${i}`,`${prefixo==='de'?'Normal':'Clube'} · “${c}” (${i+1})`,'caractere');no.appendChild(span);
        });
      }
      marcar(preco.querySelector('.un'),prefixo+'-unidade',(prefixo==='de'?'Normal':'Clube')+' · unidade','caractere');
      marcar(preco.querySelector('.rs'),prefixo+'-moeda',(prefixo==='de'?'Normal':'Clube')+' · R$','caractere');
    }
    marcar(p.querySelector('.virgula'),'clube-virgula','Clube · vírgula','caractere');
    marcar(p.querySelector('.selo-titulo'),'selo-titulo','Texto do selo','caractere');
  }
  const transformacao=(no)=>no.closest('.produto').__ajustes.elementos[no.dataset.editavel]||{x:0,y:0,escala:1};
  function pintar(no) {
    const a=transformacao(no);no.style.transform=`translate(${a.x}px,${a.y}px) scale(${a.escala})`;
  }
  function aplicar(produtos) {produtos.forEach(p=>p.querySelectorAll('[data-editavel]').forEach(pintar));}

  function iniciarEditor(produtos) {
    const url=new URL(location.href);if(url.searchParams.get('editar')!=='1')return;
    const sessao=url.searchParams.get('sessao');if(!sessao||window.parent===window)return;
    const paineis=[...document.querySelectorAll('.painel')],selecionados=new Set();
    let cartela=0,modo='grupo',arraste=null,passado=[],futuro=[],encaixar=true,previaLote=null;
    document.getElementById('root').dataset.editando='1';
    const estilo=document.createElement('style');estilo.textContent=`
      #root[data-editando] .painel{display:none!important;visibility:hidden!important}
      #root[data-editando] .painel.cartela-editando{display:flex!important;visibility:visible!important;opacity:1!important}
      [data-editavel]{cursor:move;touch-action:none;user-select:none}
      body[data-navegando] [data-editavel]{cursor:grabbing!important}
      .ed-selecao{outline:2px solid #6146ed;outline-offset:3px}
      #ed-caixa{position:absolute;border:2px dashed #6146ed;pointer-events:none;z-index:9999;box-sizing:border-box}
      #ed-alca{position:absolute;right:-12px;bottom:-12px;width:24px;height:24px;background:#6146ed;border:3px solid white;pointer-events:auto;cursor:nwse-resize;touch-action:none}
    `;document.head.appendChild(estilo);
    const caixa=document.createElement('div');caixa.id='ed-caixa';caixa.hidden=true;
    const alca=document.createElement('button');alca.id='ed-alca';alca.setAttribute('aria-label','Redimensionar seleção');caixa.appendChild(alca);document.getElementById('root').appendChild(caixa);
    const enviar=(tipo,extra={})=>parent.postMessage({tipo,sessao,...extra},location.origin);
    const todos=()=>[...paineis[cartela].querySelectorAll('[data-editavel]')];
    const id=no=>`${no.closest('.produto').dataset.numeroProduto}:${no.dataset.editavel}`;
    const estado=()=>Object.fromEntries(produtos.map(p=>[p.dataset.numeroProduto,limpar(p.__ajustes)]));
    function restaurar(obj){produtos.forEach(p=>p.__ajustes=limpar(obj[p.dataset.numeroProduto]));aplicar(produtos);}
    function guardar(antes){if(JSON.stringify(antes)===JSON.stringify(estado()))return;passado.push(antes);if(passado.length>60)passado.shift();futuro=[];avisar(true);}
    function uniao(){
      const rs=[...selecionados].map(n=>n.getBoundingClientRect());if(!rs.length)return null;
      const left=Math.min(...rs.map(r=>r.left)),top=Math.min(...rs.map(r=>r.top)),right=Math.max(...rs.map(r=>r.right)),bottom=Math.max(...rs.map(r=>r.bottom));
      return {left,top,right,bottom,width:right-left,height:bottom-top,cx:(left+right)/2,cy:(top+bottom)/2};
    }
    function avisar(mudou=false){
      document.querySelectorAll('.ed-selecao').forEach(n=>n.classList.remove('ed-selecao'));
      selecionados.forEach(n=>n.classList.add('ed-selecao'));
      const r=uniao();caixa.hidden=!r;if(r)Object.assign(caixa.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
      const primeiro=[...selecionados][0];
      enviar('estado',{cartela,selecionados:[...selecionados].map(id),valor:primeiro?transformacao(primeiro):null,desfazer:!!passado.length,refazer:!!futuro.length,...(mudou?{ajustes:estado()}: {})});
    }
    function selecionar(no,multiplo){
      if(!multiplo)selecionados.clear();
      if(no){if(selecionados.has(no))selecionados.delete(no);else{
        [...selecionados].filter(n=>n.contains(no)||no.contains(n)).forEach(n=>selecionados.delete(n));selecionados.add(no);
      }}avisar();
    }
    function escrever(no,a){no.closest('.produto').__ajustes.elementos[no.dataset.editavel]=limpar({elementos:{[no.dataset.editavel]:a}}).elementos[no.dataset.editavel];pintar(no);}
    const herdada=no=>no.getBoundingClientRect().width/Math.max(.01,no.offsetWidth*transformacao(no).escala);
    function mover(dx,dy){
      const r=uniao();if(!r)return;
      const limite=paineis[cartela].getBoundingClientRect();
      dx=Math.max(limite.left+8-r.left,Math.min(limite.right-8-r.right,dx));
      dy=Math.max(limite.top+8-r.top,Math.min(limite.bottom-8-r.bottom,dy));
      selecionados.forEach(no=>{const a=transformacao(no),s=herdada(no);escrever(no,{...a,x:a.x+dx/s,y:a.y+dy/s});});
    }
    function escalar(fator){
      const r=uniao();if(!r)return;const limite=paineis[cartela].getBoundingClientRect();
      fator=Math.min(fator,(limite.width-16)/r.width,(limite.height-16)/r.height,...[...selecionados].map(n=>4/transformacao(n).escala));
      fator=Math.max(fator,...[...selecionados].map(n=>.2/transformacao(n).escala));
      const dados=[...selecionados].map(no=>({no,a:transformacao(no),r:no.getBoundingClientRect(),s:herdada(no)}));
      dados.forEach(({no,a,r:b,s})=>escrever(no,{x:a.x+((b.left+b.width/2-r.cx)*(fator-1))/s,y:a.y+((b.top+b.height/2-r.cy)*(fator-1))/s,escala:a.escala*fator}));mover(0,0);
    }
    // Coordenadas visuais são convertidas para a escala herdada de cada elemento.
    function alinhar(eixo,referencia='selecao') {
      if(!selecionados.size)return;
      const grupo=uniao(),limite=paineis[cartela].getBoundingClientRect();
      const alvo=referencia==='cartela'||selecionados.size===1?limite:grupo,margem=alvo===limite?8:0;
      [...selecionados].forEach(no=>{
        const r=no.getBoundingClientRect(),a=transformacao(no),s=herdada(no);
        const dx=eixo==='esquerda'?alvo.left+margem-r.left:eixo==='direita'?alvo.right-margem-r.right:eixo==='centro-x'?(alvo.left+alvo.right-r.left-r.right)/2:0;
        const dy=eixo==='topo'?alvo.top+margem-r.top:eixo==='base'?alvo.bottom-margem-r.bottom:eixo==='centro-y'?(alvo.top+alvo.bottom-r.top-r.bottom)/2:0;
        escrever(no,{...a,x:a.x+dx/s,y:a.y+dy/s});
      });mover(0,0);
    }
    function distribuir(eixo) {
      if(selecionados.size<3)return;
      const horizontal=eixo==='x',inicio=horizontal?'left':'top',fim=horizontal?'right':'bottom',medida=horizontal?'width':'height';
      const nos=[...selecionados].sort((a,b)=>a.getBoundingClientRect()[inicio]-b.getBoundingClientRect()[inicio]);
      const rects=nos.map(n=>n.getBoundingClientRect());
      const espaco=(rects.at(-1)[fim]-rects[0][inicio]-rects.reduce((s,r)=>s+r[medida],0))/(nos.length-1);
      let pos=rects[0][inicio];nos.forEach((no,i)=>{const a=transformacao(no),d=(pos-rects[i][inicio])/herdada(no);escrever(no,{...a,x:a.x+(horizontal?d:0),y:a.y+(horizontal?0:d)});pos+=rects[i][medida]+espaco;});
    }
    const guia=document.createElement('div');guia.id='ed-guias';guia.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:9998';document.getElementById('root').appendChild(guia);
    function moverComGuias(dx,dy) {
      guia.replaceChildren();const r=uniao();if(!r)return;
      if(encaixar){
        const painel=paineis[cartela].getBoundingClientRect();
        const refs=[painel,...todos().filter(n=>n.dataset.nivel==='grupo'&&![...selecionados].some(s=>s===n||s.contains(n)||n.contains(s))).map(n=>n.getBoundingClientRect())];
        for(const eixo of ['x','y']){
          const chaves=eixo==='x'?['left','right']:['top','bottom'],origem=[r[chaves[0]],(r[chaves[0]]+r[chaves[1]])/2,r[chaves[1]]];
          let melhor=null;
          for(const ref of refs)for(const destino of [ref[chaves[0]],(ref[chaves[0]]+ref[chaves[1]])/2,ref[chaves[1]]])for(const valor of origem){const delta=destino-valor-(eixo==='x'?dx:dy);if(Math.abs(delta)<=7&&(!melhor||Math.abs(delta)<Math.abs(melhor.delta)))melhor={delta,destino};}
          if(melhor){if(eixo==='x')dx+=melhor.delta;else dy+=melhor.delta;const linha=document.createElement('i');linha.style.cssText=eixo==='x'?`position:absolute;left:${melhor.destino}px;top:${painel.top}px;height:${painel.height}px;border-left:1px solid #d12998`:`position:absolute;top:${melhor.destino}px;left:${painel.left}px;width:${painel.width}px;border-top:1px solid #d12998`;guia.appendChild(linha);}
        }
      }mover(dx,dy);
    }
    function padronizar(c) {
      const partes=['produto','titulo','normal','selo','precos'];if(!partes.includes(c.parte))return;
      const origem=produtos.find(p=>Number(p.dataset.numeroProduto)===Number(c.origem));if(!origem)return;
      const noOrigem=origem.querySelector(`[data-editavel="${c.parte}"]`);if(!noOrigem)return;
      const ajuste=transformacao(noOrigem),destinos=new Set((c.cartelas||[]).map(Number));
      produtos.filter(p=>destinos.has(paineis.indexOf(p.closest('.painel')))).forEach(p=>{
        const no=p.querySelector(`[data-editavel="${c.parte}"]`);if(!no)return;
        // Copia a escala relativa ao desenho do template; posições só mudam por escolha explícita.
        const painel=p.closest('.painel'),anterior=painel.style.cssText;painel.style.setProperty('display','flex','important');painel.style.setProperty('visibility','hidden','important');
        escrever(no,c.posicao?{...ajuste}:{...transformacao(no),escala:ajuste.escala});
        const r=no.getBoundingClientRect(),lim=p.closest('.painel').getBoundingClientRect(),a=transformacao(no);
        const fator=Math.min(1,(lim.width-16)/Math.max(1,r.width),(lim.height-16)/Math.max(1,r.height));
        if(fator<1)escrever(no,{...a,escala:a.escala*fator});
        const b=no.getBoundingClientRect(),s=herdada(no),atual=transformacao(no);
        const dx=b.left<lim.left+8?lim.left+8-b.left:b.right>lim.right-8?lim.right-8-b.right:0;
        const dy=b.top<lim.top+8?lim.top+8-b.top:b.bottom>lim.bottom-8?lim.bottom-8-b.bottom:0;
        if(dx||dy)escrever(no,{...atual,x:atual.x+dx/s,y:atual.y+dy/s});
        painel.style.cssText=anterior;
      });
    }
    function navegar(n){cartela=Math.max(0,Math.min(paineis.length-1,n));paineis.forEach((p,i)=>p.classList.toggle('cartela-editando',i===cartela));selecionados.clear();avisar();}
    function comando(c){
      if(previaLote&&!['cartela','lote-previa','lote-cancelar','lote-aplicar'].includes(c.acao))return;
      if(c.acao==='cartela'){navegar(c.numero);return;}
      if(c.acao==='modo'){modo=c.valor;return;}
      if(c.acao==='selecionar'){selecionar(todos().find(n=>id(n)===c.id));return;}
      if(c.acao==='desfazer'&&passado.length){futuro.push(estado());restaurar(passado.pop());avisar(true);return;}
      if(c.acao==='refazer'&&futuro.length){passado.push(estado());restaurar(futuro.pop());avisar(true);return;}
      if(c.acao==='encaixe'){encaixar=c.valor!==false;guia.replaceChildren();return;}
      if(c.acao==='lote-previa'){
        if(previaLote)restaurar(previaLote);else previaLote=estado();
        padronizar(c);avisar();return;
      }
      if(c.acao==='lote-cancelar'){if(previaLote)restaurar(previaLote);previaLote=null;avisar();return;}
      if(c.acao==='lote-aplicar'){if(previaLote){const antes=previaLote;previaLote=null;guardar(antes);}avisar();return;}
      if(previaLote)return;
      const antes=estado();
      if(c.acao==='alinhar')alinhar(c.eixo,c.referencia);
      if(c.acao==='distribuir')distribuir(c.eixo);
      if(c.acao==='mover')mover(limitar(c.x,-1920,1920,0),limitar(c.y,-1080,1080,0));
      if(c.acao==='escala')escalar(limitar(c.fator,.1,10,1));
      if(c.acao==='valor'&&selecionados.size){
        const primeiro=[...selecionados][0],a=transformacao(primeiro);
        if(c.campo==='escala')escalar(limitar(c.valor,.2,4,1)/a.escala);
        else if(['x','y'].includes(c.campo)){
          const delta=(limitar(c.valor,-1920,1920,0)-a[c.campo])*herdada(primeiro);mover(c.campo==='x'?delta:0,c.campo==='y'?delta:0);
        }
      }
      if(c.acao==='restaurar')selecionados.forEach(no=>{delete no.closest('.produto').__ajustes.elementos[no.dataset.editavel];pintar(no);});
      if(c.acao==='restaurar-cartela'){paineis[cartela].querySelectorAll('.produto').forEach(p=>p.__ajustes=limpar({}));aplicar(produtos);}
      guardar(antes);avisar();
    }
    window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.sessao!==sessao||e.data.tipo!=='comando')return;comando(e.data);});
    let navegacao=null;
    document.addEventListener('wheel',e=>{
      if(!e.altKey)return;e.preventDefault();
      enviar('vista',{acao:'zoom-vista',delta:e.deltaY*(e.deltaMode===1?16:1),x:e.clientX,y:e.clientY});
    },{passive:false});
    document.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('pointerdown',e=>{
      if(e.button===2){
        if(arraste)return;e.preventDefault();navegacao={x:e.screenX,y:e.screenY};
        document.body.dataset.navegando='1';document.body.style.cursor='grabbing';e.target.setPointerCapture(e.pointerId);enviar('vista',{acao:'pan-inicio'});return;
      }
      if(e.button!==0||navegacao||previaLote)return;
      if(e.target===alca){arraste={antes:estado(),x:e.clientX,y:e.clientY,escala:true,rect:uniao()};}
      else{
        // Prioriza a caixa do caractere: partes transparentes do selo e textos
        // vizinhos podem estar sobrepostos no ponto clicado.
        const caracteres=modo==='caractere'?todos().filter(n=>{
          const r=n.getBoundingClientRect();return n.dataset.nivel==='caractere'&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
        }).sort((a,b)=>a.getBoundingClientRect().width*a.getBoundingClientRect().height-b.getBoundingClientRect().width*b.getBoundingClientRect().height):[];
        const no=caracteres[0]||e.target.closest(`[data-editavel]${modo==='grupo'?'[data-nivel="grupo"]':''}`);
        if(!no||!paineis[cartela].contains(no)){selecionar(null,false);return;}
        if(e.shiftKey||!selecionados.has(no))selecionar(no,e.shiftKey);
        arraste={antes:estado(),x:e.clientX,y:e.clientY,escala:false};
      }
      e.preventDefault();document.body.focus();e.target.setPointerCapture(e.pointerId);
    });
    document.addEventListener('pointermove',e=>{if(navegacao){enviar('vista',{acao:'pan-mover',x:e.screenX-navegacao.x,y:e.screenY-navegacao.y});return;}if(!arraste)return;
      restaurar(arraste.antes);
      if(arraste.escala){const r=arraste.rect;escalar(Math.max(.1,(Math.hypot(e.clientX-r.cx,e.clientY-r.cy))/Math.max(1,Math.hypot(arraste.x-r.cx,arraste.y-r.cy))));}
      else moverComGuias(e.clientX-arraste.x,e.clientY-arraste.y);avisar();
    });
    const finalizar=()=>{guia.replaceChildren();if(navegacao){navegacao=null;delete document.body.dataset.navegando;document.body.style.cursor='';enviar('vista',{acao:'pan-fim'});return;}if(!arraste)return;const antes=arraste.antes;arraste=null;guardar(antes);avisar();};
    document.addEventListener('pointerup',finalizar);document.addEventListener('pointercancel',finalizar);document.addEventListener('lostpointercapture',finalizar);
    document.body.tabIndex=-1;
    document.addEventListener('keydown',e=>{
      const passo=e.shiftKey?10:1;let c;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z')c={acao:e.shiftKey?'refazer':'desfazer'};
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y')c={acao:'refazer'};
      else if(e.key.startsWith('Arrow'))c={acao:'mover',x:e.key==='ArrowLeft'?-passo:e.key==='ArrowRight'?passo:0,y:e.key==='ArrowUp'?-passo:e.key==='ArrowDown'?passo:0};
      else if(['+','=','-'].includes(e.key))c={acao:'escala',fator:e.key==='-'?.95:1.05};
      if(c){e.preventDefault();comando(c);}
    });
    navegar(0);
    enviar('pronto',{cartelas:paineis.map((p,i)=>({numero:i,nomes:[...p.querySelectorAll('.nome')].map(n=>n.textContent)})),elementos:produtos.flatMap(p=>[...p.querySelectorAll('[data-editavel]')].map(no=>({id:id(no),produto:Number(p.dataset.numeroProduto),cartela:paineis.indexOf(p.closest('.painel')),rotulo:`Produto ${p.dataset.numeroProduto} · ${no.dataset.rotulo}`,nivel:no.dataset.nivel}))),ajustes:estado()});
  }
  global.EdicaoCartelas={limpar,preparar,aplicar,iniciarEditor};
  if(typeof module!=='undefined')module.exports={limpar};
})(globalThis);
