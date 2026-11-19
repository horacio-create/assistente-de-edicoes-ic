export const FIELD_NAMES={clientName:'Nome do cliente',subtitle:'Área de atuação',services:'Serviços',cta:'Chamada',phone:'Telefone',profile:'Perfil',logo:'Logo',photos:'Fotos',qr:'QR Code'};
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const tidy=s=>s.trim().replace(/^["“']|["”']$/g,'').replace(/[.!;]+$/,'').trim();
const phones=s=>s.match(/(?:\+55\s*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}/g)||[];
export function withoutCorrectionLines(text){return (text||'').split(/\n|(?<=[.!])\s+(?=(?:troque|altere|corrija|atualize|substitua|retire|remova|exclua|inclua|adicione|não inclua)\b)/i).filter(raw=>{
  const line=raw.trim().replace(/^(?:corrigindo|corre[çc][aã]o|atualiza[çc][aã]o)\s*[:,-]\s*/i,'');
  if(/^(?:inclua|adicione) os (?:serviços|procedimentos|produtos)\b/i.test(line))return true;
  return !/^(?:troque|altere|corrija|atualize|substitua|retire|remova|exclua|inclua|adicione|acrescente|não inclua|nao inclua)\b/i.test(line);
}).join('\n');}
export function sourceOrigins(fields,sources){
  const origins={};for(const key of ['clientName','subtitle','services','cta','phone','profile']){
    const values=String(fields[key]||'').split('\n').filter(Boolean);origins[key]=[];
    for(const source of sources){const lines=(source.text||'').split('\n'),match=lines.find(line=>values.some(v=>key==='phone'?phones(line).some(p=>p.replace(/\D/g,'')===v.replace(/\D/g,'')):normalize(line).includes(normalize(v))));if(match)origins[key].push({sourceId:source.id||'',sourceName:source.name||'Fonte',excerpt:match.slice(0,280)});}
  }return origins;
}
export function applyCorrections(base,sources){
  const fields={...base},origins=sourceOrigins(fields,sources),corrections=[],warnings=[];
  for(const source of sources)for(const raw of (source.text||'').split(/\n|(?<=[.!])\s+(?=(?:troque|altere|corrija|atualize|substitua|retire|remova|exclua|inclua|adicione|não inclua)\b)/i)){
    const line=raw.trim().replace(/^(?:corrigindo|corre[çc][aã]o|atualiza[çc][aã]o)\s*[:,-]\s*/i,'');let field,action='replace',target,match;
    if(/^inclua os (?:serviços|procedimentos|produtos)\b/i.test(line))continue;
    if((match=line.match(/^(?:troque|altere|corrija|atualize|substitua)\s+(?:(?:o|a|esse|essa)\s+)?(telefone|whatsapp|perfil|instagram|chamada|frase|nome(?: do cliente)?|especialidade|área)(?:\s+.+?)?\s+(?:para|por)\s+(.+)$/i))){field=({telefone:'phone',whatsapp:'phone',perfil:'profile',instagram:'profile',chamada:'cta',frase:'cta',nome:'clientName','nome do cliente':'clientName',especialidade:'subtitle',area:'subtitle'})[normalize(match[1])];target=tidy(match[2]);}
    else if((match=line.match(/^(?:retire|remova|exclua|não inclua|nao inclua)\s+(?:(?:o|a)\s+)?(?:(?:serviço|servico|procedimento|produto)\s*[:=-]?\s*)?(.+)$/i))){field='services';action='remove';target=tidy(match[1]);}
    else if((match=line.match(/^(?:inclua|adicione|acrescente)\s+(?:(?:o|a)\s+)?(?:(?:serviço|servico|procedimento|produto)\s*[:=-]?\s*)?(.+)$/i))){field='services';action='add';target=tidy(match[1]);}
    else if((match=line.match(/^(?:troque|substitua)\s+(?:(?:o|a)\s+)?(?:serviço|servico|procedimento|produto)\s+(.+?)\s+(?:por|para)\s+(.+)$/i))){field='services';action='swap';target=[tidy(match[1]),tidy(match[2])];}
    else continue;
    if(corrections.length>=40){warnings.push('Há muitas correções. Divida o pedido para revisar todas.');continue;}
    const before=String(fields[field]||''),items=String(fields.services||'').split('\n').filter(Boolean);let valid=!/[?]/.test(line),next;
    if(field==='phone'){const values=phones(target);valid&&=values.length===1&&normalize(target.replace(values[0]||'',''))==='';next=values[0];}
    else if(field==='profile'){valid&&=/^@[A-Za-z0-9_.]+$/.test(target);next=target;}
    else if(field!=='services'){valid&&=!!target&&target.length<=({clientName:300,subtitle:500,cta:1000}[field]||1000);next=target;}
    else {
      const exact=value=>items.findIndex(item=>normalize(item.replace(/^[•●▪*-]\s*/,''))===normalize(value));
      if(action==='remove'){const index=exact(target);valid&&=index>=0;if(valid)items.splice(index,1);}
      if(action==='add'){valid&&=!!target&&target.length<=500&&!/[,;]|^(?:esse|essa|aquele|aquela|os|as)\b/i.test(target);if(valid&&exact(target)<0)items.push(target);}
      if(action==='swap'){const index=exact(target[0]);valid&&=index>=0&&!!target[1]&&target[1].length<=500&&!/[,;]/.test(target[1]);if(valid)items[index]=target[1];}
      next=items.join('\n');
    }
    const entry={field,action,status:valid?'applied':'pending',sourceId:source.id||'',sourceName:source.name||'Fonte',excerpt:raw.slice(0,1000),before:before.slice(0,1000),after:valid?String(next).slice(0,1000):before.slice(0,1000)};corrections.push(entry);
    if(valid){fields[field]=next;const origin={sourceId:entry.sourceId,sourceName:entry.sourceName,excerpt:entry.excerpt.slice(0,280)};if(field!=='services')origins[field]=[origin];else if(!origins.services.some(o=>o.sourceId===origin.sourceId))origins.services.push(origin);}
    else warnings.push(`Correção pendente em “${entry.sourceName}”: ${raw.slice(0,180)}. Informe o valor completo ou o nome exato do serviço.`);
  }
  return {fields,origins,corrections,warnings};
}
export function validateEvidence(draft){
  if(draft.stale!==undefined&&typeof draft.stale!=='boolean')throw new Error('Estado de revisão inválido.');
  if(draft.scriptNeedsUpdate!==undefined&&typeof draft.scriptNeedsUpdate!=='boolean')throw new Error('Estado do roteiro inválido.');
  if(draft.manualFields!==undefined&&(!Array.isArray(draft.manualFields)||draft.manualFields.length>6||draft.manualFields.some(k=>!['clientName','subtitle','services','cta','phone','profile'].includes(k))))throw new Error('Campos revisados inválidos.');
  const text=(s,max)=>typeof s==='string'&&s.length<=max;
  if(draft.origins!==undefined){if(!draft.origins||Array.isArray(draft.origins)||typeof draft.origins!=='object')throw new Error('Origens inválidas.');for(const [key,items] of Object.entries(draft.origins))if(!['clientName','subtitle','services','cta','phone','profile'].includes(key)||!Array.isArray(items)||items.length>20||items.some(i=>!i||!text(i.sourceId,100)||!text(i.sourceName,240)||!text(i.excerpt,280)))throw new Error('Origem de informação inválida.');}
  if(draft.corrections!==undefined&&(!Array.isArray(draft.corrections)||draft.corrections.length>40||draft.corrections.some(c=>!c||!Object.hasOwn(FIELD_NAMES,c.field)||!['replace','remove','add','swap'].includes(c.action)||!['applied','pending'].includes(c.status)||!text(c.sourceId,100)||!text(c.sourceName,240)||!text(c.excerpt,1000)||!text(c.before,1000)||!text(c.after,1000))))throw new Error('Histórico de correções inválido.');
}
