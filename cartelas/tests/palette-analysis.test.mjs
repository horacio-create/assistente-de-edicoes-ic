import test from 'node:test';import assert from 'node:assert/strict';
import {dominantColors} from '../public/palette-analysis.js';
const pixels=colors=>({width:colors.length,height:1,data:Uint8ClampedArray.from(colors.flat())});
test('encontra cores por frequência sem alterar a imagem e ignora transparência',()=>{
 const image=pixels([[201,168,106,255],[201,168,106,255],[245,241,234,255],[98,88,80,255],[0,0,0,0],[255,0,0,128]]),before=image.data.slice();
 const found=dominantColors(image);assert.equal(found.length,3);assert.deepEqual(found[0],{hex:'#c9a86a',share:.5});assert.deepEqual(image.data,before);assert.equal(found.reduce((sum,c)=>sum+c.share,0),1);
});
test('agrupa pequenas variações sem perder a cor de destaque do logo',()=>{
 const image=pixels([...Array.from({length:100},(_,i)=>[244+i%3,240+i%3,233+i%3,255]),...Array.from({length:20},(_,i)=>[200+i%3,167+i%3,105+i%3,255])]);
 const found=dominantColors(image);assert.equal(found.length,2);assert.ok(found[0].share>.8);assert.ok(found[1].share>.16);assert.deepEqual(dominantColors(image),found);
});
test('imagem vazia de cor e imagem de uma cor não recebem cores inventadas',()=>{
 assert.deepEqual(dominantColors(pixels([[0,0,0,0],[50,60,70,0]])),[]);
 assert.deepEqual(dominantColors(pixels([[98,88,80,255]])),[{hex:'#625850',share:1}]);
});
test('limita sugestões, amostragem e dimensões recebidas',()=>{
 const image=pixels([[255,0,0,255],[0,255,0,255],[0,0,255,255]]);assert.equal(dominantColors(image,2).length,2);
 assert.throws(()=>dominantColors(image,0));assert.throws(()=>dominantColors({...image,height:2}));assert.throws(()=>dominantColors({width:32000001,height:1,data:[]}));
 const large={width:512,height:512,data:new Uint8ClampedArray(512*512*4).fill(255)};assert.deepEqual(dominantColors(large),[{hex:'#ffffff',share:1}]);
});
