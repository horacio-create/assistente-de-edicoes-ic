import test from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTIONS,presetTemplate,applyCollection,colorForToken,contrastRatio} from '../public/design-presets.js';
import {blankProject,parseBrief,composeCard,EXAMPLE,qrLayer,validateProject,assignPhoto} from '../public/core.js';
import {validateTemplate,captureTemplate} from '../public/templates.js';
import {blankClient,applyClientIdentity} from '../public/clients.js';
const make=()=>{const p=blankProject();p.cards=parseBrief(EXAMPLE).cards.map(c=>composeCard(c,p.theme,p.palette));return p;};
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
test('18 composições válidas, com espaços de leitura e fotografia separados e QR reservado',()=>{
  for(const collection of COLLECTIONS)for(const kind of ['intro','services','contact'])for(const hasPhoto of [false,true])for(const hasQr of [false,true]){
    const m=validateTemplate(presetTemplate(collection.id,kind,{hasPhoto,hasQr}));
    for(const l of m.layers)assert.ok(l.x>=0&&l.y>=0&&l.x+l.w<=1280&&l.y+l.h<=720,`${m.name}: ${l.name} fora do quadro`);
    const photo=m.layers.find(l=>l.role==='photo'),title=m.layers.find(l=>l.role==='title'),body=m.layers.find(l=>l.role==='body');
    assert.ok(!overlap(title,body),m.name);if(photo){assert.ok(!overlap(title,photo),m.name);assert.ok(!overlap(body,photo),m.name);}
    if(kind==='contact'&&hasQr){const qr=qrLayer(null,null);assert.ok(!overlap(title,qr),m.name);assert.ok(!overlap(body,qr),m.name);if(photo)assert.ok(!overlap(photo,qr),m.name);}
  }
});
test('coleções preservam conteúdo revisado, QR e materiais, sem inserir exemplos no trabalho',()=>{
  for(const {id} of COLLECTIONS){const p=make();p.cards[0].layers.find(l=>l.role==='title').text='Título revisado';
    p.assets.photo={kind:'photo',name:'Foto',width:1280,height:720,data:'data:image/png;base64,AAAA'};p.cards[0].layers.find(l=>l.role==='photo').assetId='photo';
    const qr=qrLayer(null,null);p.cards[2].layers.push(qr);p.cards.forEach(c=>c.approved=true);applyCollection(p,id,{keepIdentity:false});
    assert.equal(p.cards[0].layers.find(l=>l.role==='title').text,'Título revisado');assert.equal(p.cards[0].layers.find(l=>l.role==='photo').assetId,'photo');assert.equal(p.cards[2].layers.find(l=>l.role==='qr').id,qr.id);assert.ok(p.cards.every(c=>!c.approved));validateProject(p);
    assert.ok(p.cards.every(c=>c.designCollection===id));assert.equal(p.palette.primary,COLLECTIONS.find(c=>c.id===id).palette.primary);
  }
});

test('molduras acompanham a foto quando abertura e serviços reservam área para QR',()=>{
 for(const {id} of COLLECTIONS)for(const kind of ['intro','services']){
  const m=presetTemplate(id,kind,{hasPhoto:true,hasQr:true}),photo=m.layers.find(l=>l.role==='photo');
  if(photo.x+photo.w<=980)continue;
  for(const frame of m.layers.filter(l=>l.type==='shape'&&/Moldura|Passe-partout/.test(l.name)&&l.x>=750))assert.ok(frame.y+frame.h<374,`${id}: moldura invadiu área do QR`);
 }
});
test('identidade conserva contraste semântico, formas e modelos salvos preservam elipses',()=>{
  const p=make();applyCollection(p,'nocturne',{keepIdentity:false});const c=blankClient();c.name='Cliente';c.palette.primary='#eeccdd';c.palette.background='#ffffff';
  applyClientIdentity(p,c);assert.equal(p.cards[0].layers.find(l=>l.role==='title').fill,colorForToken(c.palette,'onBackground'));
  const model=captureTemplate(p,p.cards[2],'Contato');assert.ok(model.layers.some(l=>l.form==='ellipse'));assert.ok(model.layers.some(l=>l.colorToken));validateTemplate(model);
});
test('foto importada após coleção preserva composição e não retorna ao modelo inicial',()=>{
  const p=blankProject();p.cards=parseBrief('Cartela 1 - texto\nApresentação\nTexto complementar').cards.map(c=>composeCard(c,p.theme,p.palette));
  applyCollection(p,'atelier',{keepIdentity:false});const title=structuredClone(p.cards[0].layers.find(l=>l.role==='title'));
  p.assets.photo={kind:'photo',name:'Foto',width:1280,height:720,data:'data:image/png;base64,AAAA'};assignPhoto(p,p.cards[0],'photo');
  const revised=p.cards[0].layers.find(l=>l.role==='title');assert.equal(revised.text,title.text);assert.equal(revised.fill,title.fill);assert.equal(p.cards[0].designCollection,'atelier');assert.equal(p.cards[0].layers.find(l=>l.role==='photo').radius,170);assert.equal(overlap(revised,p.cards[0].layers.find(l=>l.role==='photo')),false);
});
test('adaptação de identidade muito clara ou escura mantém contraste dos textos sobre áreas sólidas',()=>{
  for(const collection of COLLECTIONS)for(const color of ['#ffffff','#111111']){
    const p=make();p.palette={primary:color,accent:color,background:color,font:'Arial'};applyCollection(p,collection.id);
    for(const card of p.cards){const painted=[];for(const l of card.layers){if(l.type==='shape'&&l.opacity===1&&l.form!=='ellipse')painted.push(l);if(l.type==='text'&&l.colorToken){const back=painted.findLast(s=>s.x<=l.x&&s.y<=l.y&&s.x+s.w>=l.x+l.w&&s.y+s.h>=l.y+l.h);if(back)assert.ok(contrastRatio(l.fill,back.fill)>=4.5,`${collection.id} ${l.role}`);}}}
  }
});
