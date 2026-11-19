import {contactItems,buildContactList,flattenContacts,contactPreset} from './contact-list.js';
import {ICONS,SOLID_ICONS,iconSvg} from './icons.js';
import {fitCardTypography} from './render.js';
import {readableColor} from './core.js';
export function setupContacts({getProject,getCard,change,notify}){
  const $=id=>document.getElementById(id),panel=$('contact-tools');
  panel.innerHTML='<h3>Contatos com ícones</h3><p class="hint">WhatsApp e Instagram ao lado das informações, com as cores do seu layout. Confira o canal sugerido para cada contato.</p><button id="contact-organize" class="button full">Organizar contatos com ícones</button><p id="contact-empty" class="hint"></p><div id="contact-controls" hidden><label class="check-label"><input id="contact-badges" type="checkbox"> Usar medalhões suaves</label><div id="contact-items"></div><button id="contact-plain" class="text-button">Voltar ao texto simples</button><p class="hint">Cada ícone e texto fica em uma camada separada. Reorganizar refaz os alinhamentos; Desfazer recupera o ajuste anterior.</p></div>';
  const presets=document.createElement('div');presets.className='contact-presets';presets.setAttribute('aria-label','Aparência de todos os contatos');
  presets.innerHTML=[['line','Linha'],['solid','Sólido'],['badge','Medalhão']].map(([id,label])=>`<button class="contact-preset" data-contact-preset="${id}" title="Aplicar ${label.toLowerCase()} a todos os contatos"><span class="contact-preset-preview ${id==='badge'?'with-badge':''}">${iconSvg('whatsapp',id==='solid'?'solid':'outline')}${iconSvg('camera',id==='solid'?'solid':'outline')}</span><span>${label}</span></button>`).join('');
  $('contact-controls').prepend(presets);
  const presetHint=document.createElement('p');presetHint.className='hint';presetHint.textContent='Escolha uma aparência para todos os contatos. As cores voltam à combinação do layout; depois personalize abaixo.';presets.after(presetHint);
  const emphasisLabel=document.createElement('label');emphasisLabel.innerHTML='Destaque dos contatos<select id="contact-emphasis"><option value="regular">Equilibrado</option><option value="large">Grande</option><option value="extra">Máximo</option></select><small class="hint">Textos e ícones maiores. O telefone mantém destaque mesmo com um perfil longo.</small>';presetHint.after(emphasisLabel);
  function update(items,style=getCard()?.contactLayout||{badges:$('contact-badges').checked,separators:false,strokeWidth:1.4}){
    const c=getCard();if(!c)return;try{const draft=structuredClone(c);buildContactList(draft,getProject().palette,items,style);fitCardTypography(draft);change(()=>{c.layers=draft.layers;c.content=draft.content;c.contactLayout=draft.contactLayout;delete c.serviceLayout;});}catch(error){notify(error.message);}
  }
  $('contact-organize').onclick=()=>{if(getCard())update(contactItems(getCard()));};
  $('contact-emphasis').onchange=()=>{if(getCard()?.contactLayout)update(contactItems(getCard()),{...getCard().contactLayout,contactEmphasis:$('contact-emphasis').value});};
  presets.querySelectorAll('[data-contact-preset]').forEach(button=>button.onclick=()=>{const c=getCard();if(c){const {items,style}=contactPreset(c,getProject().palette,button.dataset.contactPreset);update(items,style);}});
  $('contact-badges').onchange=()=>{if(getCard()?.contactLayout)update(contactItems(getCard()),{...getCard().contactLayout,badges:$('contact-badges').checked});};
  $('contact-plain').onclick=()=>{const c=getCard();if(c)change(()=>{flattenContacts(c);delete c.contactLayout;});};
  function sync(){
    const c=getCard(),body=c?.layers.find(l=>l.role==='body');$('contact-organize').disabled=!body||c.kind!=='contact';$('contact-empty').textContent=!c||c.kind!=='contact'?'Selecione a cartela de contato nas miniaturas.':!body?'Adicione telefone e perfil no texto complementar.':!c.contactLayout?'Organize os contatos para acrescentar os símbolos.':'';
    $('contact-controls').hidden=!c?.contactLayout;if(!c?.contactLayout){$('contact-items').replaceChildren();return;}
    $('contact-badges').checked=c.contactLayout.badges;const items=contactItems(c),list=$('contact-items');list.replaceChildren();
    $('contact-emphasis').value=c.contactLayout.contactEmphasis||'large';
    const current=items.filter(item=>item.icon),palette=getProject().palette;
    presets.querySelectorAll('[data-contact-preset]').forEach(button=>{
      const id=button.dataset.contactPreset,selected=current.length>0&&(id==='badge'?c.contactLayout.badges&&current.every(item=>item.appearance?.variant!=='solid'&&item.appearance?.badgeOpacity===1):!c.contactLayout.badges&&current.every(item=>(item.appearance?.variant||'outline')===(id==='solid'?'solid':'outline')));
      button.setAttribute('aria-pressed',String(selected));button.style.color=palette.primary;
      if(id==='badge')for(const svg of button.querySelectorAll('svg')){svg.style.background=palette.accent;svg.style.color=readableColor(palette.accent);}
    });
    items.forEach((item,index)=>{
      const row=document.createElement('section');row.className='contact-item';
      const appearance=item.appearance||{},glyph=c.layers.find(l=>l.role==='contactIcon'&&l.serviceId===item.id),badge=c.layers.find(l=>l.role==='contactBadge'&&l.serviceId===item.id);
      const symbol=document.createElement('span');symbol.className='contact-item-symbol';if(item.icon)symbol.innerHTML=iconSvg(item.icon,appearance.variant);symbol.style.color=glyph?.fill||'#246c59';
      if(badge){symbol.style.background=badge.fill+Math.round(badge.opacity*255).toString(16).padStart(2,'0');symbol.style.borderRadius='50%';symbol.style.padding='5px';symbol.style.boxSizing='content-box';}
      const label=document.createElement('label');label.textContent='Informação '+(index+1);const text=document.createElement('input');text.value=item.text;text.maxLength=2000;text.dataset.contactText=index;text.onchange=()=>{const next=contactItems(getCard());next[index].text=text.value;next[index].raw=text.value;next[index].pending=false;update(next);};label.append(text);
      const iconLabel=document.createElement('label');iconLabel.textContent='Símbolo';const select=document.createElement('select');select.dataset.contactIcon=index;for(const id of [null,'whatsapp','phone','camera','location','chat']){const option=document.createElement('option');option.value=id||'';option.textContent=id?ICONS[id].name:'Sem ícone';select.append(option);}if(item.icon&&!['whatsapp','phone','camera','location','chat'].includes(item.icon)){const option=document.createElement('option');option.value=item.icon;option.textContent=ICONS[item.icon].name;select.append(option);}select.value=item.icon||'';select.onchange=()=>{const next=contactItems(getCard());next[index].icon=select.value||null;update(next);};iconLabel.append(select);
      row.append(symbol,label,iconLabel);list.append(row);
      if(item.icon){
        const setAppearance=patch=>{const next=contactItems(getCard());next[index].appearance={...next[index].appearance,...patch};for(const key of Object.keys(next[index].appearance))if(next[index].appearance[key]===undefined)delete next[index].appearance[key];update(next);};
        const variantLabel=document.createElement('label');variantLabel.textContent='Estilo do símbolo';const variant=document.createElement('select');variant.dataset.contactVariant=index;
        for(const [value,title] of [['outline','Traço fino'],...(SOLID_ICONS[item.icon]?[['solid','Preenchido']]:[])]){const option=document.createElement('option');option.value=value;option.textContent=title;variant.append(option);}variant.value=SOLID_ICONS[item.icon]?(appearance.variant||'outline'):'outline';variant.onchange=()=>setAppearance({variant:variant.value});variantLabel.append(variant);row.append(variantLabel);
        const colors=document.createElement('div');colors.className='two-col';
        const colorControl=(title,key,value)=>{const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type='color';input.value=value;input.dataset.contactColor=key+'-'+index;input.onchange=()=>setAppearance({[key]:input.value});label.append(input);colors.append(label);};
        colorControl('Cor do símbolo','color',glyph?.fill||'#246c59');
        if(c.contactLayout.badges)colorControl('Cor do medalhão','badgeColor',badge?.fill||getProject().palette.accent);
        row.append(colors);
        if(c.contactLayout.badges){const opacityLabel=document.createElement('label');opacityLabel.textContent='Intensidade do medalhão';const opacity=document.createElement('input');opacity.type='range';opacity.min=0;opacity.max=1;opacity.step=.01;opacity.value=badge?.opacity??.22;opacity.dataset.contactOpacity=index;opacity.onchange=()=>setAppearance({badgeOpacity:opacity.valueAsNumber});opacityLabel.append(opacity);row.append(opacityLabel);}
        const reset=document.createElement('button');reset.className='text-button';reset.textContent='Usar cores do layout';reset.dataset.contactReset=index;reset.onclick=()=>setAppearance({color:undefined,badgeColor:undefined,badgeOpacity:undefined});row.append(reset);
      }
    });
  }
  return {sync};
}
