// Collections drawn from real client VTs (folder "Referências Cartelas"): diagonal retail cuts,
// soft waves, promo cards over color, portrait arches and dark high-energy ribbons.
// Photos use shaped frames that crop the material (cover); text never sits on a photo.
import {setShadow} from './finishes.js';

export const REFERENCE_COLLECTIONS=[
  {id:'vitrine',name:'Vitrine',sector:'Varejo e moda',tag:'Corte diagonal',description:'Foto sangrada com corte diagonal e faixa de cor, títulos fortes e lista em painel. Para lojas, moda e comércio em geral.',theme:'contrast',palette:{primary:'#d3263a',accent:'#ffcf3f',background:'#ffffff',font:'Arial'},shapedPhoto:true},
  {id:'onda',name:'Onda',sector:'Papelaria, pet e infantil',tag:'Formas orgânicas',description:'Ondas em duas cores separam a foto do texto. Tons suaves e tipografia arredondada para marcas próximas e acolhedoras.',theme:'essential',palette:{primary:'#d94f78',accent:'#5ec4c7',background:'#fff8f1',font:'Trebuchet MS'},shapedPhoto:true},
  {id:'oferta',name:'Oferta',sector:'Gastronomia e promoções',tag:'Cartão sobre cor',description:'Cartão claro sobre fundo de cor, produto em destaque circular e faixa de promoção. Para cardápios, combos e datas especiais.',theme:'contrast',palette:{primary:'#8e2434',accent:'#f2b53a',background:'#fbf4ea',font:'Arial'},shapedPhoto:true},
  {id:'consultorio',name:'Consultório',sector:'Profissionais de saúde',tag:'Retrato em arco',description:'Retrato em arco com aro de cor, nome em destaque e rodapé de contato. Para médicos, dentistas e consultorias.',theme:'essential',palette:{primary:'#1f3b57',accent:'#7cc3c6',background:'#eef2f4',font:'Georgia'},shapedPhoto:true},
  {id:'impacto',name:'Impacto',sector:'Academias, tecnologia e noite',tag:'Escuro com neon',description:'Fundo escuro, foto com corte diagonal e faixas inclinadas em cor vibrante. Energia para academias, tecnologia e hamburguerias.',theme:'contrast',palette:{primary:'#15181d',accent:'#8ee000',background:'#15181d',font:'Arial'},shapedPhoto:true}
];
export const REFERENCE_IDS=REFERENCE_COLLECTIONS.map(c=>c.id);

// h: {shape,text,image,logo}; options: {kind,hasPhoto,hasQr,hasLogo}
export function buildReferenceLayout(id,{shape,text,image,logo},{kind,hasPhoto,hasQr}){
  const contact=kind==='contact',services=kind==='services',photo=hasPhoto&&!contact,qrArea=()=>{const a=shape('Área de proteção do QR',952,374,284,284,'background',{radius:16});a.fill='#ffffff';delete a.colorToken;setShadow(a,'soft');};
  const bold='bold';
  if(id==='vitrine'){
    if(contact){
      const panel=hasPhoto&&!hasQr?820:hasQr?900:1280;
      shape('Painel diagonal',0,0,panel,720,'primary',panel<1280?{form:'slant',corner:'br'}:{});
      logo(80,56);
      const w=hasQr||hasPhoto?520:1000;
      text('title',80,200,w,170,64,'onPrimary','Arial',bold,1.02);
      shape('Marcador',80,392,96,10,'accent',{form:'slant',corner:'tr'});
      text('body',80,432,w,220,30,'onPrimary','Arial','normal',1.25);
      if(hasPhoto&&hasQr){const p=image('photo',952,56,284,284);p.radius=20;}
      else if(hasPhoto){image('photo',860,0,420,720);}
      if(hasQr)qrArea();
    }else if(services){
      const pw=photo?(hasQr?440:640):0,x=photo?pw+150:80,w=(hasQr?900:1220)-x;
      if(photo){image('photo',0,0,pw,720);shape('Faixa diagonal',pw-168,0,288,720,'primary',{form:'slant',corner:'tl'});shape('Corte diagonal',pw-140,0,260,720,'background',{form:'slant',corner:'tl'});}
      else shape('Bloco diagonal',1000,0,280,180,'primary',{form:'slant',corner:'bl'});
      image('logo',x,48,240,80);
      text('title',x,140,w,116,52,'primary','Arial',bold,1.02);
      shape('Marcador',x,266,96,10,'accent',{form:'slant',corner:'tr'});
      shape('Painel de serviços',x-24,292,w+48,378,'primary',{radius:24});
      text('body',x,314,w,334,28,'onPrimary','Arial',bold,1.25);
    }else{
      const ph=hasQr?330:720;
      if(photo){image('photo',520,0,760,ph);shape('Faixa diagonal',470,0,288,720,'primary',{form:'slant',corner:'br'});shape('Corte diagonal',470,0,260,720,'background',{form:'slant',corner:'br'});}
      else shape('Painel diagonal',780,0,500,hasQr?340:720,'primary',{form:'slant',corner:'bl'});
      image('logo',80,60,300,110);
      shape('Marcador',80,214,110,12,'accent',{form:'slant',corner:'tr'});
      const w=photo?400:hasQr?740:640;
      text('title',80,248,w,250,76,'primary','Arial',bold,1.0);
      text('body',80,526,w,110,28,'onBackground','Arial','normal',1.25);
      if(hasQr)qrArea();
    }
  }else if(id==='onda'){
    const bottomWaves=(x,w)=>{shape('Onda de base',x,632,w,88,'accent',{form:'wave',edge:'top'});shape('Onda de base',x,664,w,56,'primary',{form:'wave',edge:'top'});};
    if(contact){
      const pw=hasPhoto&&!hasQr?380:0,panel=1280-pw;
      if(pw){image('photo',900,0,380,720);shape('Onda de cor',846,0,134,720,'accent',{form:'wave',edge:'right'});shape('Onda clara',846,0,110,720,'background',{form:'wave',edge:'right'});}
      shape('Painel em onda',0,410,hasQr?920:panel-(pw?80:0),310,'primary',{form:'wave',edge:'top'});
      image('logo',80,52,280,100);
      const w=hasQr?740:pw?680:1000;
      text('title',80,190,w,170,62,'primary','Trebuchet MS',bold,1.05);
      text('body',80,480,w,200,30,'onPrimary','Trebuchet MS',bold,1.2);
      if(hasPhoto&&hasQr){const p=image('photo',952,56,284,284);p.radius=142;}
      if(hasQr)qrArea();
    }else if(services){
      const pw=photo?(hasQr?440:540):0,x=photo?pw+130:80,w=(hasQr?900:1220)-x;
      if(photo){image('photo',0,0,pw,720);shape('Onda de cor',pw-60,0,164,720,'accent',{form:'wave',edge:'left'});shape('Onda clara',pw-36,0,140,720,'background',{form:'wave',edge:'left'});}
      else shape('Círculo suave',1010,40,200,200,'accent',{form:'ellipse',opacity:.35});
      image('logo',x,44,220,80);
      text('title',x,142,w,116,52,'primary','Trebuchet MS',bold,1.05);
      text('body',x,280,w,330,28,'onBackground','Trebuchet MS','normal',1.25);
      if(!hasQr)bottomWaves(photo?pw+60:0,photo?1280-pw-60:1280);
      if(hasQr)qrArea();
    }else{
      const ph=hasQr?330:720;
      if(photo){image('photo',620,0,660,ph);shape('Onda de cor',560,0,164,720,'accent',{form:'wave',edge:'right'});shape('Onda clara',560,0,140,720,'background',{form:'wave',edge:'right'});}
      else{shape('Círculo suave',900,40,340,340,'accent',{form:'ellipse',opacity:.35});shape('Círculo de cor',1060,300,150,150,'primary',{form:'ellipse',opacity:.85});}
      image('logo',80,60,300,110);
      const w=photo?470:hasQr?740:760;
      text('title',80,226,w,230,68,'primary','Trebuchet MS',bold,1.04);
      text('body',80,476,w,120,28,'onBackground','Trebuchet MS','normal',1.25);
      if(!hasQr)bottomWaves(0,photo?640:1280);
      if(hasQr)qrArea();
    }
  }else if(id==='oferta'){
    shape('Fundo de cor',0,0,1280,720,'primary');
    const plate=(x,y,size)=>{shape('Aro do produto',x-16,y-16,size+32,size+32,'accent',{form:'ellipse'});const p=image('photo',x,y,size,size);p.radius=size/2;};
    if(contact){
      const w=hasPhoto&&!hasQr?780:1208,card=shape('Cartão',36,36,w,648,'background',{radius:36});setShadow(card,'lifted');
      image('logo',90,72,260,100);
      const tw=hasQr||hasPhoto?640:1080;
      text('title',90,200,tw,150,64,'primary','Arial',bold,1.02);
      shape('Faixa de contato',70,380,tw+40,8,'accent',{radius:4});
      text('body',90,420,tw,220,30,'onBackground','Arial',bold,1.25);
      if(hasPhoto&&hasQr){const p=image('photo',952,64,284,284);p.radius=142;}
      else if(hasPhoto)plate(870,170,380);
      if(hasQr)qrArea();
    }else if(services){
      const left=photo&&!hasQr,x=left?660:90,w=left?1180-x:(hasQr?820:1120);
      const card=shape('Cartão',left?610:36,36,left?634:1208,648,'background',{radius:36});setShadow(card,'lifted');
      if(left)plate(70,130,460);
      else if(photo){const p=image('photo',952,64,284,284);p.radius=142;}
      image('logo',x,64,220,80);
      text('title',x,156,w,110,52,'primary','Arial',bold,1.02);
      shape('Traço de destaque',x,278,90,8,'accent',{radius:4});
      text('body',x,306,w,340,28,'onBackground','Arial','normal',1.25);
      if(hasQr)qrArea();
    }else{
      const w=photo?640:1208,card=shape('Cartão',36,36,w,648,'background',{radius:36});setShadow(card,'lifted');
      if(photo){if(hasQr)plate(760,56,300);else plate(730,120,480);}
      else shape('Círculo de destaque',980,90,220,220,'accent',{form:'ellipse',opacity:.3});
      image('logo',80,70,260,100);
      const tw=photo?556:hasQr?760:1080;
      text('title',80,196,tw,250,76,'primary','Arial',bold,1.0);
      shape('Faixa de promoção',64,478,tw+32,166,'primary',{radius:24});
      text('body',96,500,tw-32,120,30,'onPrimary','Arial',bold,1.2);
      if(hasQr)qrArea();
    }
  }else if(id==='consultorio'){
    const arch=(x,w)=>{shape('Aro de destaque',x-60,40,w+120,w+120,'accent',{form:'ellipse'});shape('Aro interno',x-44,56,w+88,w+88,'background',{form:'ellipse'});const p=image('photo',x,90,w,630);p.corners=[w/2,w/2,0,0];};
    if(contact){
      const pw=hasPhoto&&!hasQr;
      if(pw)arch(880,340);
      shape('Rodapé de contato',0,430,hasQr?900:pw?800:1280,290,'primary',{corners:[0,56,0,0]});
      image('logo',80,52,300,110);
      const w=hasQr?740:pw?660:1000;
      text('title',80,196,w,180,60,'primary','Georgia','normal',1.08);
      text('body',80,474,w,210,30,'onPrimary','Arial',bold,1.25);
      if(hasPhoto&&hasQr){const p=image('photo',952,56,284,284);p.corners=[142,142,18,18];}
      if(hasQr)qrArea();
    }else if(services){
      const left=photo&&!hasQr,x=left?600:80,w=left?620:(hasQr?820:1120);
      if(left)arch(110,380);
      else if(photo){const p=image('photo',952,56,284,284);p.corners=[142,142,18,18];}
      image('logo',x,52,240,84);
      shape('Traço',x,160,80,4,'accent');
      text('title',x,176,w,112,50,'primary','Georgia','normal',1.08);
      text('body',x,306,w,334,28,'onBackground','Arial','normal',1.25);
      if(hasQr)qrArea();
    }else{
      if(photo){if(hasQr){const p=image('photo',952,40,284,300);p.corners=[142,142,18,18];}else arch(800,400);}
      else{shape('Aro de destaque',900,60,320,320,'accent',{form:'ellipse',opacity:.5});shape('Aro interno',916,76,288,288,'background',{form:'ellipse'});}
      image('logo',80,64,320,120);
      shape('Traço',80,226,80,4,'accent');
      const w=photo?620:hasQr?740:760;
      text('title',80,256,w,210,64,'primary','Georgia','normal',1.06);
      text('body',80,492,w,110,28,'onBackground','Arial','normal',1.3);
      if(hasQr)qrArea();
    }
  }else{
    const ribbon=(x,y,w,h)=>shape('Faixa inclinada',x,y,w,h,'accent',{form:'slant',corner:'tr'});
    if(contact){
      const pw=hasPhoto&&!hasQr;
      if(pw){image('photo',820,0,460,720);shape('Faixa neon',730,0,300,720,'accent',{form:'slant',corner:'br'});shape('Corte diagonal',730,0,270,720,'background',{form:'slant',corner:'br'});}
      else if(!hasPhoto)shape('Bloco neon',940,0,340,150,'accent',{form:'slant',corner:'bl'});
      logo(80,56);
      const w=hasQr||pw?620:1000;
      text('title',80,200,w,170,66,'onBackground','Arial',bold,1.0);
      ribbon(64,390,170,14);
      text('body',80,432,w,220,30,'onBackground','Arial',bold,1.25);
      if(hasPhoto&&hasQr){const p=image('photo',952,56,284,284);p.radius=12;}
      if(hasQr)qrArea();
    }else if(services){
      const pw=photo?(hasQr?440:660):0,x=photo?pw+140:80,w=(hasQr?900:1220)-x;
      if(photo){image('photo',0,0,pw,720);shape('Faixa neon',pw-170,0,300,720,'accent',{form:'slant',corner:'tl'});shape('Corte diagonal',pw-140,0,270,720,'background',{form:'slant',corner:'tl'});}
      else shape('Bloco neon',1000,0,280,140,'accent',{form:'slant',corner:'bl'});
      logo(x+12,52);
      text('title',x,150,w,112,52,'onBackground','Arial',bold,1.0);
      ribbon(x,274,150,12);
      text('body',x,314,w,340,28,'onBackground','Arial','normal',1.25);
      if(hasQr)qrArea();
    }else{
      const ph=hasQr?330:720;
      if(photo){image('photo',560,0,720,ph);shape('Faixa neon',490,0,310,720,'accent',{form:'slant',corner:'br'});shape('Corte diagonal',490,0,280,720,'background',{form:'slant',corner:'br'});}
      else shape('Bloco neon',900,0,380,hasQr?300:720,'accent',{form:'slant',corner:'bl'});
      logo(80,60);
      const w=photo?440:hasQr?740:700;
      text('title',80,210,w,260,80,'onBackground','Arial',bold,1.0);
      ribbon(64,496,w+16,124);
      text('body',96,516,w-64,84,28,'onAccent','Arial',bold,1.15);
      if(hasQr)qrArea();
    }
  }
}
