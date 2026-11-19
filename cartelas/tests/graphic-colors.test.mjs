import test from 'node:test';
import assert from 'node:assert/strict';
import {graphicColors} from '../public/graphic-colors.js';
import {dominantColors} from '../public/palette-analysis.js';
import {recurringColors,referenceNotes} from '../public/reference-analysis.js';
function image(){const width=300,height=220,data=new Uint8ClampedArray(width*height*4);let seed=1234;for(let i=0;i<width*height;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed%90;data.set([100+noise,55+noise,30+noise,255],i*4);}return {width,height,data};}
function rect(p,x,y,w,h,color){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)p.data.set([...color,255],(j*p.width+i)*4);}
test('faixa gráfica pequena supera massa marrom de textura sem proibir marrom na marca',()=>{
 const p=image();rect(p,30,80,230,20,[106,101,204]);const before=p.data.slice(),general=dominantColors(p),found=graphicColors(p);assert.notEqual(general[0].hex,'#6a65cc');assert.equal(found[0].hex,'#6a65cc');assert.deepEqual(p.data,before);assert.ok(found[0].evidence.length);assert.ok(found[0].rectangles>=1);
 const brown=image();rect(brown,20,50,240,35,[128,72,35]);assert.equal(graphicColors(brown)[0].hex,'#804823');
});
test('procura cores gráficas variadas e evidencia retângulos dentro da imagem',()=>{
 for(const color of [[24,31,58],[45,190,90],[230,140,20],[40,90,220]]){const p=image();rect(p,40,90,210,25,color);const found=graphicColors(p);assert.equal(found[0].hex,'#'+color.map(n=>n.toString(16).padStart(2,'0')).join(''));for(const b of found[0].evidence)assert.ok(b.x>=0&&b.y>=0&&b.w>0&&b.h>0&&b.x+b.w<=1.00001&&b.y+b.h<=1.00001);}
});
test('não inventa paleta quando não há regiões gráficas fortes; valida limites',()=>{
 assert.deepEqual(graphicColors(image()),[]);const p=image();for(let i=3;i<p.data.length;i+=4)p.data[i]=0;assert.deepEqual(graphicColors(p),[]);assert.throws(()=>graphicColors({...p,width:2000,height:2000}));assert.throws(()=>graphicColors(p,0));assert.throws(()=>graphicColors({...p,data:[]}));
});
test('agrupamento conserva evidência por referência sem trocar seus índices',()=>{
 const p=image();rect(p,10,20,260,30,[106,101,204]);const colors=graphicColors(p),combined=recurringColors([{name:'um.png',colors},{name:'dois.png',colors}]);assert.equal(combined[0].count,2);assert.deepEqual(combined[0].sources.map(s=>s.index),[0,1]);assert.deepEqual(combined[0].sources[0].evidence,colors[0].evidence);
});
test('observações da identidade guardam as escolhas, sem promover candidatos descartados ou não escolhidos',()=>{
 const samples=[{name:'print.png',colors:[{hex:'#6a65cc',share:.7,graphic:true},{hex:'#804823',share:.3,graphic:true}]}],colors=recurringColors(samples),notes=referenceNotes({samples,colors,palette:{primary:'#6a65cc',accent:'#ffffff',background:'#eeeeee'}});assert.match(notes,/Principal #6A65CC/);assert.match(notes,/regiões gráficas prováveis/);assert.match(notes,/#6A65CC: presente/);assert.doesNotMatch(notes,/#804823/);
});
