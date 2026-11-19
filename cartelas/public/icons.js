import {TABLER_ICONS} from './vendor/tabler/catalog.js';
// Local 24-unit catalog: Tabler (MIT) plus specialist aesthetic drawings.
export const ICONS={
  whatsapp:{name:'WhatsApp',group:'Contato',paths:['M5 19L2 22L3 16A10 10 0 1 1 5 19 Z','M8 6L10 9L9 11Q10 14 13 15L15 14L18 16Q17 20 13 18Q6 15 6 9Q6 7 8 6 Z']},
  graduation:{name:'Formação',group:'Educação',paths:['M2 8L12 3L22 8L12 13 Z M6 10v7q6 5 12 0v-7 M22 8v9']},
  palette:{name:'Artes',group:'Educação',paths:['M12 2Q2 2 2 12q0 10 10 10q4 0 3-4q-1-3 3-3q6 0 4-6Q20 2 12 2 Z','M7 8h.1 M12 6h.1 M17 8h.1 M6 13h.1']},
  ball:{name:'Esportes',group:'Educação',paths:['M22 12a10 10 0 1 0-20 0a10 10 0 1 0 20 0 M12 2v20 M2 12h20 M5 5q14 7 14 14 M19 5Q5 12 5 19']},
  music:{name:'Música',group:'Educação',paths:['M9 17V5L21 2v12 M9 8l12-3 M9 17q0 5-5 5q-5-2 0-5 Z M21 14q0 5-5 5q-5-2 0-5 Z']},
  robot:{name:'Robótica',group:'Educação',paths:['M5 7h14q2 0 2 2v10H3V9q0-2 2-2 Z M12 3v4 M10 2h4 M7 12h1 M16 12h1 M8 16h8 M1 11v5 M23 11v5']},
  truck:{name:'Entrega',group:'Serviços',paths:['M2 5h13v12H2 Z M15 9h4l3 5v3h-7 M9 18a3 3 0 1 0-6 0a3 3 0 1 0 6 0 M22 18a3 3 0 1 0-6 0a3 3 0 1 0 6 0']},
  face:{name:'Rosto',group:'Estética',paths:['M8 3 Q12 1 16 3 Q19 6 18 12 Q18 18 12 21 Q6 18 6 12 Q5 6 8 3 Z','M8 10h2 M14 10h2 M12 11v3h-1 M9 16q3 2 6 0']},
  profile:{name:'Perfil facial',group:'Estética',paths:['M8 21v-4 Q4 14 5 8 Q6 2 13 3 Q18 4 18 8 L21 12 L18 13 L18 16 Q17 18 13 18 L13 21','M15 9h2 M16 15h2']},
  lips:{name:'Lábios',group:'Estética',paths:['M2 12 Q7 5 10 8 Q12 10 14 8 Q17 5 22 12 Q18 18 12 18 Q6 18 2 12 Z','M2 12 Q7 10 12 12 Q17 10 22 12']},
  nose:{name:'Nariz',group:'Estética',paths:['M10 3 Q10 9 7 13 Q4 18 9 20 M14 3 Q14 9 17 13 Q20 18 15 20','M9 17q3-3 6 0 M10 20q2 1 4 0']},
  syringe:{name:'Seringa',group:'Estética',paths:['M5 18L17 6 L20 9 L8 21 Z M3 21L5 19 M16 3L22 9 M18 5L20 3 M9 14L11 16 M12 11L14 13']},
  molecule:{name:'Molécula',group:'Estética',paths:['M8 6a3 3 0 1 0-6 0a3 3 0 1 0 6 0 M22 5a3 3 0 1 0-6 0a3 3 0 1 0 6 0 M15 13a3 3 0 1 0-6 0a3 3 0 1 0 6 0 M23 21a3 3 0 1 0-6 0a3 3 0 1 0 6 0','M7 8L10 11 M17 7L14 11 M14 15L18 19']},
  sparkle:{name:'Brilho',group:'Estética',paths:['M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9 Z M20 2v4 M18 4h4']},
  heart:{name:'Coração',group:'Geral',paths:['M12 21L3 12 Q-1 5 5 3 Q10 2 12 7 Q14 2 19 3 Q25 5 21 12 Z']},
  check:{name:'Conferido',group:'Geral',paths:['M3 12L9 18L21 5']},
  phone:{name:'Telefone',group:'Contato',paths:['M5 2L9 7L7 10 Q9 15 14 17 L17 15L22 19 Q20 24 15 21 Q4 17 2 6 Q1 3 5 2 Z']},
  location:{name:'Localização',group:'Contato',paths:['M12 22 Q3 13 4 8 Q5 2 12 2 Q19 2 20 8 Q21 13 12 22 Z','M15 9a3 3 0 1 0-6 0a3 3 0 1 0 6 0']},
  calendar:{name:'Agenda',group:'Contato',paths:['M3 5h18v16H3 Z M7 2v6 M17 2v6 M3 10h18 M7 14h2 M12 14h2 M17 14h1 M7 18h2 M12 18h2']},
  chat:{name:'Conversa',group:'Contato',paths:['M3 3h18v14H9L3 22 Z M7 8h10 M7 12h7']},
  camera:{name:'Instagram',group:'Contato',paths:['M6 2h12q4 0 4 4v12q0 4-4 4H6q-4 0-4-4V6q0-4 4-4 Z','M17 12a5 5 0 1 0-10 0a5 5 0 1 0 10 0 M18 6h.1']},
  book:{name:'Livro',group:'Serviços',paths:['M12 5Q7 1 2 3v16q5-2 10 2q5-4 10-2V3q-5-2-10 2 Z M12 5v16 M5 7l4 1 M5 11l4 1 M15 8l4-1 M15 12l4-1']},
  food:{name:'Alimentação',group:'Serviços',paths:['M4 2v7q0 3 3 3q3 0 3-3V2 M7 2v20 M17 2q-4 7 0 12h3V2 Z M20 14v8']},
  bag:{name:'Compras',group:'Serviços',paths:['M4 7h16l2 15H2 Z M8 8V5q0-6 8 0v3']},
  star:{name:'Destaque',group:'Geral',paths:['M12 2L15 9L22 10L17 15L18 22L12 18L6 22L7 15L2 10L9 9 Z']},
  briefcase:{name:'Profissional',group:'Serviços',paths:['M2 7h20v14H2 Z M8 7V3h8v4 M2 12q10 5 20 0 M10 12h4v5h-4 Z']},
  tooth:{name:'Odontologia',group:'Estética',paths:['M12 4 Q7 0 4 4 Q1 8 5 15 Q6 23 9 22 Q10 14 12 14 Q14 14 15 22 Q18 23 19 15 Q23 8 20 4 Q17 0 12 4 Z']}
};
Object.assign(ICONS,{bowl:{name:'Pratos e refeições',group:'Alimentação',paths:[]},meat:{name:'Carnes e grelhados',group:'Alimentação',paths:[]},cake:{name:'Sobremesas',group:'Alimentação',paths:[]},coffee:{name:'Café e bebidas quentes',group:'Alimentação',paths:[]}});
for(const [id,source] of Object.entries(TABLER_ICONS))if(id!=='face')ICONS[id].paths=source.outline;
// Specialist symbols retain their meaning and receive smoother, less angular curves.
ICONS.face.paths=['M12 2.5C7.5 2.5 5.5 5.5 5.8 10.5L6.4 15C7 18.4 9.8 21.5 12 21.5S17 18.4 17.6 15L18.2 10.5C18.5 5.5 16.5 2.5 12 2.5Z','M8.1 9.4Q9.2 8.8 10.3 9.4M13.7 9.4Q14.8 8.8 15.9 9.4M8.6 11H10M14 11H15.4M12 11L11.3 14.4Q12 15 12.8 14.5M10 17Q12 18.3 14 17'];
ICONS.profile.paths=['M8 21V17.8C5.2 15.9 4.1 13.4 4.5 9.1C4.9 4.6 8.6 2.1 12.7 2.8C16 3.3 17.5 5.8 17.3 8.7L20 12.4Q20.5 13.2 18 13.6L17.7 16.2Q17.6 18.1 13.8 18.2V21','M14.2 9.2Q15.1 8.8 16 9.2M15.8 15.6H17.5'];
ICONS.lips.paths=['M2.5 12C5.6 10.3 7.2 6.5 9.4 7.8L12 9.3L14.6 7.8C16.8 6.5 18.4 10.3 21.5 12C18.1 16.4 15.8 18.1 12 18.1S5.9 16.4 2.5 12Z','M2.5 12Q6.2 10.8 9.1 11.8Q12 13.4 14.9 11.8Q17.8 10.8 21.5 12'];
ICONS.nose.paths=['M10.2 2.5C10.4 6.6 9.6 9.8 7.5 12.3C5.7 14.5 5.6 16.6 7.2 17.9Q8.4 18.9 9.7 18.2','M14 2.5C13.9 7.8 14.7 10.7 16.9 13.4Q19 16.4 16.4 18.3','M9.5 16.7Q12 14.7 14.4 16.7M10.5 19.2Q12.1 20.1 13.8 19.2'];
export function suggestIcon(text){
  const s=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/whatsapp|\bzap\b|wa\.me/.test(s))return 'whatsapp';
  if(/\b(?:baiao|arroz|feijao|feijoada|risoto|sopa|salada|refeicao|refeicoes)\b/.test(s))return 'bowl';
  if(/\b(?:carne|carnes|churrasco|grelhado|grelhados|picanha|bife|costela)\b/.test(s))return 'meat';
  if(/\b(?:sobremesa|sobremesas|bolo|bolos|torta|tortas|pudim|doces)\b/.test(s))return 'cake';
  if(/\b(?:cafe|cafes|cappuccino|cafeteria|cha)\b/.test(s))return 'coffee';
  for(const [pattern,id] of [[/robot|tecnolog|programac/,'robot'],[/musica|canto|instrumento/,'music'],[/esport|futebol|atividade fisica/,'ball'],[/artes|pintura|expressao/,'palette'],[/educac|matricul|pedagog|aprendizagem/,'graduation'],[/ingles|lingua|idioma/,'book'],[/entrega|delivery|frete/,'truck'],[/massa|prato|sobremesa|refeic|cozinha/,'food'],[/tinta|ferramenta|eletric|iluminac|construc/,'bag']])if(pattern.test(s))return id;
  for(const [pattern,id] of [[/labial|labios/,'lips'],[/rino|nariz/,'nose'],[/toxina|botulin|injec/,'syringe'],[/bioestimul|colageno/,'molecule'],[/contorno/,'profile'],[/facial|full face|preenchimento/,'face'],[/odont|dent/,'tooth'],[/telefone|\(\d{2}\)/,'phone'],[/@|instagram/,'camera'],[/enderec|localiz/,'location'],[/agenda|consulta/,'calendar'],[/curso|ensino|formac/,'book'],[/pizza|sabor|alimento|cardapio/,'food'],[/produto|oferta|compra/,'bag']])if(pattern.test(s))return id;
  return 'sparkle';
}
export function iconLayer(icon='sparkle',x=100,y=300,size=64,fill='#624d46'){
  return {id:globalThis.crypto.randomUUID(),type:'icon',role:'custom',name:ICONS[icon]?.name||'Ícone',icon,x,y,w:size,h:size,fill,strokeWidth:1.3,opacity:1,visible:true,locked:false};
}
// Compound paths leave transparent counters rather than painting white on top.
export const SOLID_ICONS={
  whatsapp:'M5 19L2 22L3 16A10 10 0 1 1 5 19Z M8 6L10 9L9 11Q10 14 13 15L15 14L18 16Q17 20 13 18Q6 15 6 9Q6 7 8 6Z',
  camera:'M6 2H18Q22 2 22 6V18Q22 22 18 22H6Q2 22 2 18V6Q2 2 6 2Z M17 12A5 5 0 1 0 7 12A5 5 0 1 0 17 12Z M15 12A3 3 0 1 0 9 12A3 3 0 1 0 15 12Z M19 6A1 1 0 1 0 17 6A1 1 0 1 0 19 6Z',
  phone:ICONS.phone.paths[0],
  location:ICONS.location.paths.join(' '),
  chat:'M3 3H21V17H9L3 22Z M7 7H17V9H7Z M7 11H14V13H7Z',
  calendar:'M3 5H6V2H8V5H16V2H18V5H21V21H3Z M5 10H19V12H5Z M6 15H9V18H6Z M11 15H14V18H11Z M16 15H18V18H16Z',
  heart:ICONS.heart.paths[0],star:ICONS.star.paths[0],tooth:ICONS.tooth.paths[0],
  bag:'M4 7H7V5Q7 0 12 0Q17 0 17 5V7H20L22 22H2Z M9 7H15V5Q15 2 12 2Q9 2 9 5Z'
};
export const SOLID_FILL_RULE={};
for(const [id,source] of Object.entries(TABLER_ICONS))if(id!=='face'&&source.filled){SOLID_ICONS[id]=source.filled.join(' ');SOLID_FILL_RULE[id]=source.fillRule;}
export function validateIconAppearance(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.variant!==undefined&&!['outline','solid'].includes(value.variant)||['color','badgeColor'].some(k=>value[k]!==undefined&&!/^#[0-9a-f]{6}$/i.test(value[k]))||value.badgeOpacity!==undefined&&(!Number.isFinite(value.badgeOpacity)||value.badgeOpacity<0||value.badgeOpacity>1))throw new Error('Aparência do ícone inválida.');
  return Object.fromEntries(['variant','color','badgeColor','badgeOpacity'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
}
export function iconSvg(id,variant='outline'){
  if(variant==='solid'&&SOLID_ICONS[id])return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" fill-rule="${SOLID_FILL_RULE[id]||'evenodd'}"><path d="${SOLID_ICONS[id]}"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${ICONS[id].paths.map(d=>`<path d="${d}"/>`).join('')}</svg>`;
}
