export const BUILTIN_FONTS=['Arial','Georgia','Verdana','Trebuchet MS'];
const psFonts={Arial:['ArialMT','Arial-BoldMT'],Georgia:['Georgia','Georgia-Bold'],Verdana:['Verdana','Verdana-Bold'],'Trebuchet MS':['TrebuchetMS','TrebuchetMS-Bold']};
const loaded=new Map();
export function fontBytes(record){return Uint8Array.from(atob(record.data.split(',')[1]),c=>c.charCodeAt(0));}
export function inspectFont(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes.length>5*1024*1024)throw new Error('Fonte inválida ou maior que 5 MB.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),signature=view.getUint32(0),count=view.getUint16(4);
  if(![0x00010000,0x4f54544f].includes(signature)||count<1||count>256||12+count*16>bytes.length)throw new Error('Use uma fonte estática TTF ou OTF, não uma coleção ou fonte web.');
  const tables=new Map();for(let i=0;i<count;i++){const p=12+i*16,tag=String.fromCharCode(...bytes.slice(p,p+4)),offset=view.getUint32(p+8),length=view.getUint32(p+12);if(offset+length>bytes.length||tables.has(tag))throw new Error('Tabela inválida no arquivo de fonte.');tables.set(tag,{offset,length});}
  if(tables.has('fvar'))throw new Error('Fonte variável: importe uma versão estática Regular, Bold ou Italic.');
  const table=tables.get('name');if(!table||table.length<6||!tables.has('head')||!tables.has('cmap'))throw new Error('A fonte não contém os dados necessários.');
  const base=table.offset,n=view.getUint16(base+2),strings=view.getUint16(base+4);if(6+n*12>table.length||strings>table.length)throw new Error('Nomes inválidos na fonte.');
  const names=new Map();for(let i=0;i<n;i++){const p=base+6+i*12,platform=view.getUint16(p),language=view.getUint16(p+4),id=view.getUint16(p+6),len=view.getUint16(p+8),off=view.getUint16(p+10);if(strings+off+len>table.length)throw new Error('Nome fora dos limites da fonte.');if(![0,1,3].includes(platform))continue;
    const value=new TextDecoder(platform===1?'windows-1252':'utf-16be').decode(bytes.slice(base+strings+off,base+strings+off+len)).replace(/\0/g,'').trim(),score=(platform===3?4:platform===0?3:1)+(language===0x409?1:0);if(value.length<=160&&(!names.has(id)||names.get(id).score<score))names.set(id,{value,score});}
  const psName=names.get(6)?.value;if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(psName||''))throw new Error('Nome PostScript ausente ou inválido.');
  return {psName,label:names.get(4)?.value||psName,format:signature===0x4f54544f?'otf':'ttf'};
}
export function validateFonts(records=[]){
  if(!Array.isArray(records)||records.length>16)throw new Error('Use até 16 arquivos de fonte por trabalho.');const ids=new Set();let total=0;
  for(const r of records){if(!r||!/^font-[a-f0-9]{64}$/.test(r.id)||ids.has(r.id)||typeof r.name!=='string'||r.name.length>240||typeof r.data!=='string'||r.data.length>7*1024*1024||!/^data:font\/(ttf|otf);base64,[A-Za-z0-9+/=]+$/.test(r.data))throw new Error('Arquivo de fonte inválido na cópia.');ids.add(r.id);const bytes=fontBytes(r),parsed=inspectFont(bytes);if(r.psName!==parsed.psName||r.label!==parsed.label||r.format!==parsed.format||!r.data.startsWith(`data:font/${parsed.format};`))throw new Error('Metadados incompatíveis com a fonte.');total+=bytes.length;}
  if(total>20*1024*1024)throw new Error('As fontes excedem 20 MB de arquivos.');return records;
}
export function allowedFont(id,records=[]){return BUILTIN_FONTS.includes(id)||records.some(r=>r.id===id);}
export function mergeFonts(a=[],b=[]){const result=[...a];for(const r of b){const old=result.find(f=>f.id===r.id);if(old&&old.data!==r.data)throw new Error('Fontes com identificadores incompatíveis.');if(!old)result.push(r);}validateFonts(result);return result;}
export function fontChoices(records=[]){return [...BUILTIN_FONTS.map(id=>({id,label:id})),...records.map(r=>({id:r.id,label:r.label}))];}
export function postScriptFont(id,weight,records=[]){if(psFonts[id])return psFonts[id][weight==='bold'?1:0];const r=records.find(r=>r.id===id);if(!r)throw new Error('Fonte personalizada ausente. Importe o arquivo novamente.');return r.psName;}
export async function importFont(file){
  if(!/\.(ttf|otf)$/i.test(file.name)||file.size>5*1024*1024)throw new Error('Use TTF ou OTF estática de até 5 MB.');const bytes=new Uint8Array(await file.arrayBuffer()),info=inspectFont(bytes),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.slice(i,i+16384));return {id:'font-'+hash,name:file.name,...info,data:`data:font/${info.format};base64,${btoa(binary)}`};
}
export async function registerFonts(records=[]){
  const ready=records.every(r=>loaded.get(r.id)?.data===r.data);if(!ready)validateFonts(records);
  for(const r of records){
    if(loaded.has(r.id)&&loaded.get(r.id).data!==r.data)throw new Error('Identificador de fonte reutilizado com outro arquivo.');
    if(!loaded.has(r.id)){const promise=(async()=>{const bytes=fontBytes(r),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(r.id!=='font-'+hash)throw new Error('Identificador da fonte incompatível.');const face=await new FontFace(r.id,bytes,{weight:'normal',style:'normal'}).load();document.fonts.add(face);})().catch(error=>{loaded.delete(r.id);throw new Error('Não foi possível carregar '+r.label+': '+error.message);});loaded.set(r.id,{data:r.data,promise});}
    await loaded.get(r.id).promise;
  }
}
