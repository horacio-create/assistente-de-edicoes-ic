import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapText,fitCardTypography,textIssues} from '../public/render.js';
import {previewCard} from '../public/design-presets.js';
import {buildServiceList,serviceItems} from '../public/service-list.js';
const ctx={measureText(text){const size=Number(this.font?.match(/([\d.]+)px/)?.[1]||10);return {width:text.length*size*.5,actualBoundingBoxAscent:size*.8};}};
const heading={text:'DRA. VICTORIA DA PONTE',font:'Arial',weight:'normal',size:20,w:165,lineHeight:1.12,role:'title'};
test('título evita última linha muito curta e preserva palavras e quebras manuais',()=>{
 const {lines}=wrapText(ctx,heading);assert.deepEqual(lines,['DRA. VICTORIA','DA PONTE']);assert.equal(lines.join(' '),heading.text);
 assert.deepEqual(wrapText(ctx,{...heading,text:'DRA. VICTORIA DA\nPONTE'}).lines,['DRA. VICTORIA DA','PONTE']);
 assert.deepEqual(wrapText(ctx,{...heading,role:'body'}).lines,['DRA. VICTORIA DA','PONTE']);
 assert.equal(wrapText(ctx,{...heading,text:'PALAVRAMUITOLONGAPARAACAIXA'}).tooWide,true);
});
test('serviço em duas linhas usa a altura inteira, alinha com ícone e não deriva ao ajustar novamente',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>ctx})};
 try{
  const c=previewCard('lumina','services'),items=serviceItems(c);items[0].text=items[0].raw='Tratamento facial com acompanhamento personalizado';
  buildServiceList(c,{primary:'#7a6240',accent:'#d3bea0',background:'#f6f3ed'},items);fitCardTypography(c);
  const row=c.layers.find(l=>l.role==='serviceText'),icon=c.layers.find(l=>l.role==='serviceIcon'&&l.serviceId===row.serviceId);
  assert.equal(wrapText(ctx,row).lines.length,2);assert.ok(row.size>=30);assert.equal(row.y+row.h/2,icon.y+icon.h/2);assert.deepEqual(textIssues(c),[]);
  const before=structuredClone(c.layers);fitCardTypography(c);assert.deepEqual(c.layers,before);
 }finally{globalThis.document=previous;}
});
