const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function ambiente(){
  const eventos={},campos={},mensagens=[];
  class Elemento{
    constructor(){this.style={};this.dataset={};this.options=[];this.value='1';this.clientWidth=960;this.clientHeight=540;this.scrollLeft=0;this.scrollTop=0;this.listeners={};}
    addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
    emitir(k,e){for(const f of this.listeners[k]||[])f(e);}
    querySelector(s){if(s==='[data-livre]')return this.options.find(o=>o.dataset.livre);return campos[s]??=new Elemento();}
    appendChild(o){this.options.push(o);o.remove=()=>this.options.splice(this.options.indexOf(o),1);}
    replaceChildren(...o){this.options=o;}
    showModal(){this.open=true;}
    close(){this.open=false;}
    removeAttribute(){} setPointerCapture(){} blur(){}
    getBoundingClientRect(){return {left:0,top:0,width:960,height:540};}
  }
  const dialog=new Elemento(),iframe=new Elemento(),viewport=new Elemento(),palco=new Elemento();
  iframe.contentWindow={postMessage:d=>mensagens.push(d)};
  iframe.getBoundingClientRect=()=>{const width=parseFloat(palco.style.width)||960;return {left:Math.max(0,(960-width)/2)-viewport.scrollLeft,top:-viewport.scrollTop,width,height:width*1080/1920};};
  Object.assign(campos,{'iframe':iframe,'.edicao-viewport':viewport,'.edicao-palco':palco});
  const ctx={document:{createElement:()=>dialog,body:{appendChild(){}}},window:{addEventListener:(k,f)=>eventos[k]=f},location:{origin:'http://local'},crypto:{randomUUID:()=> 'sessao'},ResizeObserver:class{observe(){}},Option:class{constructor(text,value){this.text=text;this.value=value;this.dataset={};}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../static/ofertas-editor.js'),'utf8'),ctx);
  const campo=k=>campos[`[data-ed="${k}"]`];
  for(const z of [1,1.5,2,3])campo('zoom').appendChild(new ctx.Option('',String(z)));
  ctx.window.OfertasEdicao.abrir({pedido:{id:'teste',revision:1}});
  const receber=d=>eventos.message({origin:'http://local',source:iframe.contentWindow,data:{sessao:'sessao',...d}});
  receber({tipo:'pronto',cartelas:[{nomes:['Produto']}],elementos:[],ajustes:{}});
  return {dialog,iframe,viewport,palco,campo,receber,mensagens};
}
test('Alt + rolagem amplia no cursor, limita o zoom e não altera camadas',()=>{
  const a=ambiente();let bloqueou=false;
  a.viewport.emitir('wheel',{altKey:false,deltaY:-100,preventDefault(){throw Error('rolagem normal deve continuar');}});
  assert.equal(parseFloat(a.palco.style.width),960);
  a.viewport.emitir('wheel',{altKey:true,deltaY:-200,deltaMode:0,clientX:480,clientY:270,preventDefault(){bloqueou=true;}});
  assert.ok(bloqueou);assert.ok(parseFloat(a.palco.style.width)>960);assert.ok(a.viewport.scrollLeft>0);
  a.receber({tipo:'vista',acao:'zoom-vista',delta:-99999,x:960,y:540});assert.equal(parseFloat(a.palco.style.width),3840);
  a.receber({tipo:'vista',acao:'zoom-vista',delta:99999,x:960,y:540});assert.equal(parseFloat(a.palco.style.width),960);
  assert.equal(a.mensagens.length,0);
});
test('arraste direito recebido do iframe desloca só a vista e termina sem mover seleção',()=>{
  const a=ambiente();a.viewport.scrollLeft=400;a.viewport.scrollTop=300;
  a.receber({tipo:'vista',acao:'pan-inicio'});a.receber({tipo:'vista',acao:'pan-mover',x:80,y:-40});
  assert.equal(a.viewport.scrollLeft,320);assert.equal(a.viewport.scrollTop,340);
  a.receber({tipo:'vista',acao:'pan-fim'});a.receber({tipo:'vista',acao:'pan-mover',x:200,y:200});
  assert.equal(a.viewport.scrollLeft,320);assert.equal(a.mensagens.length,0);
});
test('Ctrl Z e Ctrl Shift Z nos controles encaminham histórico, preservando edição de campos',()=>{
  const a=ambiente();const evento=shiftKey=>({ctrlKey:true,key:'z',shiftKey,target:{matches:()=>false},preventDefault(){}});
  a.dialog.emitir('keydown',evento(false));a.dialog.emitir('keydown',evento(true));
  assert.deepEqual(a.mensagens.map(m=>m.acao),['desfazer','refazer']);
  a.dialog.emitir('keydown',{...evento(false),target:{matches:()=>true}});assert.equal(a.mensagens.length,2);
});
