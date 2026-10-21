const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const fonte = fs.readFileSync(path.join(__dirname, '../static/ofertas.js'), 'utf8');
const fluxo = fonte.slice(fonte.indexOf('function atualizarEtapas()'), fonte.indexOf("\nel('etapas').querySelectorAll('[data-etapa]').forEach(b => b.addEventListener"));
const grupos = fonte.slice(fonte.indexOf('const passoDe ='), fonte.indexOf('function aplicarValidacao'));

function ambiente() {
  const campos = new Map();
  const el = id => {
    if (!campos.has(id)) campos.set(id, {value:'', textContent:'', hidden:false, disabled:false});
    return campos.get(id);
  };
  const lista = {id:'produtos', min:1, itens:30, grupo:{tamanho:2}};
  const state = {tela:'videos', pedido:{dados:{produtos:Array(21).fill({}),ultimacartela:'tres'}}, esquema:{nome:'Carnes',duracao:15,saida:{largura:1280,altura:720}}, validacao:[],ordem:[]};
  const enc = {status:'pronto',nome:'encarte.pdf',itens:Array.from({length:21},(_,i)=>({nome:`Produto ${i}`,conferido:i<3,avisos:i===4?['Preço']:[]}))};
  const visitas=[], avisos=[];
  el('titulo').value='VT 1';
  el('save-state').textContent='Salvo';
  const c=vm.createContext({state,el,document:{activeElement:null},listaPrincipal:()=>lista,encAtual:()=>enc,avisosDe:it=>it.avisos,mostrar:async t=>visitas.push(t),aviso:t=>avisos.push(t),salvarAgora:async()=>{}});
  vm.runInContext(grupos+fluxo,c);
  return {c,state,el,enc,visitas,avisos};
}
test('conferir ofertas independe de template e continua com todos os produtos na ordem',async()=>{
  const a=ambiente();a.state.pedido=null;a.state.esquema=null;
  await vm.runInContext('continuarEncarte(true)',a.c);
  assert.equal(a.state.importarNaEscolha,true);
  assert.deepEqual(Array.from(a.state.ordem),Array.from({length:21},(_,i)=>i));
  assert.deepEqual(a.visitas,['catalogo']);
  a.enc.status='lendo';a.visitas.length=0;
  await vm.runInContext('continuarEncarte(true)',a.c);
  assert.equal(a.visitas.length,0);assert.equal(a.avisos.length,1);
});
test('saída reflete trio, nome, tamanho HD e avisos sem permitir geração inválida',()=>{
  const a=ambiente();vm.runInContext('desenharSaida()',a.c);
  assert.match(a.el('video-resumo').textContent,/21 produtos · 10 cartelas · 15s · MP4 1280 × 720/);
  assert.equal(a.el('video-titulo').value,'VT 1');
  assert.equal(a.el('gerar').disabled,false);
  a.state.validacao=[{mensagem:'Sem preço'}];vm.runInContext('desenharSaida()',a.c);
  assert.equal(a.el('gerar').disabled,true);
  a.state.validacao=[];a.state.encarteInteiro=true;vm.runInContext('desenharSaida()',a.c);
  assert.equal(a.el('gerar').disabled,true);
  assert.equal(a.el('encarte-todos').hidden,false);
});
test('avançar requer pedido e salvamento concluído; voltar não gera vídeo',async()=>{
  const a=ambiente();a.state.pedido=null;
  await vm.runInContext('irParaVideos()',a.c);assert.deepEqual(a.visitas,['catalogo']);
  a.visitas.length=0;a.state.pedido={};a.el('save-state').textContent='Não foi possível salvar';
  await vm.runInContext('irParaVideos()',a.c);assert.deepEqual(a.visitas,[]);
  a.el('save-state').textContent='Salvo · agora';await vm.runInContext('irParaVideos()',a.c);
  assert.deepEqual(a.visitas,['videos']);
});
test('resumo distingue produtos conferidos dos produtos apenas reconhecidos',()=>{
  const a=ambiente();vm.runInContext('atualizarResumoConferencia()',a.c);
  assert.match(a.el('conferencia-resumo').textContent,/21 produtos · 3 conferidos · 1 com avisos/);
  assert.equal(a.el('continuar-encarte').disabled,false);
  a.enc.itens=[];vm.runInContext('atualizarResumoConferencia()',a.c);
  assert.equal(a.el('continuar-encarte').disabled,true);
});
