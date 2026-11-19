import test from 'node:test';
import assert from 'node:assert/strict';
import {recurringColors,normalizedCrop,referenceNotes} from '../public/reference-analysis.js';
test('recorrência prioriza cor compartilhada entre prints sem dar mais peso a uma foto grande',()=>{
 const samples=[{name:'um.png',colors:[{hex:'#c9a86a',share:.1},{hex:'#00ff00',share:.9}]},{name:'dois.png',colors:[{hex:'#c8a76a',share:.2},{hex:'#ffffff',share:.8}]},{name:'tres.png',colors:[{hex:'#caa96b',share:.15},{hex:'#000000',share:.85}]}];
 const before=structuredClone(samples),colors=recurringColors(samples);assert.equal(colors[0].hex,'#c9a86a');assert.equal(colors[0].count,3);assert.equal(colors[0].total,3);assert.deepEqual(colors[0].sources.map(s=>s.name),samples.map(s=>s.name));assert.deepEqual(samples,before);assert.deepEqual(recurringColors(samples),colors);
});
test('variações na mesma imagem não contam como várias referências; sem cores inventadas',()=>{
 const colors=recurringColors([{name:'repetida.png',colors:[{hex:'#c9a86a',share:.5},{hex:'#caa96b',share:.3}]}]);assert.equal(colors.length,1);assert.equal(colors[0].count,1);assert.equal(colors[0].share,.8);assert.deepEqual(recurringColors([{name:'transparente',colors:[]}]),[]);
 assert.throws(()=>recurringColors([]));assert.throws(()=>recurringColors(Array(37).fill({name:'x',colors:[]})));assert.throws(()=>recurringColors([{name:'x',colors:[{hex:'blue',share:1}]}]));assert.throws(()=>recurringColors([{name:'x',colors:[{hex:'#ffffff',share:NaN}]}]));
 assert.deepEqual(recurringColors([{name:'artefatos',colors:[{hex:'#ffffff',share:.009},{hex:'#000000',share:0}]}]),[]);
});
test('recorte aceita qualquer direção, limita às bordas e rejeita área pequena ou inválida',()=>{
 assert.deepEqual(normalizedCrop({x:.8,y:.9},{x:.2,y:.1}),{x:.2,y:.1,w:.6000000000000001,h:.8});assert.deepEqual(normalizedCrop({x:-1,y:-1},{x:2,y:2}),{x:0,y:0,w:1,h:1});assert.throws(()=>normalizedCrop({x:0,y:0},{x:.01,y:.4}));assert.throws(()=>normalizedCrop({x:NaN,y:0},{x:1,y:1}));assert.throws(()=>normalizedCrop({},{}));
});
test('observações registram proveniência e não apresentam tipografia como identificação automática',()=>{
 const samples=[{name:'post.png',colors:[{hex:'#123456',share:1}]}],colors=recurringColors(samples),notes=referenceNotes({samples,colors,profile:'https://www.instagram.com/exemplo/',observations:'Títulos em negrito'});assert.match(notes,/post.png/);assert.match(notes,/1 de 1/);assert.match(notes,/Tipografia não identificada automaticamente/);assert.match(notes,/Títulos em negrito/);assert.match(notes,/https:\/\/www.instagram.com\/exemplo\//);
});
