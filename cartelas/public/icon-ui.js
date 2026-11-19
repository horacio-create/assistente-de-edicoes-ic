import {ICONS,iconSvg,iconLayer,suggestIcon} from './icons.js';
import {buildServiceList,serviceItems,flattenServices,splitServiceCards} from './service-list.js';
import {fitCardTypography} from './render.js';
export function setupIcons({getProject,getCard,change,notify,select}){
  const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  $('icon-grid').innerHTML=Object.entries(ICONS).map(([id,item])=>`<button class="icon-choice" data-add-icon="${id}" title="${esc(item.group)}"><span>${iconSvg(id)}</span><small>${esc(item.name)}</small></button>`).join('');
  document.querySelectorAll('[data-add-icon]').forEach(b=>b.onclick=()=>{if(!getCard())return notify('Selecione uma cartela.');if(getCard().layers.length>=100)return notify('Limite de 100 camadas por cartela.');const l=iconLayer(b.dataset.addIcon,100,300,64,getProject().palette.primary);change(()=>{getCard().layers.push(l);select(l.id);});});
  $('add-icon').onclick=()=>{$('icon-library').open=true;$('icon-library').scrollIntoView({behavior:'smooth',block:'nearest'});};
  function update(items,style=getCard()?.serviceLayout||readStyle()){
    try{const c=getCard();if(!c)return;const draft=structuredClone(c);buildServiceList(draft,getProject().palette,items,style);fitCardTypography(draft);change(()=>{c.layers=draft.layers;c.serviceLayout=draft.serviceLayout;c.content=draft.content;});}catch(err){notify(err.message);}
  }
  const split=document.createElement('button');split.id='service-split';split.className='button';
  const splitHint=document.createElement('p');splitHint.className='hint';splitHint.id='service-density-hint';
  $('service-controls').prepend(splitHint,split);
  split.onclick=()=>{try{const p=getProject(),draft={...p,cards:structuredClone(p.cards)},card=draft.cards.find(c=>c.id===getCard().id);const cards=splitServiceCards(draft,card);cards.forEach(fitCardTypography);change(()=>p.cards=draft.cards);notify(`Lista distribuída em ${cards.length} cartelas, com até quatro serviços em cada uma. Confira as fotos; Desfazer recupera a lista anterior.`);}catch(err){notify(err.message);}};
  const readStyle=()=>({badges:$('service-badges').checked,separators:$('service-separators').checked,strokeWidth:$('service-stroke').valueAsNumber});
  $('convert-services').onclick=()=>{if(!getCard())return;update(serviceItems(getCard()),readStyle());};
  $('service-badges').onchange=$('service-separators').onchange=()=>{if(getCard()?.serviceLayout)update(serviceItems(getCard()),readStyle());};
  $('service-stroke').onchange=()=>{if(getCard()?.serviceLayout)update(serviceItems(getCard()),readStyle());};
  $('service-plain').onclick=()=>{const c=getCard();if(c)change(()=>{flattenServices(c);delete c.serviceLayout;});};
  $('service-suggest').onclick=()=>{if(getCard()?.serviceLayout)update(serviceItems(getCard()).map(i=>({...i,icon:suggestIcon(i.text)})));};
  $('service-add').onclick=()=>{const c=getCard();if(c)update([...serviceItems(c),{id:crypto.randomUUID(),text:'Novo serviço',raw:'Novo serviço',icon:'sparkle',pending:true}]);};
  function sync(){
    const c=getCard();$('add-icon').disabled=!c;$('convert-services').disabled=!c||!c.layers.some(l=>l.role==='body');
    $('service-controls').hidden=!c?.serviceLayout;
    if(!c?.serviceLayout){$('service-items').innerHTML='';return;}
    $('service-badges').checked=c.serviceLayout.badges;$('service-separators').checked=c.serviceLayout.separators;
    $('service-stroke').value=c.serviceLayout.strokeWidth;
    const items=serviceItems(c);split.hidden=c.kind!=='services'||items.length<=4;split.textContent=`Distribuir em ${Math.ceil(items.length/4)} cartelas`;splitHint.hidden=split.hidden;splitHint.textContent='Para dar mais destaque aos serviços, distribua a lista em cartelas com até quatro itens. Textos, ícones e materiais são preservados.';
    $('service-items').innerHTML=items.map((item,i)=>`<div class="service-item"><span class="service-item-symbol">${iconSvg(item.icon)}</span><label>Serviço ${i+1}<input data-service-text="${i}" maxlength="2000" value="${esc(item.text)}"></label><label>Ícone<select data-service-icon="${i}">${Object.entries(ICONS).map(([id,icon])=>`<option value="${id}" ${id===item.icon?'selected':''}>${esc(icon.name)}</option>`).join('')}</select></label><div class="properties-actions"><button class="text-button" data-service-up="${i}" aria-label="Subir serviço ${i+1}" ${i===0?'disabled':''}>↑</button><button class="text-button" data-service-down="${i}" aria-label="Descer serviço ${i+1}" ${i===items.length-1?'disabled':''}>↓</button><button class="text-button danger" data-service-remove="${i}">Remover item</button></div></div>`).join('');
    document.querySelectorAll('[data-service-text]').forEach(el=>el.onchange=()=>{const next=serviceItems(getCard());next[+el.dataset.serviceText].text=el.value;next[+el.dataset.serviceText].raw=el.value;next[+el.dataset.serviceText].pending=false;update(next);});
    document.querySelectorAll('[data-service-icon]').forEach(el=>el.onchange=()=>{const next=serviceItems(getCard());next[+el.dataset.serviceIcon].icon=el.value;update(next);});
    document.querySelectorAll('[data-service-remove]').forEach(el=>el.onclick=()=>{const next=serviceItems(getCard());next.splice(+el.dataset.serviceRemove,1);update(next);});
    const move=(i,delta)=>{const next=serviceItems(getCard()),j=i+delta;if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j],next[i]];update(next);};
    document.querySelectorAll('[data-service-up]').forEach(el=>el.onclick=()=>move(+el.dataset.serviceUp,-1));document.querySelectorAll('[data-service-down]').forEach(el=>el.onclick=()=>move(+el.dataset.serviceDown,1));
  }
  return {sync};
}
