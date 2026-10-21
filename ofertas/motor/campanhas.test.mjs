import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validarTemplate,esquema,dadosPadrao,prepararDados} from './contrato.mjs';
const pasta=fileURLToPath(new URL('../templates',import.meta.url));
for(const tipo of ['hora-da-feira','momento-do-bebe']){
 test(`${tipo}: editor, slides, animações, HD e quantidades flexíveis`,()=>{
  const dir=join(pasta,`uniforca-${tipo}-flexivel`),{template,erros}=validarTemplate(dir);
  assert.deepEqual(erros,[]);const schema=esquema(template);assert.equal(schema.editorCartelas,true);assert.deepEqual(schema.saida,{largura:1280,altura:720});
  const lista=schema.campos.find(c=>c.id==='produtos');assert.equal(lista.grupo.finalTres,true);assert.equal(lista.grupo.incompleto,true);
  for(const n of [1,2,3,7,30])for(const animacoes of [true,false])for(const ultimacartela of ['sozinho','tres']){
   const d=dadosPadrao(template),modelo=d.produtos[0];d.produtos=Array.from({length:n},()=>({...modelo}));d.animacoes=animacoes;d.ultimacartela=ultimacartela;
   d.produtos[0].edicao=JSON.stringify({v:1,elementos:{produto:{x:10,y:0,escala:1.1},'clube-int-0':{x:2,y:3,escala:.9}}});
   const p=prepararDados(template,d,dir);assert.deepEqual(p.erros,[]);assert.equal(p.variaveis.produtos_total,n);assert.equal(p.variaveis.produtos_1_edicao,d.produtos[0].edicao);
  }
  for(const f of ['layout.js','edicao.js','animacao.js'])assert.equal(readFileSync(join(dir,'assets',f),'utf8'),readFileSync(join(pasta,'uniforca-hora-da-carne-flexivel/assets',f),'utf8'));
 });
}
