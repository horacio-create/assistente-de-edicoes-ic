const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const colors={amarelo:'#facc15',amarela:'#facc15',preto:'#000000',preta:'#000000',branco:'#ffffff',branca:'#ffffff',azul:'#2563eb',verde:'#16a34a',vermelho:'#dc2626',vermelha:'#dc2626',rosa:'#ec4899',roxo:'#9333ea',roxa:'#9333ea',laranja:'#f97316',bege:'#e7d8bf',cinza:'#737373'};
export function readVisualDirection(instructions,raw=''){
  const notes=[],values={},conflicts=new Set();
  const assign=(key,value)=>{if(values[key]&&values[key]!==value)conflicts.add(key);values[key]=value;};
  const lines=raw.split('\n'),directives=lines.filter(l=>/^\s*(?:visual|aparencia|direcao visual)\s*:/i.test(normalize(l)));
  const source=[instructions,...directives].join('\n');
  for(const part of normalize(source).split(/[+;\n]|,(?!\d)/)){
    if(/\b(?:nao|sem)\b/.test(part)){if(/fundo|texto|foto|titulo/.test(part))notes.push('Instrução com negação: confira manualmente.');continue;}
    const colorPattern='(#[0-9a-f]{6}\\b|'+Object.keys(colors).join('|')+')\\b';
    for(const [key,pattern] of [['background','(?:fundo|cartela)'],['textColor','(?:textos?|letras?)']]){
      const match=part.match(new RegExp('\\b'+pattern+'\\s+(?:(?:na cor|de cor|cor|em)\\s+)?'+colorPattern));
      if(match)assign(key,colors[match[1]]||match[1]);
    }
    const photo=part.match(/\bfoto\s+(?:\d+\s+)?(?:a |na |do lado )?(esquerda|direita)\b/);if(photo)assign('photoSide',photo[1]==='esquerda'?'left':'right');
    const title=part.match(/\btitulo\s+(grande|maior|pequeno|menor)\b/);if(title)assign('titleSize',/grande|maior/.test(title[1])?'large':'small');
  }
  for(const key of conflicts){delete values[key];notes.push('Pedidos conflitantes para '+({background:'o fundo',textColor:'a cor dos textos',photoSide:'a posição da foto',titleSize:'o tamanho do título'}[key])+'. Escolha manualmente.');}
  if(directives.length&&!Object.keys(values).length&&!notes.length)notes.push('Direção visual preservada; ajuste manualmente os detalhes não reconhecidos.');
  return {values,notes,content:lines.filter(l=>!directives.includes(l)).join('\n').trim()};
}
export function validateVisualDirection(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['background','textColor','photoSide','titleSize'].includes(k)))throw Error('Direção visual inválida.');
  for(const key of ['background','textColor'])if(value[key]!==undefined&&!/^#[0-9a-f]{6}$/i.test(value[key]))throw Error('Cor da direção visual inválida.');
  if(value.photoSide!==undefined&&!['left','right'].includes(value.photoSide))throw Error('Posição da foto inválida.');
  if(value.titleSize!==undefined&&!['large','small'].includes(value.titleSize))throw Error('Tamanho do título inválido.');return value;
}
export function applyVisualDirection(card,value=card.visualDirection){
  if(!value)return [];validateVisualDirection(value);const notes=[];
  if(value.background){for(const l of card.layers.filter(l=>l.role==='background')){l.fill=value.background;delete l.colorToken;delete l.gradient;delete l.texture;}}
  if(value.textColor)for(const l of card.layers.filter(l=>l.type==='text')){l.fill=value.textColor;delete l.colorToken;}
  const photo=card.layers.find(l=>l.role==='photo');
  if(value.photoSide&&photo){
    const side=photo.x+photo.w/2<640?'left':'right';
    if(side!==value.photoSide){
      if(card.layers.some(l=>l.role==='qr'&&l.visible))notes.push('Foto: reposicione manualmente para preservar a área do QR.');
      else for(const l of card.layers.filter(l=>l.role!=='background'&&l.role!=='custom')){
        l.x=1280-l.x-l.w;
        // Directional shapes follow the mirror so diagonals and waves keep facing the content.
        if(l.corner)l.corner=l.corner[0]+(l.corner[1]==='l'?'r':'l');
        if(l.edge==='left'||l.edge==='right')l.edge=l.edge==='left'?'right':'left';
      }
    }
  }else if(value.photoSide)notes.push('Adicione uma foto para aplicar sua posição.');
  const title=card.layers.find(l=>l.role==='title');if(title&&value.titleSize)title.size=value.titleSize==='large'?80:42;
  card.visualDirection={...value};card.approved=false;return notes;
}
