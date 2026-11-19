import {validateClient} from './clients.js';import {validateTemplate} from './templates.js';import {validatePersonalCollection} from './personal-collections.js';import {uid} from './core.js';
export function validateLibrary(value){
  if(!value||value.version!==1||value.type!=='cartelas-library'||typeof value.id!=='string'||!value.id||value.id.length>100||!Number.isFinite(Date.parse(value.updatedAt)))throw new Error('Biblioteca inválida.');
  const result={version:1,type:'cartelas-library',id:value.id,name:'Biblioteca de clientes e templates',updatedAt:value.updatedAt};
  for(const [key,validate,max] of [['clients',validateClient,200],['templates',validateTemplate,200],['collections',validatePersonalCollection,100]]){if(!Array.isArray(value[key])||value[key].length>max)throw new Error('Biblioteca excede o limite de itens.');result[key]=value[key].map(item=>structuredClone(validate(item)));if(new Set(result[key].map(i=>i.id)).size!==result[key].length)throw new Error('Identificadores repetidos na biblioteca.');}
  return result;
}
export function mergeLibrary(existing,incoming){
  const result={},counts={};const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;const signature=({id,createdAt,updatedAt,...item})=>JSON.stringify(canonical(item));
  for(const key of ['clients','templates','collections']){const items=structuredClone(existing[key]),known=new Set(items.map(signature)),ids=new Set(items.map(i=>i.id));counts[key]=0;for(const item of incoming[key]){const fingerprint=signature(item);if(known.has(fingerprint))continue;const copy=structuredClone(item);if(ids.has(copy.id))copy.id=uid();items.push(copy);ids.add(copy.id);known.add(fingerprint);counts[key]++;}result[key]=items;}
  return {items:result,counts};
}
