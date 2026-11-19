import {mergeFonts} from './fonts.js';
import {captureTemplate,validateTemplate,applyTemplate} from './templates.js';
import {uid,THEMES,validateProject} from './core.js';
import {fitCardTypography} from './render.js';

export function validatePersonalCollection(value){
  if(!value||value.version!==1||value.type!=='cartelas-collection'||typeof value.id!=='string'||!value.id||typeof value.name!=='string'||!value.name.trim()||value.name.length>120||!THEMES[value.theme]||!Array.isArray(value.templates)||!value.templates.length||value.templates.length>20)throw new Error('Coleção inválida. Use um arquivo .colecao.json exportado pelo aplicativo.');
  const templates=value.templates.map(t=>validateTemplate({...t,fonts:value.fonts||t.fonts||[]})),fontRecords=templates.reduce((all,t)=>mergeFonts(all,t.fonts),[]),palette={...templates[0].palette};
  return {version:1,type:'cartelas-collection',id:value.id,name:value.name.trim(),theme:value.theme,palette,fonts:fontRecords,templates:templates.map(({fonts,...t})=>t)};
}
export function capturePersonalCollection(project,name){
  if(!project.cards.length)throw new Error('Organize e ajuste as cartelas antes de salvar uma coleção.');
  const names={intro:'Abertura',services:'Serviços',contact:'Contato'};
  return validatePersonalCollection({version:1,type:'cartelas-collection',id:uid(),name,theme:project.theme,templates:project.cards.map((card,i)=>captureTemplate(project,card,`${names[card.kind]} ${i+1}`))});
}
export function applyPersonalCollection(project,source,{keepIdentity=true,fitText=true}={}){
  const collection=validatePersonalCollection(source);
  if(!project.cards.length)throw new Error('Organize o roteiro antes de aplicar a coleção.');
  // Prepare all cards first: a failed layout must not partially change a VT.
  const draft={...project,cards:structuredClone(project.cards),palette:{...project.palette}};
  if(!keepIdentity){draft.palette={...collection.palette};draft.theme=collection.theme;}
  const occurrences={},unmatched=[];let applied=0;
  for(const card of draft.cards){
    const candidates=collection.templates.filter(t=>t.kind===card.kind).map(t=>({...t,fonts:collection.fonts}));
    if(!candidates.length){unmatched.push(card.label);continue;}
    const index=occurrences[card.kind]||0;occurrences[card.kind]=index+1;
    applyTemplate(draft,card,candidates[Math.min(index,candidates.length-1)],{keepIdentity});
    delete card.designCollection;
    if(fitText)fitCardTypography(card);applied++;
  }
  if(!applied)throw new Error('Esta coleção não tem layouts para os tipos de cartela do trabalho atual.');
  validateProject(draft);
  project.cards=draft.cards;project.palette=draft.palette;project.theme=draft.theme;project.fonts=draft.fonts||[];
  return {applied,unmatched};
}
