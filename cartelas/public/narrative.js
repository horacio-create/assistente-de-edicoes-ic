const plain=text=>text.replace(/\s+/g,' ').trim();
const normalized=text=>plain(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const standalone=new Set(['preenchimento facial','preenchimento labial','labial','toxina botulinica','bioestimuladores','limpeza de pele']);
export function narrativeInformation(source){
  const text=plain(source.text||''),fields={},warnings=[];
  const capture=pattern=>text.match(pattern)?.[1]?.trim().replace(/^[,;:\s]+|[,;:\s]+$/g,'')||'';
  fields.clientName=capture(/(?:aqui\s+[ée]\s+(?:da|do)|o nome (?:da empresa|da cl[ií]nica|do cliente) [ée])\s+([^.!?]{2,90})(?:[.!?]|$)/i);
  fields.subtitle=capture(/(?:a especialidade [ée]|(?:queremos|gostar[ií]amos de|precisamos de) um (?:v[ií]deo|vt) (?:sobre|de))\s+([^.!?]{2,100})(?:[.!?]|$)/i);
  fields.cta=capture(/(?:a frase(?: final)? [ée]|(?:chamada|slogan) [ée])\s*[,;:]?\s*([^.!?]{2,160})(?:[.!?]|$)/i);
  const list=capture(/(?:os (?:servi[çc]os|procedimentos|produtos) (?:s[aã]o|ser[aã]o)|(?:coloque|incluir|inclua) os (?:servi[çc]os|procedimentos|produtos))\s*[,;:]?\s*([^.!?]{2,1000})(?:[.!?]|$)/i);
  let items=list?list.split(/[,;]/).map(plain).filter(Boolean):[];
  if(items.length){
    const tail=items.at(-1),parts=tail.split(/\s+e\s+/i);
    // Only split the final conjunction in a comma enumeration when both
    // recognized labels are standalone. Compound unknown services stay intact.
    if(items.length>1&&parts.length===2&&parts.every(p=>standalone.has(normalized(p))))items.splice(-1,1,...parts);
    else if(/\s+e\s+/i.test(tail))warnings.push('Uma expressão de serviços contém “e”. Ela foi mantida junta; confira se representa um ou mais itens.');
  }
  fields.services=items.join('\n');
  return {fields,warnings};
}
export function sameInformation(a,b){return normalized(a)===normalized(b);}
