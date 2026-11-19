import {shapeLayer,textLayer,uid,readableColor,qrLayer} from './core.js';
import {applyTemplate} from './templates.js';
import {setFinish,setShadow,finishColors} from './finishes.js';
import {resolveSegment,adaptSectionHeading} from './segments.js';
import {applyVisualDirection} from './visual-direction.js';
import {REFERENCE_COLLECTIONS,REFERENCE_IDS,buildReferenceLayout} from './reference-collections.js';

export const COLLECTIONS=[
  {id:'serena',name:'Serena',sector:'Saúde e estética',tag:'Clínica contemporânea',description:'Retratos amplos, divisões suaves e tipografia limpa. Abertura editorial, serviços em uma grade clara e contatos com áreas próprias.',theme:'essential',palette:{primary:'#294c4a',accent:'#bdcdbf',background:'#f7f7f2',font:'Georgia'}},
  {id:'atelier',name:'Atelier',sector:'Saúde e estética',tag:'Elegância editorial',description:'Serifa expressiva, tons de areia e retrato em moldura. Respiro e delicadeza para profissionais e marcas pessoais.',theme:'editorial',palette:{primary:'#624d46',accent:'#ccb99e',background:'#f7f2ec',font:'Georgia'}},
  {id:'care',name:'Essencial',sector:'Saúde e serviços',tag:'Clareza e confiança',description:'Verde profundo, fotografia com cantos suaves e uma grade limpa. Informações organizadas sem competir com o retrato.',theme:'essential',palette:{primary:'#15575e',accent:'#a2d4c7',background:'#f2f8f5',font:'Arial'}},
  {id:'table',name:'À mesa',sector:'Alimentação',tag:'Produto protagonista',description:'Foto ampla, verde escuro e acento quente. Uma composição de impacto para produtos, cardápios e pedidos.',theme:'contrast',palette:{primary:'#233f31',accent:'#e7bc72',background:'#fcf5e9',font:'Georgia'}},
  {id:'bold',name:'Pulso',sector:'Varejo e ofertas',tag:'Impacto comercial',description:'Blocos assimétricos, títulos fortes e amarelo pontual. Destaque para a oferta com espaço protegido para a leitura.',theme:'contrast',palette:{primary:'#242b3a',accent:'#f3c33e',background:'#f7f8fb',font:'Arial'}},
  {id:'nocturne',name:'Noturno',sector:'Eventos e portfólio',tag:'Sofisticação em contraste',description:'Azul noturno, detalhes em dourado e tipografia editorial. Fotografia emoldurada e encerramento com presença.',theme:'contrast',palette:{primary:'#172c3c',accent:'#c9ae7d',background:'#172c3c',font:'Georgia'}},
  {id:'school',name:'Horizonte',sector:'Educação e institucional',tag:'Energia e organização',description:'Azul, amarelo e formas circulares. Títulos claros e espaço generoso para atividades, serviços e contato.',theme:'essential',palette:{primary:'#173e82',accent:'#f4ca47',background:'#f5f8fd',font:'Arial'}},
  {id:'lumina',name:'Lumina',sector:'Estética com ícones',tag:'Detalhes que diferenciam',description:'Medalhões com ícones de traço fino, separadores delicados, curvas de canto e molduras assimétricas. Inspirada na referência da Victoria.',theme:'editorial',palette:{primary:'#7a6240',accent:'#d3bea0',background:'#f6f3ed',font:'Georgia'}},
  ...REFERENCE_COLLECTIONS
];
const kindNames={intro:'Abertura',services:'Serviços',contact:'Contato'};
export function colorForToken(palette,token){
  const colors={primary:'#263028',accent:'#d9b991',background:'#ffffff',...palette};
  if(token?.startsWith('on')){const key=token.slice(2);return readableColor(colors[key[0].toLowerCase()+key.slice(1)]);}
  return colors[token];
}
export function contrastRatio(a,b){
  const luminance=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const values=[luminance(a),luminance(b)].sort((a,b)=>a-b);return (values[1]+.05)/(values[0]+.05);
}
export function protectTemplateContrast(card){
  const painted=[];
  for(const layer of card.layers){
    if(!layer.visible)continue;
    if(layer.type==='shape'&&layer.form!=='ellipse'&&layer.opacity===1)painted.push(layer);
    if(layer.type==='text'&&layer.colorToken){
      const background=painted.findLast(s=>s.x<=layer.x&&s.y<=layer.y&&s.x+s.w>=layer.x+layer.w&&s.y+s.h>=layer.y+layer.h);
      if(background&&finishColors(background).some(color=>contrastRatio(layer.fill,color)<4.5)){
        const choices=['#202821','#ffffff'];layer.fill=choices.sort((a,b)=>Math.min(...finishColors(background).map(c=>contrastRatio(b,c)))-Math.min(...finishColors(background).map(c=>contrastRatio(a,c))))[0];
      }
    }
  }
  return card;
}
export function presetTemplate(id,kind,{hasPhoto=true,hasQr=false,hasLogo=true,photoAspect=0}={}){
  const collection=COLLECTIONS.find(c=>c.id===id);if(!collection)throw new Error('Coleção de layouts indisponível.');
  const p=collection.palette,layers=[];
  const shape=(name,x,y,w,h,token,extra={})=>{const l=shapeLayer(name,x,y,w,h,colorForToken(p,token),{colorToken:token,...extra});layers.push(l);return l;};
  const text=(role,x,y,w,h,size,token,font=p.font,weight='normal',lineHeight=1.12)=>{const l=textLayer(role==='title'?'Título':'Texto complementar',role==='title'?'Título da cartela':'Texto complementar',x,y,w,h,size,colorForToken(p,token),font,weight);Object.assign(l,{role,lineHeight,colorToken:token});layers.push(l);return l;};
  const image=(role,x,y,w,h,radius=0)=>{const l={id:uid(),type:'image',role,name:role==='logo'?'Logo':'Foto',x,y,w,h,radius,assetId:null,fit:role==='logo'?'contain':'cover',zoom:1,offsetX:0,offsetY:0,opacity:1,visible:true,locked:false};layers.push(l);return l;};
  const logo=(x=80,y=54)=>{const base=shape('Base de proteção do logo',x-12,y-10,254,88,'background',{radius:10,role:'logoBase'});base.fill='#ffffff';delete base.colorToken;image('logo',x,y,230,68);};
  const contact=kind==='contact',services=kind==='services',photo=hasPhoto&&!contact;
  shape('Fundo',0,0,1280,720,'background',{role:'background',locked:true});
  const reference=REFERENCE_IDS.includes(id);
  if(reference)buildReferenceLayout(id,{shape,text,image,logo},{kind,hasPhoto,hasQr,hasLogo});
  else if(id==='serena'){
    shape('Linha de base',72,662,1136,1,'accent');
    if(contact){
      const x=hasPhoto?508:80,w=hasPhoto?412:hasQr?740:1080;
      if(hasPhoto){shape('Moldura Serena',64,64,384,570,'accent',{corners:[88,12,12,12]});const frame=image('photo',76,76,360,546);frame.corners=[76,6,6,6];}
      if(hasLogo)image('logo',x,70,w,96);
      text('title',x,232,w,188,56,'primary');
      shape('Traço de encerramento',x,456,64,3,'primary');
      text('body',x,502,w,132,29,'onBackground','Arial','bold',1.25);
      if(hasQr)shape('Área de proteção do QR',952,374,284,284,'background',{radius:16});
    }else if(services){
      const w=photo?680:hasQr?740:1112;
      if(hasLogo)image('logo',80,60,230,84);
      shape('Marcador de seção',80,179,38,3,'primary');
      text('title',80,204,w,104,46,'primary');
      text('body',80,346,w,282,30,'onBackground','Arial','normal',1.25);
      if(photo){shape('Moldura Serena',824,64,384,570,'accent',{corners:[12,88,12,12]});const frame=image('photo',836,76,360,546);frame.corners=[6,76,6,6];}
    }else{
      if(photo){shape('Painel do retrato',0,0,508,720,'accent');const frame=image('photo',40,40,428,640);frame.corners=[12,100,12,12];}
      const x=photo?570:80,w=photo?630:1100;
      if(hasLogo)image('logo',x,78,280,110);
      shape('Marcador editorial',x,242,54,3,'primary');
      text('title',x,284,w,218,60,'primary');
      text('body',x,550,w,84,26,'onBackground','Arial','normal',1.25);
    }
  }else if(id==='lumina'){
    shape('Curva dourada superior',services?1070:0,0,210,218,'accent',{form:'cornerSweep',corner:services?'tr':'tl',opacity:.7});
    shape('Curva suave superior',services?1074:0,0,206,214,'background',{form:'cornerSweep',corner:services?'tr':'tl',opacity:.82});
    shape('Curva dourada inferior',1090,548,190,172,'primary',{form:'cornerSweep',corner:'br',opacity:.5});
    shape('Curva suave inferior',1094,552,186,168,'background',{form:'cornerSweep',corner:'br',opacity:.82});
    if(services){
      image('logo',80,52,240,110);text('title',80,186,photo?650:hasQr?740:1070,82,46,'primary');
      text('body',80,294,photo?640:hasQr?740:1080,350,32,'primary','Arial','bold',1.3);
      if(photo){shape('Moldura assimétrica',782,74,426,584,'accent',{corners:[78,4,78,4]});const portrait=image('photo',796,88,398,556,0);portrait.corners=[64,2,64,2];}
    }else if(contact){
      if(hasPhoto){shape('Moldura assimétrica',64,76,398,584,'accent',{corners:[74,0,74,0]});const portrait=image('photo',82,94,362,548,0);portrait.corners=[54,0,54,0];}
      image('logo',hasPhoto?500:80,86,hasPhoto?350:300,130);
      text('title',hasPhoto?500:80,300,hasPhoto?418:740,164,58,'primary');
      shape('Assinatura dourada',hasPhoto?500:80,470,150,4,'primary');
      text('body',hasPhoto?500:80,502,hasPhoto?418:740,144,30,'onBackground','Arial','bold',1.3);
      if(hasQr)shape('Área de proteção do QR',952,374,284,284,'background',{radius:18});
    }else{
      if(photo){shape('Moldura assimétrica',64,76,438,568,'accent',{corners:[148,16,16,16]});const portrait=image('photo',78,90,410,540);portrait.corners=[134,8,8,8];}
      const x=photo?570:80,w=photo?620:1040;
      image('logo',x,112,350,158);
      shape('Assinatura dourada',x,302,88,3,'accent');
      text('title',x,350,w,168,50,'primary');text('body',x,552,w,86,25,'onBackground','Arial','normal',1.3);
    }
  }else if(id==='atelier'){
    shape('Linha editorial',80,172,100,3,'accent');
    if(photo){
      const x=services?80:826;
      shape('Moldura areia',x-14,66,388,576,'accent',{radius:180,corners:[194,194,34,34]});const portrait=image('photo',x,80,360,548,170);portrait.corners=[180,180,20,20];
      shape('Linha de assinatura',services?520:80,646,services?666:650,1,'accent');
    }else shape('Respiro circular',1080,50,120,120,'accent',{form:'ellipse',opacity:.2});
    logo(services&&photo?520:80);
    const x=services&&photo?520:80,w=photo?(services?666:650):hasQr?720:1000;
    text('title',x,services?182:224,w,services?116:210,services?54:72,'primary');
    text('body',x,services?328:476,w,services?280:150,services?30:28,'onBackground','Arial','normal',1.4);
  }else if(id==='care'){
    const servicePhoto=services&&photo;
    shape('Acento lateral',0,0,16,720,'primary');
    if(photo){shape('Painel verde',servicePhoto?0:782,0,servicePhoto?470:498,720,'primary');shape('Detalhe superior',servicePhoto?80:820,servicePhoto?174:48,106,7,'accent');shape('Moldura de contato',servicePhoto?72:808,servicePhoto?212:84,servicePhoto?350:400,servicePhoto?424:552,'accent',{radius:32});image('photo',servicePhoto?80:816,servicePhoto?220:92,servicePhoto?334:384,servicePhoto?408:536,26);}
    else{shape('Círculo de apoio',1080,50,120,120,'accent',{form:'ellipse'});shape('Recorte circular',1110,34,88,88,'background',{form:'ellipse'});}
    logo();shape('Marcador',servicePhoto?530:80,176,54,6,'primary');
    text('title',servicePhoto?530:80,services?208:234,photo?(servicePhoto?650:640):hasQr?730:1020,services?100:198,services?52:66,'primary','Arial','bold');
    text('body',servicePhoto?530:80,services?344:476,photo?(servicePhoto?650:624):hasQr?730:990,services?270:148,services?30:29,'onBackground','Arial','normal',1.4);
    shape('Linha de base',80,666,1120,2,'accent');
  }else if(id==='table'){
    if(photo){image('photo',626,0,654,720,0);shape('Divisor quente',614,0,12,720,'accent');}
    shape('Painel gastronômico',0,0,photo?614:1280,720,'primary');
    if(!photo)shape('Selo circular',1020,80,180,180,'accent',{form:'ellipse',opacity:.12});
    logo();shape('Traço de assinatura',80,180,86,3,'accent');
    const w=photo?474:hasQr?744:1050;
    text('title',80,services?216:238,w,services?112:212,services?52:74,'onPrimary',p.font,'normal');
    if(services||contact)shape('Base do texto',64,services?350:480,photo?510:hasQr?788:1130,services?292:148,services?'background':'accent',{radius:18});
    else shape('Sublinhado gastronômico',80,482,76,3,'accent');
    text('body',services||contact?86:80,services?372:522,w-6,services?248:104,services?30:27,services?'onBackground':contact?'onAccent':'onPrimary','Arial','normal',1.4);
  }else if(id==='bold'){
    shape('Painel de impacto',0,0,photo?758:1280,720,'primary');
    shape('Barra amarela',0,0,1280,18,'accent');
    if(photo){shape('Base da fotografia',758,18,522,702,'accent');const portrait=image('photo',802,82,398,546,20);portrait.corners=[64,12,64,12];shape('Rodapé da fotografia',802,648,398,8,'primary');}
    else shape('Bloco de assinatura',1080,60,120,120,'accent',{radius:26});
    logo();shape('Marcador de título',80,174,66,8,'accent');
    const w=photo?622:hasQr?742:1030;
    text('title',80,services?218:236,w,services?112:218,services?56:76,'onPrimary','Arial','bold',1.08);
    if(services)shape('Painel de serviços',64,348,photo?662:hasQr?786:1134,302,'background',{radius:16});
    text('body',services?86:80,services?370:496,services?w-12:w,services?258:142,services?31:29,services?'onBackground':'onPrimary','Arial','normal',1.4);
  }else if(id==='nocturne'){
    shape('Linha superior',80,42,1120,1,'accent',{opacity:.55});shape('Linha inferior',80,677,1120,1,'accent',{opacity:.55});
    if(photo){const x=services?80:804,w=services?382:396;shape('Moldura dourada',x,120,w,514,'accent');shape('Passe-partout',x+2,122,w-4,510,'background');image('photo',x+14,134,w-28,486,0);}
    else{shape('Círculo externo',1080,74,120,120,'accent',{form:'ellipse',opacity:.5});shape('Círculo interno',1081,75,118,118,'background',{form:'ellipse'});}
    const x=services&&photo?520:80,w=photo?(services?660:638):hasQr?732:1060;
    logo(x,66);shape('Traço dourado',x,190,70,2,'accent');
    text('title',x,services?224:252,w,services?110:196,services?52:72,'onBackground',p.font,'normal');
    text('body',x,services?368:494,w,services?264:142,services?29:28,'onBackground','Arial','normal',1.4);
  }else{
    const servicePhoto=services&&photo;
    shape('Disco amarelo',photo?(servicePhoto?120:866):1080,photo?(servicePhoto?154:18):56,photo?364:120,photo?364:120,'accent',{form:'ellipse'});
    if(photo){shape('Moldura azul',servicePhoto?80:796,servicePhoto?220:98,servicePhoto?390:422,servicePhoto?426:544,'primary',{radius:30});image('photo',servicePhoto?96:812,servicePhoto?236:114,servicePhoto?358:390,servicePhoto?394:512,22);}
    shape('Faixa de base',0,690,1280,30,'primary');logo();
    const w=photo?(servicePhoto?644:634):hasQr?732:1030,x=servicePhoto?536:80;
    text('title',x,services?214:236,w,services?114:216,services?54:70,'primary','Arial','bold');
    shape('Sublinhado',x,services?330:456,94,6,'accent');
    text('body',x,services?370:502,w,services?270:142,services?30:28,'onBackground','Arial','normal',1.4);
  }
  if(reference){}
  else if(contact&&!['lumina','serena'].includes(id)){
    // A dedicated contact composition reserves a separate QR tile, without shrinking a portrait after import.
    const title=layers.find(l=>l.role==='title'),body=layers.find(l=>l.role==='body');
    title.x=80;title.y=220;title.w=hasQr?740:hasPhoto?700:1020;title.h=194;
    body.x=80;body.y=470;body.w=title.w;body.h=154;
    const underline=layers.find(l=>l.name==='Sublinhado');
    if(underline){underline.y=442;underline.h=3;}else shape('Linha de encerramento',80,442,96,3,'accent');
    if(id==='table'){const base=layers.find(l=>l.name==='Base do texto');base.x=64;base.y=450;base.w=hasQr?788:hasPhoto?748:1130;base.h=192;}
    if(hasPhoto){shape('Moldura de contato',922,58,290,hasQr?270:556,'accent',{radius:24});image('photo',934,70,266,hasQr?246:532,16);}
    if(hasQr){shape('Área de proteção do QR',952,374,284,284,'background',{radius:16});}
  }else if(hasQr&&!contact){
    const frame=layers.find(l=>l.role==='photo');if(frame&&frame.x+frame.w>980){
      const old={...frame},index=layers.indexOf(frame);
      const backings=layers.slice(0,index).filter(l=>l.type==='shape'&&/Moldura|Passe-partout/.test(l.name)&&l.x<=old.x&&l.x+l.w>=old.x+old.w&&l.y<=old.y&&l.y+l.h>=old.y+old.h);
      frame.y=70;frame.h=262;frame.radius=Math.min(frame.radius,50);if(frame.corners)frame.corners=frame.corners.map(v=>Math.min(v,50));
      // Resize the surrounding frame with the portrait so the QR has its own clear area.
      for(const backing of backings){
        const top=old.y-backing.y,bottom=backing.y+backing.h-old.y-old.h;backing.y=frame.y-top;backing.h=frame.h+top+bottom;if(backing.corners)backing.corners=backing.corners.map(v=>Math.min(v,64));
      }
    }
    shape('Área de proteção do QR',952,374,284,284,'background',{radius:16});
  }
  // A landscape image gets a matching frame inside the same reserved zone.
  // Texts and QR keep their original safe areas, and all frame pieces remain editable.
  const portrait=layers.find(l=>l.role==='photo');
  if(portrait&&photoAspect>=1.3&&id!=='table'&&!reference){
    const old={...portrait},aspect=Math.min(photoAspect,3.2),width=Math.min(old.w,old.h*aspect),height=width/aspect;
    const backings=layers.filter(l=>l.type==='shape'&&/Moldura|Passe-partout/.test(l.name)&&l.x<=old.x&&l.y<=old.y&&l.x+l.w>=old.x+old.w&&l.y+l.h>=old.y+old.h);
    portrait.x=old.x+(old.w-width)/2;portrait.w=width;portrait.y=old.y+(old.h-height)/2;portrait.h=height;portrait.radius=Math.min(portrait.radius,32);
    if(portrait.corners)portrait.corners=portrait.corners.map(v=>Math.min(v,32));
    for(const backing of backings){const top=old.y-backing.y,bottom=backing.y+backing.h-old.y-old.h,left=old.x-backing.x,right=backing.x+backing.w-old.x-old.w;backing.x=portrait.x-left;backing.w=width+left+right;backing.y=portrait.y-top;backing.h=height+top+bottom;backing.radius=Math.min(backing.radius,44);if(backing.corners)backing.corners=backing.corners.map(v=>Math.min(v,44));}
    const footer=layers.find(l=>l.name==='Rodapé da fotografia');if(footer){footer.x=portrait.x;footer.w=portrait.w;footer.y=portrait.y+portrait.h+20;}
  }
  if(!hasLogo){for(let i=layers.length-1;i>=0;i--)if(['logo','logoBase'].includes(layers[i].role))layers.splice(i,1);}
  for(const l of layers.filter(l=>l.type==='shape')){
    if(l.role==='background')setFinish(l,['atelier','lumina'].includes(id)?'paper':'light');
    if(/Moldura/.test(l.name)){setFinish(l,['lumina','nocturne'].includes(id)?'metal':'light');setShadow(l,'soft');}
    if(l.name==='Área de proteção do QR')setShadow(l,'soft');
  }
  return {version:1,type:'cartelas-layout',id:`collection-${id}-${kind}`,name:`${collection.name} · ${kindNames[kind]}`,kind,theme:collection.theme,palette:{...p},layers,...(contact?{contactLayout:{badges:['lumina','care','school','onda','consultorio','oferta'].includes(id),separators:false,strokeWidth:1.4}}:{}),...(services?{serviceLayout:{badges:['lumina','care','school',...REFERENCE_IDS].includes(id),separators:!['vitrine','impacto'].includes(id),strokeWidth:['bold','school','vitrine','impacto'].includes(id)?1.7:1.3}}:{})};
}
export function applyCollection(project,id,{keepIdentity=true}={}){
  const collection=COLLECTIONS.find(c=>c.id===id);if(!collection)throw new Error('Coleção indisponível.');
  const cards=structuredClone(project.cards),palette=keepIdentity?project.palette:{...collection.palette},segment=resolveSegment(project,id);
  for(const c of cards){
    adaptSectionHeading(c,segment);
    const hasPhoto=c.requirements.photo||c.layers.some(l=>l.role==='photo'&&l.assetId);
    const hasQr=c.requirements.qr||c.layers.some(l=>l.role==='qr');
    const asset=project.assets[c.layers.find(l=>l.role==='photo'&&l.assetId)?.assetId];
    const hasLogo=c.requirements.logo||c.layers.some(l=>l.role==='logo'&&l.assetId)||!!project.clientIdentity?.logoAssetId||Object.values(project.assets).some(a=>a.kind==='logo');
    if(!hasLogo)c.layers=c.layers.filter(l=>l.role!=='logo');
    applyTemplate({...project,palette},c,presetTemplate(id,c.kind,{hasPhoto,hasQr,hasLogo,photoAspect:asset?asset.width/asset.height:0}),{keepIdentity});
    protectTemplateContrast(c);
    applyVisualDirection(c);
    c.designCollection=id;
  }
  project.cards=cards;if(!keepIdentity){project.palette=palette;project.theme=collection.theme;}
  return project;
}
export function previewCard(id,kind){
  const template=presetTemplate(id,kind,{hasPhoto:kind!=='contact',hasQr:kind==='contact'});
  const samples={intro:['Sua beleza,\nseu jeito.','Um cuidado pensado para você.'],services:['Cuidado em\ncada detalhe.','• Serviço em destaque\n• Atendimento personalizado\n• Soluções para você'],contact:['Vamos conversar?','Seu telefone\n@seuperfil']};
  if(id==='table'){samples.intro=['Feito para\ndar vontade.','Sabor que reúne bons momentos.'];samples.services=['Escolha seu\nfavorito.','• Especialidade da casa\n• Sabores selecionados\n• Pedidos e encomendas'];}
  if(id==='bold'){samples.intro=['Sua próxima\nboa escolha.','Produtos e serviços para o seu dia.'];samples.services=['Encontre\no que precisa.','• Produto em destaque\n• Opções para você\n• Atendimento próximo'];}
  if(id==='school'){samples.intro=['O futuro\ncomeça aqui.','Conhecimento para novas descobertas.'];samples.services=['Aprender\ne ir além.','• Formação completa\n• Atividades e descobertas\n• Acompanhamento próximo'];}
  if(id==='nocturne'){samples.intro=['Momentos que\nficam.','Detalhes que fazem a diferença.'];samples.services=['Seu evento,\nem cada detalhe.','• Projetos personalizados\n• Produção e decoração\n• Experiências memoráveis'];}
  if(id==='lumina'){samples.intro=['Nome da profissional','HARMONIZAÇÃO FACIAL'];samples.services=['Serviços','• Preenchimento Facial\n• Labial\n• Rinomodelação\n• Bioestimuladores'];}
  if(id==='vitrine'){samples.intro=['Estilo para\ntodo dia.','Novidades toda semana na loja.'];samples.services=['Tudo o que\nvocê procura.','• Moda feminina\n• Moda masculina\n• Calçados e acessórios'];}
  if(id==='onda'){samples.intro=['Tudo para a\nvolta às aulas.','Variedade e carinho em cada detalhe.'];samples.services=['Encontre aqui','• Material escolar\n• Presentes criativos\n• Brinquedos educativos'];}
  if(id==='oferta'){samples.intro=['Quarta da\nPizza!','Todos os sabores em promoção.'];samples.services=['Nosso cardápio','• Pizzas tradicionais\n• Massas artesanais\n• Sobremesas da casa'];}
  if(id==='consultorio'){samples.intro=['Dr. Nome\nSobrenome','Dermatologia clínica e cirúrgica'];samples.services=['Atendimentos','• Consultas e avaliações\n• Procedimentos estéticos\n• Acompanhamento contínuo'];}
  if(id==='impacto'){samples.intro=['Vem treinar\ncom a gente!','Planos a partir de R$ 89'];samples.services=['Estrutura\ncompleta','• Musculação\n• Funcional\n• Avaliação física'];}
  for(const l of template.layers){if(l.role==='title')l.text=samples[kind][0];if(l.role==='body')l.text=samples[kind][1];}
  if(kind==='contact')template.layers.push(qrLayer(null,null));
  const card={layers:template.layers,content:{title:samples[kind][0],body:samples[kind][1]},approved:false};
  if(template.serviceLayout)buildServiceList(card,template.palette,undefined,template.serviceLayout);
  if(template.contactLayout)buildContactList(card,template.palette,undefined,template.contactLayout);
  return card;
}
import {buildServiceList} from './service-list.js';

import {buildContactList} from './contact-list.js';
