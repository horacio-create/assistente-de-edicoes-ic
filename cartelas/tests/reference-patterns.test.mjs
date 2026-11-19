import test from 'node:test';
import assert from 'node:assert/strict';
import {graphicPatterns,patternNotes} from '../public/reference-patterns.js';
import {graphicColors} from '../public/graphic-colors.js';
const b={x:.1,y:.05,w:.5,h:.06};
test('padrões agrupam tipo por referências distintas e mantêm áreas para conferência',()=>{
 const samples=[{name:'um',colors:[{hex:'#6a65cc',elements:[{type:'band',box:b},{type:'band',box:{...b,y:.5}}]}]},{name:'dois',colors:[{hex:'#abcdef',elements:[{type:'band',box:b},{type:'box',box:{x:.5,y:.5,w:.2,h:.2}}]}]}];
 const patterns=graphicPatterns(samples),band=patterns.find(p=>p.id==='band');assert.equal(band.sources.length,2);assert.equal(band.count,3);assert.deepEqual(band.colors,['#6a65cc','#abcdef']);assert.equal(band.sources[0].evidence.length,2);assert.deepEqual(band.positions,[]);assert.match(patternNotes([band]),/Faixas horizontais: 2\/2/);assert.doesNotMatch(patternNotes([band]),/posição/);
 const single=graphicPatterns(samples,{singleArtwork:true}).find(p=>p.id==='band');assert.deepEqual(single.positions,[{position:'topo',prints:2},{position:'centro',prints:1}]);assert.match(patternNotes([single]),/posição na arte individual/);
});
test('não inventa elementos ou posições e rejeita regiões fora dos limites',()=>{
 assert.deepEqual(graphicPatterns([{name:'foto',colors:[{hex:'#123456'}]}]),[]);assert.deepEqual(graphicPatterns([{name:'x',colors:[{hex:'#123456',elements:[{type:'logo',box:b},{type:'band',box:{...b,w:2}}]}]}]),[]);assert.equal(patternNotes([]),'');
});
test('extração distingue faixa, caixa e base ampla sem reescrever imagem nem mudar paleta',()=>{
 const width=320,height=240,data=new Uint8ClampedArray(width*height*4);const rect=(x,y,w,h,c)=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)data.set([...c,255],(row*width+col)*4);};
 rect(2,2,316,236,[245,245,245]);rect(20,30,200,20,[106,101,204]);rect(40,100,70,65,[30,60,90]);const before=data.slice(),colors=graphicColors({width,height,data}),types=colors.flatMap(c=>c.elements.map(e=>e.type));assert.ok(types.includes('band'));assert.ok(types.includes('surface'));assert.ok(types.includes('box'));assert.deepEqual(data,before);
});
