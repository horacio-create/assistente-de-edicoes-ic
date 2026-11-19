import {readVisualDirection,applyVisualDirection} from './visual-direction.js';
import {fitCardTypography} from './render.js';
import {splitServiceCards,serviceItems} from './service-list.js';
export function setupVisualDirection({getProject,getCard,change,notify}){
  const panel=document.createElement('details');panel.className='visual-request';panel.open=false;
  panel.innerHTML='<summary>Pedido visual desta cartela</summary><p class="hint">Confira o que foi identificado antes de aplicar. No roteiro, use uma linha “Visual: fundo amarelo; texto preto; foto à esquerda”.</p><p data-direction-status class="hint" role="status"></p><div class="two-col"><label>Fundo<select data-direction="background"><option value="">Não alterar</option></select></label><label>Textos<select data-direction="textColor"><option value="">Não alterar</option></select></label><label>Foto<select data-direction="photoSide"><option value="">Não alterar</option><option value="left">À esquerda</option><option value="right">À direita</option></select></label><label>Título<select data-direction="titleSize"><option value="">Não alterar</option><option value="large">Grande</option><option value="small">Menor</option></select></label></div><button data-direction-apply class="button primary full">Aplicar pedido nesta cartela</button><button data-direction-release class="text-button">Liberar pedido para o próximo template</button><p data-direction-feedback class="hint" role="status"></p>';
  // Secondary tools come after the template gallery, collapsed; the request opens itself when the script has a visual instruction.
  const adaptPanel=document.createElement('details');adaptPanel.className='visual-request visual-adapt';
  adaptPanel.innerHTML='<summary>Adaptar conteúdo ao espaço</summary><button data-adapt class="button full">Adaptar conteúdo ao espaço</button><p class="hint">Aproveita áreas livres antes de reduzir a fonte. Listas com mais de seis serviços são divididas em cartelas de até quatro itens.</p>';
  document.getElementById('visual-tools').append(panel,adaptPanel);
  let last='';
  panel.querySelector('[data-direction-apply]').onclick=()=>{
    const card=getCard();if(!card)return;const value={};for(const input of panel.querySelectorAll('[data-direction]'))if(input.value)value[input.dataset.direction]=input.value;
    if(!Object.keys(value).length)return notify('Escolha uma instrução visual para aplicar.');
    const draft=structuredClone(card),notes=applyVisualDirection(draft,value);fitCardTypography(draft);
    change(()=>Object.assign(card,draft));panel.querySelector('[data-direction-feedback]').textContent=notes.join(' ')||'Pedido aplicado somente nesta cartela. Confira a prévia.';
  };
  panel.querySelector('[data-direction-release]').onclick=()=>{const card=getCard();if(!card?.visualDirection)return;change(()=>delete card.visualDirection);notify('Pedido liberado. A arte atual foi preservada; o próximo template poderá usar suas próprias configurações.');};
  adaptPanel.querySelector('[data-adapt]').onclick=()=>{try{
    const card=getCard();if(!card)return;const project=getProject(),draft={...project,cards:structuredClone(project.cards)},target=draft.cards.find(c=>c.id===card.id);
    const many=target.kind==='services'&&serviceItems(target).length>6;
    const affected=many?splitServiceCards(draft,target,4):[target];affected.forEach(fitCardTypography);
    change(()=>project.cards=draft.cards);notify(many?`Conteúdo distribuído em ${affected.length} cartelas. Confira a sequência; você pode desfazer.`:'Espaços e textos ajustados. Confira as pendências que ainda precisam de revisão.');
  }catch(error){notify(error.message);}};
  return {sync(){
    const card=getCard(),key=JSON.stringify([card?.id,card?.instructions,card?.rawContent,card?.visualDirection]);if(last===key)return;last=key;panel.hidden=adaptPanel.hidden=!card;if(!card)return;
    const found=readVisualDirection(card.instructions,card.rawContent),values=card.visualDirection||found.values;
    if(Object.keys(found.values).length&&!card.visualDirection)panel.open=true;
    for(const input of panel.querySelectorAll('[data-direction]')){
      if(['background','textColor'].includes(input.dataset.direction)){
        input.replaceChildren(new Option('Não alterar',''));
        for(const [label,color] of [['Amarelo','#facc15'],['Preto','#000000'],['Branco','#ffffff'],['Azul','#2563eb'],['Verde','#16a34a'],['Vermelho','#dc2626'],['Rosa','#ec4899'],['Roxo','#9333ea'],['Laranja','#f97316'],['Bege','#e7d8bf'],['Cinza','#737373']])input.add(new Option(label,color));
        const value=values[input.dataset.direction];if(value&&![...input.options].some(o=>o.value===value))input.add(new Option(value,value));
      }
      input.value=values[input.dataset.direction]||'';
    }
    panel.querySelector('[data-direction-status]').textContent=card.visualDirection?'Configurações aplicadas nesta cartela.':Object.keys(found.values).length?'Pedido identificado. Confira as escolhas abaixo.':'Nenhuma instrução visual simples identificada. Você pode escolher abaixo.';
    panel.querySelector('[data-direction-feedback]').textContent=found.notes.join(' ');
  }};
}
